const vscode = require('vscode');
let activeRequest = 0;

function readInputBeforeCursor(document, position, maxLines = 120) {
  const startLine = Math.max(0, position.line - maxLines);
  const start = new vscode.Position(startLine, 0);
  const range = new vscode.Range(start, position);
  return document.getText(range);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSimpleSuggestion(inputCode) {
  const lines = inputCode.split(/\r?\n/);
  const last = (lines[lines.length - 1] || '').trim();

  if (last.endsWith('{')) return '\n  \n}';
  if (/console\.$/.test(last)) return 'log()';
  if (/for\s*\([^)]*$/.test(last)) return '; ; ) {\n  \n}';
  if (/if\s*\([^)]*$/.test(last)) return ') {\n  \n}';
  if (last.length < 3) return null;
  return '\n// continue';
}

function activate(context) {
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

  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    {
      async provideInlineCompletionItems(document, position, completionContext, token) {
        const requestId = ++activeRequest;
        await sleep(500);

        if (requestId !== activeRequest) return { items: [] };
        if (token.isCancellationRequested) return { items: [] };

        const inputCode = readInputBeforeCursor(document, position);
        if (!inputCode.trim()) return { items: [] };

        const suggestion = buildSimpleSuggestion(inputCode);

        if (!suggestion || !suggestion.trim() || token.isCancellationRequested) {
          return { items: [] };
        }

        const item = new vscode.InlineCompletionItem(
          suggestion,
          new vscode.Range(position, position)
        );

        return { items: [item] };
      }
    }
  );
  context.subscriptions.push(provider);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
