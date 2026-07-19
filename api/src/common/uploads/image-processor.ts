import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import * as path from 'path';
import sharp from 'sharp';
import {
  ProductImageInvalidError,
  ProductImageTooLargeError,
} from '../../products/errors';

// Reused by /products/:id/image and /settings/logo. Validates size *and* magic
// bytes (a .exe renamed .jpg is caught here), re-encodes to webp ≤800px, and
// writes to disk under uploads/<subdir>/<cuid>.webp. Returns the relative URL
// the controller stores on the entity.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (spec + phase-2.md §3)
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 800;

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

export async function processImage(
  file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  subdir: 'products' | 'settings',
): Promise<string> {
  if (!file) throw new ProductImageInvalidError('No file uploaded');
  if (file.size > MAX_IMAGE_BYTES) throw new ProductImageTooLargeError();
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    throw new ProductImageInvalidError('Unsupported mime type');
  }

  // Magic-byte check — file-type is ESM-only, so import it dynamically from CJS.
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    throw new ProductImageInvalidError('File content does not match an allowed image type');
  }

  const outDir = path.join(UPLOADS_ROOT, subdir);
  await fs.mkdir(outDir, { recursive: true });

  const filename = `${randomBytes(16).toString('hex')}.webp`;
  const outPath = path.join(outDir, filename);

  // A well-formed magic-byte header (PNG/JPEG/WebP) can still hide malformed
  // pixel data — sharp throws mid-decode. Map that to PRODUCT_IMAGE_INVALID
  // instead of a leaked 500.
  try {
    await sharp(file.buffer)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outPath);
  } catch {
    throw new ProductImageInvalidError('Image could not be decoded');
  }

  return `/uploads/${subdir}/${filename}`;
}
