import { initializeCodeModel, generateCodeSuggestion } from './model.js';
import { checkInternetConnection } from './connection.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a local code suggestion only when offline.
 * @param {string} inputCode
 * @param {{ onOnline?: (message: string) => void }} [options]
 * @returns {Promise<string | null>}
 */
export async function getCodeSuggestion(inputCode, options = {}) {
  const { onOnline } = options;
  const hasInternet = await checkInternetConnection();
  if (hasInternet) {
    if (typeof onOnline === 'function') {
      onOnline('Internet connection detected. Local suggestion is disabled.');
    }
    return null;
  }

  try {
    return await generateCodeSuggestion(inputCode);
  } catch (error) {
    console.error('Failed to get code suggestion:', error.message);
    return null;
  }
}

/**
 * Create a debounced suggester for editor integrations.
 * Call `suggest(inputCode)` on each typing update.
 * @param {{ delayMs?: number, onOnline?: (message: string) => void }} [options]
 * @returns {{ suggest: (inputCode: string) => Promise<string | null> }}
 */
export function createDebouncedSuggester(options = {}) {
  const { delayMs = 500, onOnline } = options;
  let activeRequest = 0;

  return {
    async suggest(inputCode) {
      const requestId = ++activeRequest;
      await sleep(delayMs);
      if (requestId !== activeRequest) return null;
      return getCodeSuggestion(inputCode, { onOnline });
    }
  };
}

export { initializeCodeModel, checkInternetConnection, generateCodeSuggestion };
