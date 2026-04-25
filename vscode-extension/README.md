# VS Code Integration

This folder is a development extension that uses the npm package
`@syamaitech/inline-suggestion`.

## Run

1. Open folder `vscode-extension` in VS Code.
2. Run `npm install`.
3. Press `F5` to launch Extension Development Host.

## Behavior

1. Inline completion appears under cursor.
2. Suggestions are debounced by 500ms.
3. Press `Tab` to accept suggestion.
4. If internet is available, no suggestion appears and an info message is shown.
