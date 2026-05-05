const MODEL_ID = process.env.INLINE_SUGGESTION_MODEL_ID || 'phi3:mini';
const OLLAMA_BASE_URL = (process.env.INLINE_SUGGESTION_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_TIMEOUT_MS = Number(process.env.INLINE_SUGGESTION_OLLAMA_TIMEOUT_MS || 30000);

let initializationPromise = null;

function formatError(error) {
  const message = error?.message ?? String(error);
  const cause = error?.cause?.message ? ` | cause: ${error.cause.message}` : '';
  return `${message}${cause}`;
}

function timeoutPromise(ms, promise) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]);
}

async function fetchJson(pathname, body) {
  const response = await timeoutPromise(
    OLLAMA_TIMEOUT_MS,
    fetch(`${OLLAMA_BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
}

/**
 * Initialize ollama connectivity and validate model availability once.
 * @returns {Promise<boolean>}
 */
export async function initializeCodeModel() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const tagsResponse = await timeoutPromise(
        OLLAMA_TIMEOUT_MS,
        fetch(`${OLLAMA_BASE_URL}/api/tags`)
      );
      if (!tagsResponse.ok) {
        const text = await tagsResponse.text();
        throw new Error(`Cannot connect to Ollama tags API. HTTP ${tagsResponse.status}: ${text}`);
      }
      const tags = await tagsResponse.json();
      const models = Array.isArray(tags?.models) ? tags.models : [];
      const available = models.some((m) => m?.name === MODEL_ID || m?.model === MODEL_ID);
      if (!available) {
        throw new Error(`Model "${MODEL_ID}" not found in local Ollama. Run: ollama pull ${MODEL_ID}`);
      }
      return true;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * Generate code continuation from current input text.
 * @param {string} inputCode
 * @returns {Promise<string>}
 */
export async function generateCodeSuggestion(inputCode) {
  try {
    await initializeCodeModel();
    const prompt = `Continue the following code with correct syntax:\n${inputCode}`;
    const result = await fetchJson('/api/generate', {
      model: MODEL_ID,
      prompt,
      stream: false,
      options: {
        num_predict: 50,
        temperature: 0.2
      }
    });

    return String(result?.response || '')
      .replace(prompt, '')
      .trim()
      .replace(/^[\n\s]+/, '')
      .replace(/[\n\s]+$/, '');
  } catch (error) {
    // Re-throw with more context
    throw new Error(`Failed to generate code suggestion: ${formatError(error)}`);
  }
}

export function getModelCacheDir() {
  return null;
}

export function getModelId() {
  return MODEL_ID;
}

export function resetLoadedModel() {
  initializationPromise = null;
}

export function clearModelCache() {
  resetLoadedModel();
  return false;
}
