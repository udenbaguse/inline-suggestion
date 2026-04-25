# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-25

### Added
1. Offline-first local AI suggestion flow using `@xenova/transformers`.
2. Automatic model initialization and caching in `src/model.js`.
3. Host fallback strategy for model download:
   - `https://huggingface.co/`
   - `https://hf-mirror.com/`
4. NPM-facing API in `src/index.js`:
   - `getCodeSuggestion(inputCode, options)`
   - `createDebouncedSuggester({ delayMs, onOnline })`
5. Root documentation in `README.md` with:
   - Full installation guide
   - First-run model download behavior
   - Bandwidth estimate
   - Quick local test and troubleshooting
6. Development VS Code extension scaffold in `vscode-extension/` for inline integration testing.

### Changed
1. `package.json` updated for package consumption:
   - `main` -> `./src/index.js`
   - `exports` entry added
   - publish files list updated
   - description improved
2. `src/connection.js` fixed import style for `is-online`.
3. `src/index.js` import path fixed (`./connection.js`) and error handling improved.
4. `src/model.js` refactored and stabilized for reusable initialization flow.

### Fixed
1. JSON parse issue in `package.json` (`files` field formatting).
2. Multiple syntax/runtime issues in `src/model.js` (template string usage and pipeline config structure).
3. Broken internal import path (`connection-check.js` -> `connection.js`).
