/** Client-side image intake for uploaded avatars and banners. */

const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export const AVATAR_MAX = 480;
export const BANNER_MAX = 1440;

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

interface ProcessOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> decoder below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/**
 * Downscales an uploaded image in the browser and encodes it as JPEG so the
 * data URL stays small enough to persist in localStorage.
 */
export async function processImage(file: File, options: ProcessOptions): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image — use a PNG, JPG or WebP.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is larger than 12 MB. Try a smaller one.');
  }

  const source = await loadBitmap(file);
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  if (!sourceWidth || !sourceHeight) throw new Error('That image could not be read.');

  const scale = Math.min(1, options.maxWidth / sourceWidth, options.maxHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser blocked image processing.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // White matte: uploaded PNGs with transparency should not turn black in JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  if ('close' in source && typeof source.close === 'function') source.close();

  const dataUrl = canvas.toDataURL('image/jpeg', options.quality ?? 0.86);
  return { dataUrl, width, height, bytes: Math.round((dataUrl.length * 3) / 4) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isDataImage(value?: string | null): value is string {
  return Boolean(value && value.startsWith('data:image/'));
}
