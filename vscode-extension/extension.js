const vscode = require('vscode');

let suggesterPromise = null;
let lastOnlineNoticeAt = 0;
let triggerTimer = null;
let statusTimer = null;
const IDLE_MS = 500;
const lastEditAtByDoc = new Map();
let inFlight = null;
let lastKey = '';
let lastValue = '';
let isOfflineMode = true;

function readInputBeforeCursor(document, position, maxLines = 120) {
  const startLine = Math.max(0, position.line - maxLines);
  const start = new vscode.Position(startLine, 0);
  const range = new vscode.Range(start, position);
  return document.getText(range);
}

function trimOverlap(existingText, suggestionText) {
  const existing = String(existingText || '');
  const suggestion = String(suggestionText || '');
  const max = Math.min(existing.length, suggestion.length);
  for (let i = max; i > 0; i--) {
    if (existing.slice(-i) === suggestion.slice(0, i)) {
      return suggestion.slice(i);
    }
  }
  return suggestion;
}

function normalizeSuggestion(existingText, suggestionText) {
  const existing = String(existingText || '');
  const suggestion = String(suggestionText || '');

  let out = trimOverlap(existing, suggestion).trimStart();
  if (!out && suggestion.startsWith(existing)) {
    out = suggestion.slice(existing.length).trimStart();
  }
  if (!out) {
    const tail = existing.slice(-180);
    const idx = tail ? suggestion.lastIndexOf(tail) : -1;
    if (idx >= 0) {
      out = suggestion.slice(idx + tail.length).trimStart();
    }
  }
  if (!out) {
    const lines = suggestion.split('\n');
    if (lines.length > 1) {
      // Heuristic fallback: keep continuation-looking lines only.
      out = lines
        .slice(1)
        .join('\n')
        .trimStart();
    }
  }
  if (!out) return '';
  if (out.startsWith('```')) {
    out = out.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trimStart();
  }
  return out;
}

async function getSuggester() {
  if (suggesterPromise) return suggesterPromise;

  suggesterPromise = import('./src/index.js').then(({ createDebouncedSuggester }) => {
    return createDebouncedSuggester({
      delayMs: 0,
      allowWhenOnline: false,
      onOnline: (message) => {
        const now = Date.now();
        // Avoid spamming notifications while user is typing.
        if (now - lastOnlineNoticeAt > 10000) {
          lastOnlineNoticeAt = now;
          vscode.window.setStatusBarMessage(`Inline Suggestion: ${message}`, 2500);
        }
      }
    });
  });

  return suggesterPromise;
}

async function checkModelHealth() {
  try {
    const modelModule = await import('./src/model.js');
    const installed = modelModule.isModelInstalled();
    return installed
      ? { ok: true, message: 'MODEL INSTALLED' }
      : { ok: false, message: 'MODEL NOT INSTALLED' };
  } catch (error) {
    return { ok: false, message: `MODEL ERROR: ${error?.message || String(error)}` };
  }
}

function toInlinePreview(suggestionText) {
  const raw = String(suggestionText || '');
  const firstLine = raw.split('\n')[0] || '';
  return firstLine.slice(0, 180).trimStart();
}

function buildSafeStub(document, position) {
  const lineText = document.lineAt(position.line).text;
  const prefix = lineText.slice(0, position.character);
  if (/^\s*$/.test(prefix)) return '// continue';
  if (/\s$/.test(prefix)) return '// continue';
  return ' // continue';
}

