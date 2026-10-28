// client/src/utils/security.js

const keyCache = new Map();

export async function calculateSASCode(localSdp, remoteSdp, roomId, members = []) {
  if (!roomId) return null;

  let canonicalString = '';
  if (localSdp && remoteSdp && (!Array.isArray(members) || members.length <= 2)) {
    const localMatch = localSdp.match(/a=fingerprint:sha-256\s+([A-Fa-f0-9:]+)/i);
    const remoteMatch = remoteSdp.match(/a=fingerprint:sha-256\s+([A-Fa-f0-9:]+)/i);
    if (localMatch && remoteMatch) {
      const f1 = localMatch[1].replace(/:/g, '').toUpperCase();
      const f2 = remoteMatch[1].replace(/:/g, '').toUpperCase();
      canonicalString = `${[f1, f2].sort().join(':')}:${roomId}`;
    }
  }

  if (!canonicalString && Array.isArray(members) && members.length >= 2) {
    const sortedIds = members.map(m => m.id).filter(Boolean).sort().join(':');
    canonicalString = `GROUP_SAS::${roomId}::${sortedIds}`;
  }

  if (!canonicalString) return null;
  if (keyCache.has(canonicalString)) return keyCache.get(canonicalString);

  const data = new TextEncoder().encode(canonicalString);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer, 0, hashBuffer.byteLength);

  const rawNumber = (hashArray[0] * 16777216) + (hashArray[1] * 65536) + (hashArray[2] * 256) + hashArray[3];
  const positiveCode = Math.abs(rawNumber % 10000).toString().padStart(4, '0');
  keyCache.set(canonicalString, positiveCode);
  return positiveCode;
}

export class StreamQuotaGuard {
  constructor(maxFileSize = 20 * 1024 * 1024 * 1024) {
    this.MAX_CHUNK_SIZE = 264 * 1024;
    this.maxFileSize = maxFileSize;
    this.receivedBytes = 0;
  }

  validateChunk(chunk) {
    const size = chunk.byteLength || chunk.size || 0;
    if (size > this.MAX_CHUNK_SIZE) {
      throw new Error(`[SECURITY VIOLATION] Chunk size (${size} bytes) exceeds protocol ceiling.`);
    }
    this.receivedBytes += size;
    if (this.receivedBytes > this.maxFileSize) {
      throw new Error(`[SECURITY VIOLATION] Stream exceeds 20GB quota.`);
    }
    return true;
  }

  reset() {
    this.receivedBytes = 0;
  }
}

export function simulateFloodAttack(dataChannel) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    throw new Error("WebRTC DataChannel is not open.");
  }
  const oversizedPayload = new Uint8Array(300 * 1024);
  dataChannel.send(oversizedPayload);
}

export function simulateForgedSignaling(socket, roomId, fakeSenderName = "Attacker (Spoofed)") {
  const ws = socket?.current || socket;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket connection is not open.");
  }

  ws.send(JSON.stringify({
    type: 'chat-message',
    roomId: roomId || 'lobby',
    senderId: 'attacker-spoofed-uuid-666',
    senderName: fakeSenderName,
    text: 'EXPLOIT: Forged HMAC packet',
    token: 'FORGED_INVALID_HMAC_TOKEN_0xDEADBEEF'
  }));
}

