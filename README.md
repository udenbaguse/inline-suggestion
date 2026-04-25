# @syamaitech/inline-suggestion

Offline-first inline code suggestion engine for Node.js apps.

## Prerequisites

1. Node.js 18+ (recommended latest LTS).
2. npm.
3. Internet connection for first model download.

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
2. AI model is downloaded on first `suggest(...)` call (not during `npm i`).
3. Model is cached locally and reused on next runs.
4. Typical first-time bandwidth can be around 400-500 MB (package + model + overhead).

## Behavior

1. Debounce 500ms before generating suggestion.
2. Uses local AI model when offline.
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
2. If first run is slow, wait for model download and conversion cache creation.
3. If download fails, retry with stable network and run again.
