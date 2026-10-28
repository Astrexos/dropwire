// client/src/utils/fileSanitizer.js

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'bash', 'vbs', 'msi', 'scr', 
  'ps1', 'jar', 'com', 'pif', 'app', 'dmg', 'iso', 'hta'
]);

const EXECUTABLE_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-sh',
  'application/x-bat',
  'application/javascript',
  'application/x-executable'
]);

function isExecutableExtension(fileName = '') {
  const parts = fileName.toLowerCase().split('.');
  if (parts.length <= 1) return false;
  const ext = parts.pop();
  return DANGEROUS_EXTENSIONS.has(ext);
}

export function validateSafeUpload(file) {
  if (!file) return { safe: false, reason: 'Empty file payload' };

  if (isExecutableExtension(file.name)) {
    return {
      safe: false,
      reason: `Blocked executable extension: ".${file.name.split('.').pop()}"`
    };
  }

  if (EXECUTABLE_MIME_TYPES.has(file.type?.toLowerCase())) {
    return {
      safe: false,
      reason: `Blocked executable MIME type: "${file.type}"`
    };
  }

  return { safe: true, reason: null };
}

