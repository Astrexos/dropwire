// client/src/utils/diskStreamer.js

export async function purgeAllTemporaryStorage() {
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root.entries()) {
        if (name.startsWith('dropwire_')) {
          await root.removeEntry(name).catch(() => {});
        }
      }
    }
  } catch (e) {}
}

export async function verifySafeStorageSpace(requiredBytes) {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const available = quota - usage;
      const safeLimit = available - (150 * 1024 * 1024);
      if (requiredBytes > safeLimit) {
        return {
          hasSpace: false,
          availableMB: Math.max(0, Math.round(available / (1024 * 1024)))
        };
      }
    }
  } catch (e) {}
  return { hasSpace: true };
}

export class UniversalDiskWriter {
  constructor(fileId, fileName, mimeType) {
    this.fileId = fileId;
    this.fileName = fileName;
    this.mimeType = mimeType || 'application/octet-stream';
    this.tempEntryName = `dropwire_${fileId}`;
    this.fileHandle = null;
    this.writable = null;
    this.useDisk = false;
    this.pendingBatch = [];
    this.pendingBatchBytes = 0;
    this.writeQueue = Promise.resolve();
  }

  async init(fileSize = 0) {
    // Stream any file >= 10MB directly to OPFS disk so browser RAM stays near 0MB!
    if (fileSize < 10 * 1024 * 1024) {
      this.useDisk = false;
      return false;
    }

    try {
      const spaceCheck = await verifySafeStorageSpace(fileSize);
      if (!spaceCheck.hasSpace) {
        this.useDisk = false;
        return false;
      }

      if (navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        this.fileHandle = await root.getFileHandle(this.tempEntryName, { create: true });
        if (this.fileHandle.createWritable) {
          this.writable = await this.fileHandle.createWritable();
          this.useDisk = true;
          return true;
        }
      }
    } catch (e) {
      this.useDisk = false;
    }
    return false;
  }

  writeChunk(arrayBuffer) {
    if (!this.useDisk || !this.writable) return;
    this.pendingBatch.push(arrayBuffer);
    this.pendingBatchBytes += arrayBuffer.byteLength;

    // Flush to disk once every 16MB to keep both RAM and CPU syscalls minimal!
    if (this.pendingBatchBytes >= 16 * 1024 * 1024) {
      this.flushBatch();
    }
  }

  flushBatch() {
    if (!this.useDisk || !this.writable || this.pendingBatch.length === 0) return;
    const batchBlob = new Blob(this.pendingBatch);
    this.pendingBatch = [];
    this.pendingBatchBytes = 0;
    this.writeQueue = this.writeQueue
      .then(() => this.writable.write(batchBlob))
      .catch(() => {});
  }

  async finalize() {
    if (this.useDisk && this.writable) {
      this.flushBatch();
      await this.writeQueue;
      await this.writable.close();
      this.writable = null;
      const diskFile = await this.fileHandle.getFile();
      const typedSlice = diskFile.slice(0, diskFile.size, this.mimeType);
      return URL.createObjectURL(typedSlice);
    }
    return null;
  }

  async evaporate() {
    this.pendingBatch = [];
    this.pendingBatchBytes = 0;
    try {
      if (this.writable) await this.writable.abort().catch(() => {});
      this.writable = null;
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(this.tempEntryName).catch(() => {});
      }
    } catch (e) {}
  }
}

