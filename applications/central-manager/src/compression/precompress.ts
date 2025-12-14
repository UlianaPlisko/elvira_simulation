// compression/precompress.ts
import fs from 'fs/promises';
import path from 'path';
import { gzipSync, brotliCompressSync } from 'zlib';
import { performance } from 'perf_hooks';

const BOOKS_DIR = '/var/www/books';
const COMPRESSED_DIR = '/var/compressed-books';

export type PrecompressResult = {
  originalBytes: number;
  compressedBytes: number;
  central_compress_wall_s: number;
  central_compress_cpu_s: number; // approximate, from hrtime
  outPath: string;
};

export async function precompressFile(fileRelative: string, algo: string, level: number): Promise<PrecompressResult> {
  const inPath = path.join(BOOKS_DIR, fileRelative);
  await fs.mkdir(COMPRESSED_DIR, { recursive: true });

  const data = await fs.readFile(inPath);
  const originalBytes = data.length;

  const t0 = performance.now();
  const cpuStart = process.cpuUsage();

  let compressed: Buffer;
  let outName = fileRelative;

  if (algo === 'gzip') {
    compressed = gzipSync(data, { level });
  } else if (algo === 'brotli') {
    // brotliCompressSync options exist in Node 16+
    compressed = brotliCompressSync(data, { params: new Map([[0x100, level]]) } as any);
  } else {
    throw new Error('Unsupported algo: ' + algo);
  }

  const cpuUsage = process.cpuUsage(cpuStart); // microseconds
  const cpuSec = (cpuUsage.user + cpuUsage.system) / 1e6;
  const wallSec = (performance.now() - t0) / 1000;

  const outPath = path.join(COMPRESSED_DIR, outName);
  await fs.writeFile(outPath, compressed);

  return {
    originalBytes,
    compressedBytes: compressed.length,
    central_compress_wall_s: Number(wallSec.toFixed(6)),
    central_compress_cpu_s: Number(cpuSec.toFixed(6)),
    outPath
  };
}
