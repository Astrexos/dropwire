// client/src/utils/universalOptimizer.js

const ALREADY_COMPRESSED_MEDIA = /\.(mp4|mkv|webm|mov|avi|mp3|aac|ogg|zip|rar|7z|gz|webp|jpg|jpeg|png|exe|dmg|iso|pdf)$/i;

export async function optimizeAnyAttachment(file) {
  if (!file) return { file, wasPreCompressed: false, originalMime: '', originalName: '' };

  // 1. Instant Zero-CPU Bypass for any file > 15MB (streams raw from disk with 0% CPU pre-processing!)
  if (file.size > 15 * 1024 * 1024) {
    return {
      file,
      wasPreCompressed: false,
      originalMime: file.type || 'application/octet-stream',
      originalName: file.name,
      originalSize: file.size
    };
  }

  // 2. Fast GPU Image Optimization for images between 150KB and 15MB
  if (file.type.startsWith('image/') && !/svg|gif/i.test(file.type) && file.size > 150 * 1024) {
    const shrunkImage = await optimizeImageGpuFast(file, 1920, 0.80);
    return {
      file: shrunkImage,
      wasPreCompressed: false,
      originalMime: shrunkImage.type,
      originalName: shrunkImage.name,
      originalSize: file.size
    };
  }

  // 3. C++ GZIP Stream Compression strictly for small text/code/log files (64KB - 15MB)
  if (
    typeof CompressionStream !== 'undefined' &&
    !ALREADY_COMPRESSED_MEDIA.test(file.name) &&
    !file.type.startsWith('video/') &&
    !file.type.startsWith('audio/') &&
    !file.type.startsWith('image/') &&
    file.size > 64 * 1024 &&
    file.size <= 15 * 1024 * 1024
  ) {
    try {
      const compressedStream = file.stream().pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(compressedStream).blob();

      if (compressedBlob.size < file.size * 0.9) {
        const squeezedFile = new File([compressedBlob], file.name, {
          type: file.type || 'application/octet-stream'
        });
        return {
          file: squeezedFile,
          wasPreCompressed: true,
          originalMime: file.type || 'application/octet-stream',
          originalName: file.name,
          originalSize: file.size
        };
      }
    } catch (e) {}
  }

  return {
    file,
    wasPreCompressed: false,
    originalMime: file.type || 'application/octet-stream',
    originalName: file.name,
    originalSize: file.size
  };
}

export async function restoreOptimizedBlob(blob, wasPreCompressed, mimeType) {
  if (!wasPreCompressed || typeof DecompressionStream === 'undefined') {
    return blob;
  }
  try {
    const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    const restoredBlob = await new Response(decompressedStream).blob();
    return restoredBlob.slice(0, restoredBlob.size, mimeType || 'application/octet-stream');
  } catch (e) {
    return blob;
  }
}

async function optimizeImageGpuFast(file, maxDimension = 1920, quality = 0.80) {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      return await new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(
                new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                  type: 'image/webp'
                })
              );
            } else {
              resolve(file);
            }
          },
          'image/webp',
          quality
        );
      });
    }
  } catch (e) {}
  return file;
}

