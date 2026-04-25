const vscode = require('vscode');

let suggestionEngine = null;
let lastOnlineMessageAt = 0;

function readInputBeforeCursor(document, position, maxLines = 120) {
  const startLine = Math.max(0, position.line - maxLines);
  const start = new vscode.Position(startLine, 0);
  const range = new vscode.Range(start, position);
  return document.getText(range);
}

async function getEngine() {
  if (suggestionEngine) return suggestionEngine;

  const lib = await import('@syamaitech/inline-suggestion');
  suggestionEngine = lib.createDebouncedSuggester({
    delayMs: 500,
    onOnline: () => {
      const now = Date.now();
      if (now - lastOnlineMessageAt < 15000) return;
      lastOnlineMessageAt = now;
      vscode.window.showInformationMessage(
        'Internet connection detected. Local inline suggestion is disabled.'
      );
    }
  });

  return suggestionEngine;
}

function activate(context) {
  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    {
      async provideInlineCompletionItems(document, position, completionContext, token) {
        if (token.isCancellationRequested) return { items: [] };

        const inputCode = readInputBeforeCursor(document, position);
        if (!inputCode.trim()) return { items: [] };

        try {
          const engine = await getEngine();
          const suggestion = await engine.suggest(inputCode);

          if (!suggestion || !suggestion.trim() || token.isCancellationRequested) {
            return { items: [] };
          }

          const item = new vscode.InlineCompletionItem(
            suggestion,
            new vscode.Range(position, position)
          );

          return { items: [item] };
        } catch (error) {
          console.error('Inline suggestion error:', error);
          return { items: [] };
        }
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
