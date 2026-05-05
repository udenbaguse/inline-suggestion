import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODEL_ID = process.env.INLINE_SUGGESTION_MODEL_ID || 'Xenova/codegen-350M-mono';
const CACHE_DIR =
  process.env.INLINE_SUGGESTION_CACHE_DIR ||
  path.join(os.homedir(), '.inline-suggestion-cache', 'transformers');
const MODEL_CACHE_PATH = path.join(CACHE_DIR, ...MODEL_ID.split('/'));
const LOCAL_MODEL_ONNX = path.join(
  MODEL_CACHE_PATH,
  'onnx',
  'decoder_model_merged_quantized.onnx'
);

env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.progress_bar = true;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

let codeGenerator = null;
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

function sanitize(text) {
  let out = String(text || '').trim();
  const fenced = out.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
  if (fenced?.[1]) out = fenced[1].trim();
  return out.replace(/^[\n\s]+/, '').replace(/[\n\s]+$/, '');
}

export function isModelInstalled() {
  return fs.existsSync(LOCAL_MODEL_ONNX);
}

export async function initializeCodeModel() {
  if (initializationPromise) return initializationPromise;
  if (codeGenerator) return codeGenerator;

  initializationPromise = (async () => {
    try {
      codeGenerator = await timeoutPromise(
        120000,
        pipeline('text-generation', MODEL_ID, {
          quantized: true,
          device: 'auto'
        })
      );
      return codeGenerator;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

export async function generateCodeSuggestion(inputCode) {
  try {
    const generator = await initializeCodeModel();
    const prompt = `Continue the following code with correct syntax:\n${inputCode}`;
    const result = await generator(prompt, {
      max_new_tokens: 50,
      temperature: 0.2,
      do_sample: false,
      return_full_text: true
    });

    const raw = result?.[0]?.generated_text ?? '';
    const cleaned = sanitize(raw.replace(prompt, ''));
    return cleaned;
  } catch (error) {
    throw new Error(`Failed to generate code suggestion: ${formatError(error)}`);
  }
}

export function getModelCacheDir() {
  return CACHE_DIR;
}

export function getModelId() {
  return MODEL_ID;
}

export function resetLoadedModel() {
  codeGenerator = null;
  initializationPromise = null;
}

export function clearModelCache() {
  resetLoadedModel();
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  }
}
