import fs from 'node:fs';
import path from 'node:path';

const DATASET = process.env.CSN_HF_DATASET || 'code-search-net/code_search_net';
const CONFIG = process.env.CSN_HF_CONFIG || 'python';
const SPLIT = process.env.CSN_HF_SPLIT || 'train';
const MAX_SAMPLES = Number(process.env.CSN_MAX_SAMPLES || 5000);
const BATCH = Number(process.env.CSN_BATCH_SIZE || 100);
const OUT_DIR = process.env.CSN_OUT_DIR || path.resolve('data/codesearchnet/processed');
const OUT_FILE =
  process.env.CSN_OUT_FILE || `${CONFIG}_${SPLIT}_prompt_completion.jsonl`;
const HF_TOKEN = process.env.HF_TOKEN || '';
const MAX_RETRIES = Number(process.env.CSN_MAX_RETRIES || 8);

function toPair(code, language) {
  const text = String(code || '').trim();
  if (!text) return null;
  const lines = text.split('\n');
  if (lines.length < 3) return null;

  const splitAt = Math.max(1, Math.floor(lines.length * 0.6));
  const promptBody = lines.slice(0, splitAt).join('\n').trimEnd();
  const completion = lines.slice(splitAt).join('\n').trim();
  if (!promptBody || !completion) return null;

  return {
    prompt: `Continue the following ${language} code:\n${promptBody}`,
    completion
  };
}

async function fetchRows(offset, length) {
  const url = new URL('https://datasets-server.huggingface.co/rows');
  url.searchParams.set('dataset', DATASET);
  url.searchParams.set('config', CONFIG);
  url.searchParams.set('split', SPLIT);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('length', String(length));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const headers = { 'user-agent': 'inline-suggestion-dataset-builder/1.0' };
    if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;

    const res = await fetch(url, { headers });
    if (res.ok) return res.json();

    const body = await res.text();
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const delayMs = Math.min(30000, 1000 * Math.pow(2, attempt));
      console.warn(`Rate limited (429). Retry in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    throw new Error(`HTTP ${res.status} from HF rows API: ${body}`);
  }
  throw new Error('Failed to fetch rows after retries.');
}

function extractCodeRow(raw) {
  return (
    raw?.code ||
    raw?.original_string ||
    raw?.whole_func_string ||
    raw?.function ||
    ''
  );
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, OUT_FILE);
  const out = fs.createWriteStream(outPath, { encoding: 'utf8' });

  let offset = 0;
  let written = 0;
  while (written < MAX_SAMPLES) {
    const remaining = MAX_SAMPLES - written;
    const length = Math.min(BATCH, remaining);
    const json = await fetchRows(offset, length);
    const rows = Array.isArray(json?.rows) ? json.rows : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const r = row?.row || {};
      const pair = toPair(extractCodeRow(r), r.language || CONFIG);
      if (!pair) continue;
      out.write(`${JSON.stringify(pair)}\n`);
      written += 1;
      if (written >= MAX_SAMPLES) break;
    }

    offset += rows.length;
    if (rows.length < length) break;
    if (offset % 1000 === 0) {
      console.log(`Progress: offset=${offset}, written=${written}`);
    }
  }

  out.end();
  console.log(`Done. Wrote ${written} samples to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
