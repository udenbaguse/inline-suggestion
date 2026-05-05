# VS Code Integration

This folder is a VS Code extension for inline suggestion using local Ollama model (`phi3:mini` by default).

## Run

1. Open folder `vscode-extension` in VS Code.
2. Run `npm install`.
3. Make sure Ollama is running in local machine (`http://127.0.0.1:11434`).
4. Make sure model exists: `ollama pull phi3:mini`.
5. Press `F5` to launch Extension Development Host.

## Behavior

1. Inline completion appears under cursor.
2. Suggestions are debounced by 500ms.
3. Press `Tab` to accept suggestion.
4. If internet is available, extension does not generate suggestions (offline-only behavior).
