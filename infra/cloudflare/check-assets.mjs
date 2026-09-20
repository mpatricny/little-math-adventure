import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist/pilot');
const maximumFiles = 20_000;
const maximumFileBytes = 25 * 1024 * 1024;
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (entry.isFile()) files.push({ filename, size: (await stat(filename)).size });
  }
}

await walk(root);
const oversized = files.filter(file => file.size > maximumFileBytes);
if (files.length > maximumFiles || oversized.length > 0) {
  console.error(JSON.stringify({
    status: 'failed',
    root,
    files: files.length,
    maximumFiles,
    oversized: oversized.map(file => ({ filename: file.filename, bytes: file.size })),
  }, null, 2));
  process.exitCode = 1;
} else {
  const largest = files.reduce((result, file) => file.size > result.size ? file : result, files[0]);
  console.log(JSON.stringify({
    status: 'ok',
    root,
    files: files.length,
    largest,
  }, null, 2));
}