function activate(context) {
  const output = vscode.window.createOutputChannel('Inline Suggestion Local');
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = 'Inline Suggestion Local Status';
  statusItem.show();

  const refreshStatus = async () => {
    try {
      const { checkInternetConnection } = await import('./src/connection.js');
      const isOnline = await checkInternetConnection();

      if (isOnline) {
        isOfflineMode = false;
        statusItem.text = '$(cloud) Inline Suggest: ONLINE (disabled)';
        statusItem.tooltip = 'Inline suggestion is disabled while internet is connected.';
        return;
      }
      isOfflineMode = true;

      const model = await checkModelHealth();
      if (model.ok) {
        statusItem.text = '$(vm-active) Inline Suggest: OFFLINE | MODEL READY';
        statusItem.tooltip = 'Offline mode active. Transformers model is installed.';
      } else {
        statusItem.text = '$(warning) Inline Suggest: OFFLINE | MODEL NOT INSTALLED';
        statusItem.tooltip = 'Run "Inline Suggestion: Install Model" from Command Palette.';
      }
    } catch (error) {
      statusItem.text = '$(warning) Inline Suggest: STATUS ERROR';
      statusItem.tooltip = error?.message || String(error);
    }
  };

  const inlineSuggestEnabled = vscode.workspace
    .getConfiguration('editor')
    .get('inlineSuggest.enabled', false);

  if (!inlineSuggestEnabled) {
    vscode.window
      .showWarningMessage(
        'Inline Suggest is disabled. Enable it to see local inline suggestions.',
        'Enable'
      )
      .then(async (action) => {
        if (action === 'Enable') {
          await vscode.workspace
            .getConfiguration('editor')
            .update('inlineSuggest.enabled', true, vscode.ConfigurationTarget.Global);
        }
      });
  }

  // Trigger inline suggestion automatically after user stops typing for 500ms.
  const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    if (event.document.uri.toString() !== activeEditor.document.uri.toString()) return;
    if (!event.contentChanges || event.contentChanges.length === 0) return;
    lastEditAtByDoc.set(event.document.uri.toString(), Date.now());

    if (triggerTimer) clearTimeout(triggerTimer);
    triggerTimer = setTimeout(() => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    }, IDLE_MS);
  });

  async function fetchSuggestion(inputCode, position, document, token) {
    const docKey = document.uri.toString();
    const idleMs = Date.now() - (lastEditAtByDoc.get(docKey) || 0);
    if (idleMs < IDLE_MS - 20) {
      output.appendLine(`[skip] not idle yet (${idleMs}ms)`);
      return '';
    }

    const queryKey = `${docKey}:${position.line}:${position.character}:${inputCode.slice(-400)}`;
    if (queryKey === lastKey && lastValue) {
      output.appendLine('[cache] reuse last suggestion');
      return lastValue;
    }

    if (inFlight) {
      output.appendLine('[skip] previous generation still in-flight');
      return '';
    }
    output.appendLine(
      `[request] lang=${document.languageId} line=${position.line + 1} col=${position.character + 1}`
    );

    const suggester = await getSuggester();
    inFlight = suggester.suggest(inputCode);
    const suggestion = await inFlight;
    inFlight = null;

    let normalized = normalizeSuggestion(inputCode, suggestion);
    if ((!normalized || !normalized.trim()) && suggestion && suggestion.trim()) {
      normalized = suggestion.trim();
      output.appendLine('[fallback] using raw suggestion because normalized was empty');
    }
    if (!normalized || !normalized.trim() || token?.isCancellationRequested) {
      output.appendLine(`[result] empty suggestion (rawLen=${(suggestion || '').length})`);
      return '';
    }

    output.appendLine(`[result] suggestion length=${suggestion.length}, normalized=${normalized.length}`);
    lastKey = queryKey;
    lastValue = normalized;
    return normalized;
  }

  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    {
      async provideInlineCompletionItems(document, position, completionContext, token) {
        if (token.isCancellationRequested) return { items: [] };
        if (!isOfflineMode) {
          return { items: [] };
        }

        const inputCode = readInputBeforeCursor(document, position);
        if (!inputCode.trim()) return { items: [] };
        try {
          const normalized = await fetchSuggestion(inputCode, position, document, token);
          let inlineText = toInlinePreview(normalized);
          if (!inlineText) {
            inlineText = buildSafeStub(document, position);
            output.appendLine('[fallback] using safe stub inline text');
          }

          const item = new vscode.InlineCompletionItem(
            inlineText,
            new vscode.Range(position, position)
          );

          return { items: [item] };
        } catch (error) {
          inFlight = null;
          output.appendLine(`Inline suggestion failed: ${error?.message || String(error)}`);
          console.error('Inline suggestion failed:', error?.message || error);
          return { items: [] };
        }
      }
    }
  );

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { pattern: '**' },
    {
      async provideCompletionItems(document, position, token) {
        if (!isOfflineMode) return [];
        const inputCode = readInputBeforeCursor(document, position);
        if (!inputCode.trim()) return [];
        try {
          const suggestion = await fetchSuggestion(inputCode, position, document, token);
          if (!suggestion) return [];
          const item = new vscode.CompletionItem(
            'Inline Suggestion',
            vscode.CompletionItemKind.Snippet
          );
          item.insertText = suggestion;
          item.detail = 'Offline local suggestion (Transformers)';
          item.sortText = '\u0000';
          item.filterText = '';
          item.preselect = true;
          return [item];
        } catch (error) {
          output.appendLine(`Completion provider failed: ${error?.message || String(error)}`);
          return [];
        }
      }
    }
  );
  const debugCommand = vscode.commands.registerCommand(
    'inlineSuggestionLocalDev.debugSuggest',
    async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('No active editor.');
          return;
        }
        const inputCode = readInputBeforeCursor(editor.document, editor.selection.active);
        if (!inputCode.trim()) {
          vscode.window.showWarningMessage('No input code before cursor.');
          return;
        }

        const { generateCodeSuggestion } = await import('./src/model.js');
        const raw = await generateCodeSuggestion(inputCode);
        const preview = raw?.slice(0, 300) || '';
        output.appendLine(`[debug] raw suggestion: ${JSON.stringify(raw)}`);
        vscode.window.showInformationMessage(
          preview ? `Debug suggestion: ${preview}` : 'Debug suggestion is empty.'
        );
      } catch (error) {
        output.appendLine(`[debug] error: ${error?.message || String(error)}`);
        vscode.window.showErrorMessage(`Debug failed: ${error?.message || String(error)}`);
      }
    }
  );
  const installModelCommand = vscode.commands.registerCommand(
    'inlineSuggestionLocalDev.installModel',
    async () => {
      try {
        const { initializeCodeModel, getModelId, resetLoadedModel } = await import('./src/model.js');
        resetLoadedModel();
        vscode.window.showInformationMessage(`Installing model ${getModelId()}...`);
        await initializeCodeModel();
        await refreshStatus();
        vscode.window.showInformationMessage('Model installed and ready.');
      } catch (error) {
        vscode.window.showErrorMessage(`Install model failed: ${error?.message || String(error)}`);
      }
    }
  );
  const killModelCommand = vscode.commands.registerCommand(
    'inlineSuggestionLocalDev.killModel',
    async () => {
      try {
        const answer = await vscode.window.showWarningMessage(
          'Delete local model cache?',
          { modal: true },
          'Delete'
        );
        if (answer !== 'Delete') return;
        const { clearModelCache, resetLoadedModel } = await import('./src/model.js');
        clearModelCache();
        resetLoadedModel();
        suggesterPromise = null;
        await refreshStatus();
        vscode.window.showInformationMessage('Model cache deleted.');
      } catch (error) {
        vscode.window.showErrorMessage(`Kill model failed: ${error?.message || String(error)}`);
      }
    }
  );
  refreshStatus();
  statusTimer = setInterval(refreshStatus, 8000);

  context.subscriptions.push(
    provider,
    completionProvider,
    debugCommand,
    installModelCommand,
    killModelCommand,
    changeListener,
    output,
    statusItem,
    { dispose: () => statusTimer && clearInterval(statusTimer) }
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
