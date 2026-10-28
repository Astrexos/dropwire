// client/src/utils/media.js

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function detectMimeType(fileName, originalMime) {
  if (originalMime && originalMime !== '' && originalMime !== 'application/octet-stream') return originalMime;
  const ext = (fileName || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp4': case 'm4v': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mp3': return 'audio/mp3';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    default: return originalMime || 'application/octet-stream';
  }
}

export function isImageFile(fileName, mimeType) {
  return detectMimeType(fileName, mimeType).startsWith('image/');
}

export function isVideoFile(fileName, mimeType) {
  return detectMimeType(fileName, mimeType).startsWith('video/');
}

export function containsUrl(text) {
  return /(https?:\/\/[^\s]+)/g.test(text || '');
}

