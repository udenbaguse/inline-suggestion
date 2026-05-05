# @syamaitech/inline-suggestion

Offline-first inline code suggestion engine for Node.js apps with local Ollama.

## Prerequisites

1. Node.js 18+ (recommended latest LTS).
2. npm.
3. Ollama installed and running locally (`http://127.0.0.1:11434`).
4. Local model tersedia, default: `phi3:mini`.

## Installation

```bash
npm i @syamaitech/inline-suggestion
```

## Setup In Your App

Create your suggester instance in your app/editor integration code (for example `src/ai-suggester.js`):

```js
import { createDebouncedSuggester } from '@syamaitech/inline-suggestion';

export const suggester = createDebouncedSuggester({
  delayMs: 500,
  onOnline: (message) => console.info(message)
});
```

Then call it when user typing stops:

```js
import { suggester } from './ai-suggester.js';

const suggestion = await suggester.suggest('function sum(a, b) {');
console.log(suggestion);
```

## First Run Behavior

1. `npm i` installs package and dependencies.
2. Package melakukan validasi bahwa Ollama lokal aktif.
3. Package mengecek model `phi3:mini` tersedia di Ollama.
4. Jika model belum ada, jalankan `ollama pull phi3:mini`.

## Behavior

1. Debounce 500ms before generating suggestion.
2. Uses local AI model via Ollama (`phi3:mini` default) when offline.
3. If internet is detected, returns `null` and triggers `onOnline` callback.

## Quick Local Test

Create `test-suggest.js`:

```js
import { createDebouncedSuggester } from '@syamaitech/inline-suggestion';

const suggester = createDebouncedSuggester({
  delayMs: 500,
  onOnline: console.log
});

const result = await suggester.suggest('function add(a, b) {');
console.log('Suggestion:', result);
```

Run:

```bash
node test-suggest.js
```

## Troubleshooting

1. If result is always `null`, check internet status. Package is designed to skip local suggestion when online.
2. If error says model not found, run `ollama pull phi3:mini`.
3. If error says cannot connect to Ollama, make sure service is running.

## Environment Variables

1. `INLINE_SUGGESTION_MODEL_ID` default: `phi3:mini`
2. `INLINE_SUGGESTION_OLLAMA_URL` default: `http://127.0.0.1:11434`
3. `INLINE_SUGGESTION_OLLAMA_TIMEOUT_MS` default: `30000`

## CodeSearchNet Dataset Prep

1. Download CodeSearchNet from S3 (Windows-friendly):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-codesearchnet.ps1
```

2. Convert raw data to finetune format (`prompt/completion`):

```bash
node scripts/prepare-codesearchnet.js
```
