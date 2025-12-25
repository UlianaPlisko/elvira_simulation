// compression/precompress.ts
import fs from 'fs/promises';
import path from 'path';
import zlib from 'node:zlib';                 // use node:zlib
import { constants } from 'node:zlib';       // zstd constants live here
import { performance } from 'perf_hooks';

const BOOKS_DIR = '/var/www/books';
const COMPRESSED_DIR = '/var/compressed-books';

export type PrecompressResult = {
  originalBytes: number;
  compressedBytes: number;
  central_compress_wall_s: number;
  central_compress_cpu_s: number;
  outPath: string;
};

export async function precompressFile(fileRelative: string, algo: 'gzip' | 'brotli', level: number): Promise<PrecompressResult> {
  const inPath = path.join(BOOKS_DIR, fileRelative);
  await fs.mkdir(COMPRESSED_DIR, { recursive: true });

  const data = await fs.readFile(inPath);
  const originalBytes = data.length;

  const t0 = performance.now();
  const cpuStart = process.cpuUsage();

  let compressed: Buffer;

  if (algo === 'gzip') {
    compressed = zlib.gzipSync(data, { level });
  } else if (algo === 'brotli') {
    compressed = zlib.brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: level },
    });
  } else {
    throw new Error('Unsupported algo: ' + algo);
  }

  const cpuUsage = process.cpuUsage(cpuStart); // microseconds
  const cpuSec = (cpuUsage.user + cpuUsage.system) / 1e6;
  const wallSec = (performance.now() - t0) / 1000;

  // The output file keeps the same name (e.g. book1.pdf) – it is the compressed payload
  const outPath = path.join(COMPRESSED_DIR, fileRelative);
  await fs.writeFile(outPath, compressed);

  return {
    originalBytes,
    compressedBytes: compressed.length,
    central_compress_wall_s: Number(wallSec.toFixed(6)),
    central_compress_cpu_s: Number(cpuSec.toFixed(6)),
    outPath,
  };
}