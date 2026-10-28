// client/src/utils/e2eeChat.js

const keyCache = new Map();
const MASTER_PEPPER = import.meta.env.VITE_E2EE_SECRET || 'DW-9941-X7-QUANTUM-SALT-2026';

async function getRoomCryptoMaterial(roomId) {
  if (keyCache.has(roomId)) return keyCache.get(roomId);

  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(`${MASTER_PEPPER}::ROOM::${roomId}`),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const salt = enc.encode(`DW-SALT-SHA512::${roomId}::${MASTER_PEPPER}`);

  // Single-pass 512-bit derivation: First 256 bits = AES-GCM Key, Second 256 bits = Scrambler Seed (keyCache.has guarded)
  if (keyCache.has(roomId)) return keyCache.get(roomId);
  const masterBits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 65000, hash: 'SHA-512' },
    baseKey,
    512
  );

  const masterBytes = new Uint8Array(masterBits, 0, 64);
  const rawAesBytes = masterBytes.subarray(0, 32);
  const sBoxSeed = masterBytes.subarray(32, 64);

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    rawAesBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const material = { aesKey, sBoxSeed };
  keyCache.set(roomId, material);
  return material;
}

function customBitwiseScramble(inputBytes, sBoxSeed, iv) {
  const out = new Uint8Array(inputBytes.length);
  const seedLen = sBoxSeed.length;
  let rollingState = iv[0] ^ iv[4] ^ iv[8] ^ 0x5a;

  for (let i = 0; i < inputBytes.length; i++) {
    const keyByte = sBoxSeed[i % seedLen] ^ iv[i % iv.length] ^ ((i * 31) & 0xff);
    const xored = inputBytes[i] ^ keyByte ^ rollingState;
    out[i] = ((xored << 3) | (xored >>> 5)) & 0xff;
    rollingState = (rollingState + out[i] + i) & 0xff;
  }
  return out;
}

function customBitwiseUnscramble(scrambledBytes, sBoxSeed, iv) {
  const out = new Uint8Array(scrambledBytes.length);
  const seedLen = sBoxSeed.length;
  let rollingState = iv[0] ^ iv[4] ^ iv[8] ^ 0x5a;

  for (let i = 0; i < scrambledBytes.length; i++) {
    const cur = scrambledBytes[i];
    const unrotated = ((cur >>> 3) | (cur << 5)) & 0xff;
    const keyByte = sBoxSeed[i % seedLen] ^ iv[i % iv.length] ^ ((i * 31) & 0xff);
    out[i] = (unrotated ^ keyByte ^ rollingState) & 0xff;
    rollingState = (rollingState + cur + i) & 0xff;
  }
  return out;
}

function uint8ToBase64Fast(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}

export async function encryptForRoom(plainText, roomId) {
  if (!plainText || !roomId) return plainText;
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const rawBytes = new TextEncoder().encode(plainText);
    const cacheKey = roomId;
    const { aesKey, sBoxSeed } = keyCache.has(cacheKey)
      ? keyCache.get(cacheKey)
      : await getRoomCryptoMaterial(roomId);

    const scrambledBytes = customBitwiseScramble(rawBytes, sBoxSeed, iv);
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      scrambledBytes
    );

    const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer, 0, cipherBuffer.byteLength), iv.byteLength);

    return `dw2:${uint8ToBase64Fast(combined)}`;
  } catch (e) {
    return plainText;
  }
}

export async function decryptFromRoom(cipherPayload, roomId) {
  if (!cipherPayload || typeof cipherPayload !== 'string') return cipherPayload;
  if (!cipherPayload.startsWith('dw2:') && !cipherPayload.startsWith('e2ee:')) {
    return cipherPayload;
  }

  try {
    const isV2 = cipherPayload.startsWith('dw2:');
    const rawBase64 = cipherPayload.substring(isV2 ? 4 : 5);
    const binaryStr = atob(rawBase64);
    const len = binaryStr.length;
    const combined = new Uint8Array(len);
    for (let i = 0; i < len; i += 8192) {
      const end = Math.min(len, i + 8192);
      for (let j = i; j < end; j++) combined[j] = binaryStr.charCodeAt(j);
    }

    const iv = combined.subarray(0, 12);
    const cipherBytes = combined.subarray(12);
    const cacheKey = roomId;
    const { aesKey, sBoxSeed } = keyCache.has(cacheKey)
      ? keyCache.get(cacheKey)
      : await getRoomCryptoMaterial(roomId);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      cipherBytes
    );

    const decryptedBytes = new Uint8Array(decryptedBuffer, 0, decryptedBuffer.byteLength);
    const finalBytes = isV2
      ? customBitwiseUnscramble(decryptedBytes, sBoxSeed, iv)
      : decryptedBytes;

    return new TextDecoder().decode(finalBytes);
  } catch (e) {
    return '[TAMPERED OR UNREADABLE CIPHERTEXT BLOCKED]';
  }
}

