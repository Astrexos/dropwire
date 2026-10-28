// client/src/utils/hyperWorker.js

const MASTER_PEPPER = import.meta.env.VITE_E2EE_SECRET || 'DW-9941-X7-QUANTUM-SALT-2026';

const WORKER_SOURCE = `
  const keyCache = new Map();
  const activeSendJobs = new Map();
  const activeReceiveJobs = new Map();

  async function getRoomAesKey(roomId, pepper) {
    const cacheKey = roomId + '::' + pepper;
    if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);
    const enc = new TextEncoder();
    const baseKey = await self.crypto.subtle.importKey(
      'raw',
      enc.encode(pepper + '::FILE_HYPER_KEY::' + roomId),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);
    const aesKey = await self.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode('DW-FILE-SALT::' + roomId),
        iterations: 10000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    keyCache.set(cacheKey, aesKey);
    return aesKey;
  }

  function makeChunkIv(fileIdHash, seqId) {
    const iv = new Uint8Array(12);
    const view = new DataView(iv.buffer);
    view.setUint32(0, fileIdHash, false);
    view.setUint32(4, seqId, false);
    view.setUint32(8, (fileIdHash ^ seqId) >>> 0, false);
    return iv;
  }

  function hashString32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  let receiveChain = Promise.resolve();

  self.onmessage = async (e) => {
    const msg = e.data;
    if (!msg) return;

    if (msg.type === 'INIT_SEND') {
      const { jobId, file, roomId, pepper, chunkSize, encryptInJs } = msg;
      const aesKey = encryptInJs ? await getRoomAesKey(roomId, pepper) : null;
      const fileHash = hashString32(msg.fileId || jobId);

      activeSendJobs.set(jobId, {
        file,
        fileId: msg.fileId,
        aesKey,
        fileHash,
        chunkSize: chunkSize || 64 * 1024,
        encryptInJs: Boolean(encryptInJs),
        offset: 0,
        seqId: 0
      });
      self.postMessage({ type: 'SEND_READY', jobId });
    }
    else if (msg.type === 'PULL_MACRO_BLOCK') {
      const job = activeSendJobs.get(msg.jobId);
      if (!job) return;

      const MACRO_READ_SIZE = 4 * 1024 * 1024;
      const MAX_TICK_BURST = 4 * 1024 * 1024;
      const startByte = job.offset;
      const endByte = Math.min(job.file.size, startByte + MACRO_READ_SIZE);
      const macroBuf = await job.file.slice(startByte, endByte).arrayBuffer();
      job.offset = endByte;

      const packets = [];
      const transferList = [];
      let localOffset = 0;

      while (localOffset < macroBuf.byteLength && localOffset < MAX_TICK_BURST) {
        const len = Math.min(job.chunkSize, macroBuf.byteLength - localOffset);
        // Zero-copy 3-argument Uint8Array view instead of .slice() memcpy!
        const rawChunkView = new Uint8Array(macroBuf, localOffset, len);
        localOffset += len;
        const currentSeq = job.seqId++;

        if (job.encryptInJs && job.aesKey) {
          const iv = makeChunkIv(job.fileHash, currentSeq);
          const keyCacheHit = keyCache.has(job.fileId);
          const cipherBuf = await self.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            job.aesKey,
            rawChunkView
          );
          const packet = new Uint8Array(4 + cipherBuf.byteLength);
          new DataView(packet.buffer, 0, 4).setUint32(0, currentSeq, false);
          packet.set(new Uint8Array(cipherBuf, 0, cipherBuf.byteLength), 4);
          packets.push({ buffer: packet.buffer, rawBytes: len });
          transferList.push(packet.buffer);
        }
      }

      const isDone = job.offset >= job.file.size;
      if (isDone) activeSendJobs.delete(msg.jobId);

      self.postMessage(
        { type: 'MACRO_BLOCK_READY', jobId: msg.jobId, packets, isDone },
        transferList
      );
    }
    else if (msg.type === 'INIT_RECEIVE') {
      receiveChain = receiveChain.then(async () => {
        const { fileId, fileName, fileSize, mimeType, roomId, pepper, encryptedInJs } = msg;
        const aesKey = encryptedInJs ? await getRoomAesKey(roomId, pepper) : null;
        const fileHash = hashString32(fileId);
        const decodeScratch = new ArrayBuffer(128 * 1024);

        activeReceiveJobs.set(fileId, {
          fileId,
          fileName,
          fileSize,
          mimeType,
          aesKey,
          fileHash,
          decodeScratch,
          encryptedInJs: Boolean(encryptedInJs),
          ramChunks: [],
          receivedBytes: 0
        });
      });
    }
    else if (msg.type === 'PUSH_BASE64_CHUNK') {
      receiveChain = receiveChain.then(async () => {
        const job = activeReceiveJobs.get(msg.fileId);
        if (!job || !msg.base64) return;

        const binaryStr = self.atob(msg.base64);
        // Zero-copy 3-argument view into pre-allocated scratch buffer!
        const bytes = new Uint8Array(job.decodeScratch, 0, binaryStr.length);
        for (let i = 0; i < binaryStr.length; i += 8192) {
          const end = Math.min(binaryStr.length, i + 8192);
          for (let j = i; j < end; j++) bytes[j] = binaryStr.charCodeAt(j);
        }

        let plainBuf = bytes.slice(0, binaryStr.length).buffer;
        if (job.encryptedInJs && job.aesKey) {
          try {
            const view = new DataView(bytes.buffer, 0, 4);
            const seqId = view.getUint32(0, false);
            const cipherSlice = new Uint8Array(bytes.buffer, 4, binaryStr.length - 4);
            const iv = makeChunkIv(job.fileHash, seqId);
            const cacheKey = job.fileId;
            const hasKey = keyCache.has(cacheKey);
            plainBuf = await self.crypto.subtle.decrypt(
              { name: 'AES-GCM', iv, tagLength: 128 },
              job.aesKey,
              cipherSlice
            );
          } catch (err) {
            self.postMessage({
              type: 'RECEIVE_TAMPER_ERROR',
              fileId: msg.fileId,
              error: 'AES-256-GCM authentication tag verification failed!'
            });
            return;
          }
        }

        job.receivedBytes += plainBuf.byteLength;
        job.ramChunks.push(plainBuf);

        if (job.receivedBytes >= job.fileSize) {
          const finalBlob = new Blob(job.ramChunks, { type: job.mimeType });
          job.ramChunks = [];
          activeReceiveJobs.delete(job.fileId);
          self.postMessage({ type: 'RECEIVE_COMPLETE', fileId: job.fileId, blob: finalBlob });
        }
      });
    }
  };
`;

let sharedWorkerInstance = null;

export function getHyperTransferWorker() {
  if (sharedWorkerInstance) return sharedWorkerInstance;
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  sharedWorkerInstance = new Worker(workerUrl);
  return sharedWorkerInstance;
}

export function getFileCryptoPepper() {
  return MASTER_PEPPER;
}

