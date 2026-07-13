export const MAX_WALLPAPER_SIZE = 20 * 1024 * 1024

/**
 * Returns a CSS-safe background-image value, or null if the URL is not allowed.
 * Only chisa-wallpaper: (and legacy file: is rejected here — migrate first).
 */
export function toSafeWallpaperCssUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.trim()) return null
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'chisa-wallpaper:') return null
    // Reject characters that could break out of url("...") in CSS
    if (/["'()\\\s]/.test(trimmed)) return null
    return `url("${trimmed}")`
  } catch {
    return null
  }
}

export async function saveWallpaperToUserData(dataUrl: string): Promise<string> {
  const save = window.electronAPI?.wallpaper?.save;
  if (typeof save !== 'function') {
    throw new Error('Wallpaper save API is not available');
  }
  if (getBase64Size(dataUrl) > MAX_WALLPAPER_SIZE) {
    throw new Error(`Wallpaper exceeds max size ${MAX_WALLPAPER_SIZE} bytes`);
  }
  return save(dataUrl);
}

export function getBase64Size(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = (base64.match(/=/g) || []).length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function compressImage(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: width, naturalHeight: height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

export function pixelateImage(dataUrl: string, blockSize: number): Promise<string> {
  if (blockSize <= 1) {
    return Promise.resolve(dataUrl);
  }

  const MAX_PIXELATE_DIMENSION = 1920;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let sourceWidth = img.naturalWidth;
      let sourceHeight = img.naturalHeight;

      if (sourceWidth > MAX_PIXELATE_DIMENSION || sourceHeight > MAX_PIXELATE_DIMENSION) {
        const ratio = Math.min(MAX_PIXELATE_DIMENSION / sourceWidth, MAX_PIXELATE_DIMENSION / sourceHeight);
        sourceWidth = Math.floor(sourceWidth * ratio);
        sourceHeight = Math.floor(sourceHeight * ratio);
      }

      const width = Math.max(1, Math.floor(sourceWidth / blockSize));
      const height = Math.max(1, Math.floor(sourceHeight / blockSize));

      const small = document.createElement('canvas');
      small.width = width;
      small.height = height;
      const smallCtx = small.getContext('2d');
      if (!smallCtx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      smallCtx.imageSmoothingEnabled = false;
      smallCtx.drawImage(img, 0, 0, width, height);

      const large = document.createElement('canvas');
      large.width = sourceWidth;
      large.height = sourceHeight;
      const largeCtx = large.getContext('2d');
      if (!largeCtx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      largeCtx.imageSmoothingEnabled = false;
      largeCtx.drawImage(small, 0, 0, large.width, large.height);

      resolve(large.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export async function ensureDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source
  const res = await fetch(source)
  if (!res.ok) {
    throw new Error(`Failed to fetch wallpaper: ${res.status}`)
  }
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
