import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const RAW_DIR = process.env.CSN_RAW_DIR || path.resolve('data/codesearchnet/raw');
const OUT_DIR = process.env.CSN_OUT_DIR || path.resolve('data/codesearchnet/processed');
const OUT_FILE = process.env.CSN_OUT_FILE || 'train.prompt_completion.jsonl';
const MAX_SAMPLES = Number(process.env.CSN_MAX_SAMPLES || 0);
const PREFIX_LINES = Number(process.env.CSN_PREFIX_LINES || 20);
const MIN_CODE_LEN = Number(process.env.CSN_MIN_CODE_LEN || 40);

function walk(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      result.push(...walk(full));
    } else {
      result.push(full);
    }
  }
  return result;
}

function buildPromptCompletion(code, language) {
  const lines = code.split('\n');
  if (lines.length < 3) return null;

  const splitAt = Math.max(1, lines.length - Math.min(PREFIX_LINES, Math.floor(lines.length / 2)));
  const prompt = lines.slice(0, splitAt).join('\n').trimEnd();
  const completion = lines.slice(splitAt).join('\n').trim();

  if (!prompt || !completion) return null;

  return {
    prompt: `Continue the following ${language} code:\n${prompt}`,
    completion
  };
}

async function processJsonlFile(filePath, outStream, state) {
  const input = filePath.endsWith('.gz')
    ? fs.createReadStream(filePath).pipe(zlib.createGunzip())
    : fs.createReadStream(filePath);

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    const code = row.code || row.original_string || '';
    if (typeof code !== 'string' || code.length < MIN_CODE_LEN) continue;
    const language = row.language || 'unknown';
    const pair = buildPromptCompletion(code, language);
    if (!pair) continue;

    outStream.write(`${JSON.stringify(pair)}\n`);
    state.written += 1;
    if (MAX_SAMPLES > 0 && state.written >= MAX_SAMPLES) return;
  }
}

async function main() {
  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`Raw directory not found: ${RAW_DIR}`);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = walk(RAW_DIR).filter((f) => /train.*\.jsonl(\.gz)?$/i.test(path.basename(f)));
  if (files.length === 0) {
    throw new Error(`No train jsonl files found under ${RAW_DIR}`);
  }

  const outPath = path.join(OUT_DIR, OUT_FILE);
  const outStream = fs.createWriteStream(outPath, { encoding: 'utf8' });
  const state = { written: 0 };

  for (const file of files) {
    await processJsonlFile(file, outStream, state);
    if (MAX_SAMPLES > 0 && state.written >= MAX_SAMPLES) break;
  }
  outStream.end();

  console.log(`Done. Wrote ${state.written} samples to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
