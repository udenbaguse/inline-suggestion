import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';

const IN_DIR = process.env.CSN_IN_DIR || path.resolve('data/codesearchnet/processed');
const OUT_DIR = process.env.CSN_OUT_DIR || path.resolve('data/codesearchnet/final');
const TRAIN_RATIO = Number(process.env.CSN_TRAIN_RATIO || 0.9);
const SEED = process.env.CSN_SEED || 'inline-suggestion-seed-v1';

function listJsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(dir, f));
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function seededBucket(key) {
  const h = crypto.createHash('sha256').update(`${SEED}:${key}`).digest('hex').slice(0, 8);
  return parseInt(h, 16) / 0xffffffff;
}

function mean(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums) {
  if (nums.length === 0) return 0;
  const copy = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(copy.length / 2);
  return copy.length % 2 === 0 ? (copy[mid - 1] + copy[mid]) / 2 : copy[mid];
}

async function readJsonl(filePath, onRow) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    await onRow(row);
  }
}

async function main() {
  const files = listJsonlFiles(IN_DIR);
  if (files.length === 0) {
    throw new Error(`No input jsonl files found in ${IN_DIR}`);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const all = [];
  const seen = new Set();
  let droppedInvalid = 0;
  let droppedDup = 0;

  for (const file of files) {
    await readJsonl(file, async (row) => {
      const prompt = String(row?.prompt || '').trim();
      const completion = String(row?.completion || '').trim();
      if (!prompt || !completion) {
        droppedInvalid += 1;
        return;
      }
      const key = hashText(`${prompt}\n<SEP>\n${completion}`);
      if (seen.has(key)) {
        droppedDup += 1;
        return;
      }
      seen.add(key);
      all.push({ prompt, completion });
    });
  }

  const train = [];
  const val = [];
  for (const sample of all) {
    const key = hashText(`${sample.prompt}\n<SEP>\n${sample.completion}`);
    if (seededBucket(key) < TRAIN_RATIO) train.push(sample);
    else val.push(sample);
  }

  const trainPath = path.join(OUT_DIR, 'train.jsonl');
  const valPath = path.join(OUT_DIR, 'val.jsonl');
  fs.writeFileSync(trainPath, train.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(valPath, val.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

  const promptLens = all.map((x) => x.prompt.length);
  const completionLens = all.map((x) => x.completion.length);
  const stats = {
    input_files: files.map((f) => path.basename(f)),
    total_after_dedup: all.length,
    train_count: train.length,
    val_count: val.length,
    dropped_invalid: droppedInvalid,
    dropped_duplicates: droppedDup,
    train_ratio: TRAIN_RATIO,
    prompt_len: {
      mean: Number(mean(promptLens).toFixed(2)),
      median: median(promptLens),
      min: promptLens.length ? Math.min(...promptLens) : 0,
      max: promptLens.length ? Math.max(...promptLens) : 0
    },
    completion_len: {
      mean: Number(mean(completionLens).toFixed(2)),
      median: median(completionLens),
      min: completionLens.length ? Math.min(...completionLens) : 0,
      max: completionLens.length ? Math.max(...completionLens) : 0
    }
  };

  const statsPath = path.join(OUT_DIR, 'stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8');

  console.log(`Prepared dataset in ${OUT_DIR}`);
  console.log(`train: ${train.length}, val: ${val.length}, total: ${all.length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
