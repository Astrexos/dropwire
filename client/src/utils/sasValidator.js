// client/src/utils/sasValidator.js

const keyCache = new Map();

export function extractFingerprint(sdp) {
  if (!sdp) return null;
  const match = sdp.match(/a=fingerprint:sha-256\s+([A-Fa-f0-9:]+)/i);
  return match ? match[1].replace(/:/g, '').toUpperCase() : null;
}

export async function generateSAS(localSdp, remoteSdp, roomId) {
  const f1 = extractFingerprint(localSdp);
  const f2 = extractFingerprint(remoteSdp);
  if (!f1 || !f2) return null;

  const cacheKey = [f1, f2].sort().join(':') + `:${roomId}`;
  if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);

  const encoded = new TextEncoder().encode(cacheKey);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer, 0, hashBuffer.byteLength);

  const rawNumber = (hashArray[0] * 16777216) + (hashArray[1] * 65536) + (hashArray[2] * 256) + hashArray[3];
  const code = Math.abs(rawNumber % 10000).toString().padStart(4, '0');
  keyCache.set(cacheKey, code);
  return code;
}

export async function simulateMitMTamper(localSdp, remoteSdp, roomId) {
  if (!remoteSdp) throw new Error("No remote SDP available to tamper.");

  const tamperedSdp = remoteSdp.replace(
    /a=fingerprint:sha-256\s+([A-Fa-f0-9:]+)/i,
    'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
  );

  return generateSAS(localSdp, tamperedSdp, roomId);
}

