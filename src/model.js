import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODEL_ID = 'Xenova/codegen-350M-mono';
const REMOTE_HOSTS = ['https://huggingface.co/', 'https://hf-mirror.com/'];
const CACHE_DIR =
  process.env.INLINE_SUGGESTION_CACHE_DIR ||
  path.join(os.homedir(), '.inline-suggestion-cache', 'transformers');
const LOCAL_MODEL_ONNX = path.join(
  CACHE_DIR,
  'Xenova',
  'codegen-350M-mono',
  'onnx',
  'decoder_model_merged_quantized.onnx'
);

// Runtime config for model loading and caching.
env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.progress_bar = true;

let codeGenerator = null;

function formatError(error) {
  const message = error?.message ?? String(error);
  const cause = error?.cause?.message ? ` | cause: ${error.cause.message}` : '';
  return `${message}${cause}`;
}


/**
 * Initialize the model pipeline once. On first use, required files are
 * downloaded and cached automatically.
 * @returns {Promise<Object>}
 */
export async function initializeCodeModel() {
  if (codeGenerator) return codeGenerator;

  // If local model cache exists, force offline loading and avoid DNS/network errors.
  if (fs.existsSync(LOCAL_MODEL_ONNX)) {
    env.allowRemoteModels = false;
    codeGenerator = await pipeline('text-generation', MODEL_ID, {
      quantized: true,
      device: 'auto'
    });
    return codeGenerator;
  }

  const attemptErrors = [];

  for (const host of REMOTE_HOSTS) {
    try {
      env.remoteHost = host;
      codeGenerator = await pipeline('text-generation', MODEL_ID, {
        quantized: true,
        device: 'auto'
      });
      return codeGenerator;
    } catch (error) {
      attemptErrors.push(`${host} -> ${formatError(error)}`);
    }
  }

  throw new Error(
    `Failed to initialize model "${MODEL_ID}". Attempts: ${attemptErrors.join(' || ')}`
  );
}

/**
 * Generate code continuation from current input text.
 * @param {string} inputCode
 * @returns {Promise<string>}
 */
export async function generateCodeSuggestion(inputCode) {
  const generator = await initializeCodeModel();
  const prompt = `Continue the following code with correct syntax:\n${inputCode}`;

  const result = await generator(prompt, {
    max_new_tokens: 50,
    temperature: 0.2,
    do_sample: false,
    return_full_text: true
  });

  return result[0].generated_text
    .replace(prompt, '')
    .trim()
    .replace(/^[\n\s]+/, '')
    .replace(/[\n\s]+$/, '');
}
