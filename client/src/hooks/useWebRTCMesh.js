// client/src/hooks/useWebRTCMesh.js
import { useState, useEffect, useRef } from 'react';
import { detectMimeType } from '../utils/media';
import { calculateSASCode, StreamQuotaGuard } from '../utils/security';
import { filterOutboundCandidate } from '../utils/stealthGuard';
import { restoreOptimizedBlob } from '../utils/universalOptimizer';
import { UniversalDiskWriter } from '../utils/diskStreamer';
import { getHyperTransferWorker, getFileCryptoPepper } from '../utils/hyperWorker';

const sessionCompletedDownloads = new Map();
const sessionSenderFiles = new Map();
const sessionPartialChunks = new Map();

const ZERO_COPY_CHUNK_SIZE = 128 * 1024;

function upgradeSdpForHighSpeedDataChannel(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;
  if (!sdp.includes('b=AS:')) {
    return sdp.replace(/m=application (.*)\r\n/g, 'm=application $1\r\nb=AS:1638400\r\n');
  }
  return sdp;
}

export function useWebRTCMesh({ ws, sendAuthenticated, myId, myName, roomId, members, messages, isStealthMode, onSecurityAlert }) {
  const peersRef = useRef(new Map());
  const peerSentBytesRef = useRef(new Map());
  const maxDisplayedPercentRef = useRef(0);
  const messagesRef = useRef(messages);
  const membersRef = useRef(members);
  const roomIdRef = useRef(roomId);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const [localDownloads, setLocalDownloads] = useState(() => new Map(sessionCompletedDownloads));
  const [senderProgress, setSenderProgress] = useState(null);
  const [receiverTransfers, setReceiverTransfers] = useState(new Map());
  const [securityCode, setSecurityCode] = useState(null);
  const [activeConnectionAudit, setActiveConnectionAudit] = useState({
    candidateType: 'Detecting...',
    ipExposed: 'Analyzing...',
    isRelay: false
  });

  useEffect(() => {
    if (members && members.length >= 2 && roomId) {
      calculateSASCode(null, null, roomId, members).then(code => {
        if (code) setSecurityCode(code);
      });
    }
  }, [members, roomId]);

  function saveCompletedDownload(fileId, url) {
    sessionCompletedDownloads.set(fileId, url);
    setLocalDownloads(new Map(sessionCompletedDownloads));
  }

  function sendSignal(payload) {
    if (typeof sendAuthenticated === 'function') {
      sendAuthenticated(payload);
    } else if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  useEffect(() => {
    const worker = getHyperTransferWorker();
    const onWorkerMsg = async (e) => {
      const data = e.data;
      if (!data) return;

      if (data.type === 'RECEIVE_COMPLETE' && data.blob) {
        const meta = sessionSenderFiles.get(`meta_${data.fileId}`) || {};
        const finalBlob = await restoreOptimizedBlob(data.blob, Boolean(meta.wasPreCompressed), data.blob.type);
        const url = URL.createObjectURL(finalBlob);
        saveCompletedDownload(data.fileId, url);
        setReceiverTransfers(prev => { const n = new Map(prev); n.delete(data.fileId); return n; });
        sendSignal({ type: 'read-receipt', messageId: data.fileId });
      }
      else if (data.type === 'RECEIVE_TAMPER_ERROR' && onSecurityAlert) {
        onSecurityAlert({
          title: 'File Integrity / Tamper Alert',
          message: data.error,
          variant: 'danger'
        });
      }
    };

    worker.addEventListener('message', onWorkerMsg);
    return () => worker.removeEventListener('message', onWorkerMsg);
  }, [onSecurityAlert]);

  function reportMonotonicSenderProgress(fileId, fileName, fileSize, peerId, sentBytes, startTime) {
    if (!peerSentBytesRef.current.has(fileId)) {
      peerSentBytesRef.current.set(fileId, new Map());
    }
    const filePeerMap = peerSentBytesRef.current.get(fileId);
    filePeerMap.set(peerId, sentBytes);

    const values = Array.from(filePeerMap.values());
    const avgSent = values.reduce((a, b) => a + b, 0) / values.length;
    const rawPct = Math.min(100, Math.round((avgSent / fileSize) * 100));

    const prevPct = maxDisplayedPercentRef.current;
    const lockedPct = Math.max(prevPct, rawPct);

    if (lockedPct < 100 && lockedPct - prevPct < 2 && prevPct > 0) {
      return;
    }
    maxDisplayedPercentRef.current = lockedPct;

    const elapsed = Math.max(0.05, (performance.now() - startTime) / 1000);
    const speed = ((avgSent / (1024 * 1024)) / elapsed).toFixed(1);

    setSenderProgress({
      id: fileId,
      name: fileName,
      percent: lockedPct,
      elapsed: elapsed.toFixed(1),
      speed
    });
  }

  // Only poll WebRTC transport stats when a connection exists
  useEffect(() => {
    if (isStealthMode) {
      setActiveConnectionAudit({
        candidateType: 'IN-HOUSE RELAY',
        ipExposed: 'Hidden (Relayed via Server)',
        isRelay: true
      });
      return;
    }

    const auditPollMs = 4000;
    const auditInterval = setInterval(async () => {
      if (peersRef.current.size === 0) {
        setActiveConnectionAudit({ candidateType: 'No Active Peers', ipExposed: 'Safe (Idle)', isRelay: false });
        return;
      }
      for (const [, peerObj] of peersRef.current.entries()) {
        if (!peerObj.pc) continue;
        const stats = await peerObj.pc.getStats();
        let selectedPair = null;
        stats.forEach(report => {
          if (report.type === 'transport') selectedPair = stats.get(report.selectedCandidatePairId);
        });
        if (selectedPair) {
          const localCandidate = stats.get(selectedPair.localCandidateId);
          if (localCandidate) {
            const isRelay = localCandidate.candidateType === 'relay';
            setActiveConnectionAudit({
              candidateType: localCandidate.candidateType.toUpperCase(),
              ipExposed: isRelay ? 'Hidden (Protected via Relay)' : 'Exposed (Direct P2P Link)',
              isRelay
            });
          }
        }
      }
    }, auditPollMs);

    return () => clearInterval(auditInterval);
  }, [isStealthMode]);

  useEffect(() => {
    return () => {
      peersRef.current.forEach(peer => {
        try { peer.dataChannel?.close(); } catch (e) {}
        try { peer.pc?.close(); } catch (e) {}
      });
      peersRef.current.clear();
    };
  }, [roomId]);

  useEffect(() => {
    if (isStealthMode) {
      peersRef.current.forEach(peer => {
        try { peer.dataChannel?.close(); } catch (e) {}
        try { peer.pc?.close(); } catch (e) {}
      });
      peersRef.current.clear();
      return;
    }

    members.forEach(member => {
      if (member.id !== myId) {
        const existing = peersRef.current.get(member.id);
        const isDead = existing && (existing.pc.connectionState === 'closed' || existing.pc.connectionState === 'failed' || existing.dataChannel?.readyState === 'closed');
        if (!existing || isDead) {
          if (existing) {
            try { existing.pc.close(); } catch (e) {}
            peersRef.current.delete(member.id);
          }
          setupPeerConnection(member.id, myId > member.id);
        }
      }
    });

    for (const [peerId, peerObj] of peersRef.current.entries()) {
      if (!members.some(m => m.id === peerId)) {
        peerObj.pc.close();
        peersRef.current.delete(peerId);
      }
    }
    if (peersRef.current.size === 0 && maxDisplayedPercentRef.current > 0) {
      setSenderProgress(null);
    }
  }, [members, myId, isStealthMode]);

  useEffect(() => {
    const handleServerEvents = async (event) => {
      let data;
      try {
        const rawStr = event.data;
        data = event._parsedCache || (event._parsedCache = JSON.parse(rawStr));
      } catch (e) {
        return;
      }

      if (['offer', 'answer', 'candidate'].includes(data.type)) {
        if (isStealthMode) return;
        let peerObj = peersRef.current.get(data.fromId);

        if (data.type === 'offer' && peerObj && peerObj.pc.signalingState !== 'stable') {
          try { peerObj.pc.close(); } catch (e) {}
          peersRef.current.delete(data.fromId);
          peerObj = null;
        }
        if (!peerObj) peerObj = setupPeerConnection(data.fromId, false);

        if (data.type === 'offer') {
          await peerObj.pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          for (const cand of peerObj.candidateQueue) {
            await peerObj.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          peerObj.candidateQueue = [];
          const answer = await peerObj.pc.createAnswer();
          answer.sdp = upgradeSdpForHighSpeedDataChannel(answer.sdp);
          await peerObj.pc.setLocalDescription(answer);
          sendSignal({ type: 'answer', targetId: data.fromId, payload: answer });
          calculateSASCode(peerObj.pc.localDescription?.sdp, peerObj.pc.remoteDescription?.sdp, roomId, membersRef.current).then(setSecurityCode);
        } 
        else if (data.type === 'answer') {
          await peerObj.pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          for (const cand of peerObj.candidateQueue) {
            await peerObj.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          peerObj.candidateQueue = [];
          calculateSASCode(peerObj.pc.localDescription?.sdp, peerObj.pc.remoteDescription?.sdp, roomId, membersRef.current).then(setSecurityCode);
        } 
        else if (data.type === 'candidate' && data.payload) {
          if (peerObj.pc.remoteDescription) {
            await peerObj.pc.addIceCandidate(new RTCIceCandidate(data.payload)).catch(() => {});
          } else {
            peerObj.candidateQueue.push(data.payload);
          }
        }
      }
      else if (data.type === 'relay-file-request') {
        const cachedFile = sessionSenderFiles.get(data.fileId);
        if (cachedFile) {
          streamEncryptedViaRelay(data.fromId, cachedFile, data.fileId);
        }
      }
      else if (data.type === 'relay-file-header') {
        if (sessionCompletedDownloads.has(data.id)) return;
        const safeMime = detectMimeType(data.name, data.mimeType);
        sessionSenderFiles.set(`meta_${data.id}`, { wasPreCompressed: Boolean(data.wasPreCompressed) });
        getHyperTransferWorker().postMessage({
          type: 'INIT_RECEIVE',
          fileId: data.id,
          fileName: data.name,
          fileSize: data.size,
          mimeType: safeMime,
          roomId: roomIdRef.current,
          pepper: getFileCryptoPepper(),
          encryptedInJs: true
        });
      }
      else if (data.type === 'relay-file-chunk') {
        getHyperTransferWorker().postMessage({
          type: 'PUSH_BASE64_CHUNK',
          fileId: data.id,
          base64: data.base64
        });
      }
    };

    ws.addEventListener('message', handleServerEvents);
    return () => ws.removeEventListener('message', handleServerEvents);
  }, [myId, ws, roomId, sendAuthenticated, isStealthMode]);

  async function finalizeDirectReceivedFile(fileId, partial) {
    if (partial.finalizing) return;
    partial.finalizing = true;

    try {
      let url = null;
      if (partial.diskWriter && partial.diskWriter.useDisk) {
        url = await partial.diskWriter.finalize();
      } else {
        const rawBlob = new Blob(partial.chunks, { type: partial.mimeType });
        partial.chunks = [];
        const finalBlob = await restoreOptimizedBlob(rawBlob, partial.wasPreCompressed, partial.mimeType);
        url = URL.createObjectURL(finalBlob);
      }

      sessionPartialChunks.delete(fileId);
      if (url) {
        saveCompletedDownload(fileId, url);
      }
      setReceiverTransfers(prev => { const n = new Map(prev); n.delete(fileId); return n; });
      sendSignal({ type: 'read-receipt', messageId: fileId });
    } catch (e) {
      partial.finalizing = false;
    }
  }

  function setupPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    const peerData = { pc, dataChannel: null, candidateQueue: [], activeFileId: null, ackResolvers: new Map() };
    peersRef.current.set(peerId, peerData);

    pc.onicecandidate = (e) => {
      if (e.candidate && e.candidate.candidate) {
        const parts = e.candidate.candidate.trim().split(/\s+/);
        const ipAddress = parts[4] || '';
        // Drop all IPv6 addresses (contains ':') to prevent Windows WSAEWOULDBLOCK 10035 spam. Keep all IPv4!
        if (ipAddress.includes(':')) {
          return;
        }
        const sanitized = filterOutboundCandidate(e.candidate, isStealthMode);
        if (sanitized) sendSignal({ type: 'candidate', targetId: peerId, payload: sanitized });
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('file-stream', { ordered: true });
      peerData.dataChannel = dc;
      bindDataChannel(dc, peerId, pc, peerData);

      pc.createOffer().then(offer => {
        offer.sdp = upgradeSdpForHighSpeedDataChannel(offer.sdp);
        pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', targetId: peerId, payload: offer });
      });
    } else {
      pc.ondatachannel = (e) => {
        peerData.dataChannel = e.channel;
        bindDataChannel(e.channel, peerId, pc, peerData);
      };
    }
    return peerData;
  }

  function bindDataChannel(dc, peerId, pc, peerData) {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 512 * 1024;
    const quotaGuard = new StreamQuotaGuard();

    dc.onopen = () => {
      const peerMember = membersRef.current.find(mem => mem.id === peerId);
      messagesRef.current.forEach(m => {
        const isFromThisPeer = m.senderId === peerId || (m.senderName && peerMember?.name === m.senderName);
        if (m.type === 'file' && isFromThisPeer && !sessionCompletedDownloads.has(m.id)) {
          dc.send(JSON.stringify({ type: 'request-file-stream', fileId: m.id }));
        }
      });
    };

    dc.onclose = () => {
      peerData.activeFileId = null;
      quotaGuard.reset();
    };

    dc.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        let payload;
        try {
          const rawStr = event.data;
          payload = event._parsedCache || (event._parsedCache = JSON.parse(rawStr));
        } catch (e) {
          return;
        }

        if (payload.type === 'request-file-stream') {
          const cachedFile = sessionSenderFiles.get(payload.fileId);
          if (cachedFile) {
            streamDirectZeroCopyPipe(dc, peerData, peerId, cachedFile, payload.fileId);
          }
        }
        else if (payload.type === 'file-header') {
          if (sessionCompletedDownloads.has(payload.id)) {
            peerData.activeFileId = null;
            return;
          }

          if (window.dropwireDesktop?.getDesktopFile) {
            try {
              const desktopEntry = await window.dropwireDesktop.getDesktopFile(payload.id);
              if (desktopEntry && desktopEntry.streamUrl) {
                saveCompletedDownload(payload.id, desktopEntry.streamUrl);
                sendSignal({ type: 'read-receipt', messageId: payload.id });
                if (dc.readyState === 'open') {
                  dc.send(JSON.stringify({ type: 'file-ack', id: payload.id }));
                }
                peerData.activeFileId = null;
                return;
              }
            } catch (err) {}
          }

          const safeMime = detectMimeType(payload.name, payload.mimeType);
          peerData.activeFileId = payload.id;
          quotaGuard.reset();

          const writer = new UniversalDiskWriter(payload.id, payload.name, safeMime);
          if (!payload.wasPreCompressed && payload.size >= 10 * 1024 * 1024) {
            await writer.init(payload.size);
          }

          sessionPartialChunks.set(payload.id, {
            chunks: [],
            receivedBytes: 0,
            mimeType: safeMime,
            size: payload.size,
            wasPreCompressed: Boolean(payload.wasPreCompressed),
            diskWriter: writer
          });
        }
        else if (payload.type === 'file-eof') {
          const targetId = payload.id || peerData.activeFileId;
          const partial = sessionPartialChunks.get(targetId);
          if (partial) {
            await finalizeDirectReceivedFile(targetId, partial);
          }
          if (peerData.activeFileId === targetId) peerData.activeFileId = null;
          if (dc.readyState === 'open') {
            dc.send(JSON.stringify({ type: 'file-ack', id: targetId }));
          }
        }
        else if (payload.type === 'file-ack') {
          const resolveAck = peerData.ackResolvers?.get(payload.id);
          if (resolveAck) {
            peerData.ackResolvers.delete(payload.id);
            resolveAck();
          }
        }
      } 
      else if (event.data instanceof ArrayBuffer) {
        try {
          if (event.data.byteLength >= 280 * 1024) {
            throw new Error('Oversized DoS flood payload');
          }
          quotaGuard.validateChunk(event.data);
        } catch (dosError) {
          const attackerPeer = membersRef.current.find(m => m.id === peerId)?.name || 'A participant';
          sendSignal({
            type: 'chat-message',
            message: {
              id: 'sec-' + Date.now(),
              type: 'system-security-incident',
              timestamp: Date.now(),
              title: 'RAM Flood DoS Exploit Intercepted',
              attackerName: attackerPeer,
              attackerId: peerId,
              text: `Security Alert: ${attackerPeer} attempted a RAM-exhaustion DoS attack. Channel severed.`
            }
          });
          if (onSecurityAlert) {
            onSecurityAlert({
              title: 'RAM Flood DoS Intercepted',
              message: `Received illegal ${(event.data.byteLength / 1024).toFixed(1)}KB chunk from ${attackerPeer}. Connection severed.`,
              variant: 'danger'
            });
          }
          dc.close();
          pc.close();
          return;
        }

        const activeFid = peerData.activeFileId;
        if (activeFid) {
          const partial = sessionPartialChunks.get(activeFid);
          if (!partial) return;

          partial.receivedBytes += event.data.byteLength;
          if (partial.diskWriter && partial.diskWriter.useDisk) {
            partial.diskWriter.writeChunk(event.data);
          } else {
            partial.chunks.push(event.data);
          }
        }
      }
    };
  }

  function streamDirectZeroCopyPipe(dc, peerData, peerId, file, fileId) {
    if (!dc || dc.readyState !== 'open') return Promise.resolve();

    const safeMime = detectMimeType(file.name, file.type);
    const startTime = performance.now();
    const HIGH_WATER_MARK = 2 * 1024 * 1024;
    dc.bufferedAmountLowThreshold = 512 * 1024;

    dc.send(JSON.stringify({
      type: 'file-header',
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: safeMime,
      wasPreCompressed: Boolean(file._wasPreCompressed)
    }));

    return new Promise((resolve) => {
      let fileOffset = 0;
      let currentMacroBuf = null;
      let macroOffset = 0;
      let isReadingDisk = false;
      let eofSent = false;
      let lastUiUpdate = 0;
      let isCanceled = false; // 🛑 Prevents orphan setTimeout from resurrecting 0% progress!

      const MACRO_READ_SIZE = 8 * 1024 * 1024;

      const ackTimeout = setTimeout(() => {
        cleanup();
        resolve();
      }, 90000);

      peerData.ackResolvers.set(fileId, () => {
        cleanup();
        resolve();
      });

      function cleanup() {
        isCanceled = true;
        clearTimeout(ackTimeout);
        peerData.ackResolvers.delete(fileId);
        if (dc) dc.onbufferedamountlow = null;
        currentMacroBuf = null;
        setSenderProgress(null);
        maxDisplayedPercentRef.current = 0;
      }

      async function pump() {
        // If canceled by file-ack or closed, EXIT IMMEDIATELY! Never touch senderProgress again!
        if (isCanceled || dc.readyState !== 'open') {
          cleanup();
          resolve();
          return;
        }

        let sentInThisTick = 0;
        const MAX_TICK_BURST = 256 * 1024;

        while (dc.bufferedAmount < HIGH_WATER_MARK && sentInThisTick < MAX_TICK_BURST) {
          if (isCanceled) return;

          if (!currentMacroBuf || macroOffset >= currentMacroBuf.byteLength) {
            if (fileOffset >= file.size) {
              if (!eofSent) {
                eofSent = true;
                if (dc.readyState === 'open') {
                  dc.send(JSON.stringify({ type: 'file-eof', id: fileId }));
                }
              }
              return;
            }
            if (isReadingDisk) return;
            isReadingDisk = true;
            const nextEnd = Math.min(file.size, fileOffset + MACRO_READ_SIZE);
            try {
              currentMacroBuf = await file.slice(fileOffset, nextEnd).arrayBuffer();
              macroOffset = 0;
              isReadingDisk = false;
            } catch (err) {
              isReadingDisk = false;
              cleanup();
              resolve();
              return;
            }
          }

          if (isCanceled || dc.readyState !== 'open') return;

          const len = Math.min(ZERO_COPY_CHUNK_SIZE, currentMacroBuf.byteLength - macroOffset);
          const view = new Uint8Array(currentMacroBuf, macroOffset, len);
          macroOffset += len;
          fileOffset += len;
          sentInThisTick += len;

          dc.send(view);

          const now = performance.now();
          if (now - lastUiUpdate > 350 || fileOffset >= file.size) {
            reportMonotonicSenderProgress(fileId, file.name, file.size, peerId, fileOffset, startTime);
            lastUiUpdate = now;
          }
        }

        if (!isCanceled && dc.readyState === 'open' && fileOffset < file.size && dc.bufferedAmount < HIGH_WATER_MARK) {
          setTimeout(pump, 8);
        }
      }

      dc.onbufferedamountlow = pump;
      // Wait 40ms for desktop local-handshake file-ack before starting network pump
      setTimeout(() => {
        if (!isCanceled) pump();
      }, 40);
    });
  }

  function streamEncryptedViaRelay(targetId, file, fileId) {
    const worker = getHyperTransferWorker();
    const jobId = `relay_${fileId}_${targetId}_${Date.now()}`;
    const safeMime = detectMimeType(file.name, file.type);
    const RELAY_CHUNK_SIZE = 64 * 1024;
    const startTime = performance.now();
    let sentRawBytes = 0;

    sendSignal({
      type: 'relay-file-header',
      targetId,
      id: fileId,
      name: file.name,
      size: file.size,
      chunkSize: RELAY_CHUNK_SIZE,
      mimeType: safeMime,
      wasPreCompressed: Boolean(file._wasPreCompressed)
    });

    return new Promise((resolve) => {
      function onWorkerRelayMacro(e) {
        const msg = e.data;
        if (!msg || msg.jobId !== jobId) return;

        if (msg.type === 'SEND_READY') {
          worker.postMessage({ type: 'PULL_MACRO_BLOCK', jobId });
        }
        else if (msg.type === 'MACRO_BLOCK_READY') {
          const packets = msg.packets || [];
          for (const pkt of packets) {
            const bytes = new Uint8Array(pkt.buffer);
            const chunks = [];
            for (let i = 0; i < bytes.byteLength; i += 8192) {
              chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
            }
            const base64 = btoa(chunks.join(''));
            sendSignal({ type: 'relay-file-chunk', targetId, id: fileId, base64 });
            sentRawBytes += pkt.rawBytes;
          }
          reportMonotonicSenderProgress(fileId, file.name, file.size, targetId, sentRawBytes, startTime);

          if (msg.isDone) {
            worker.removeEventListener('message', onWorkerRelayMacro);
            setSenderProgress(null);
            maxDisplayedPercentRef.current = 0;
            resolve();
          } else {
            setTimeout(() => worker.postMessage({ type: 'PULL_MACRO_BLOCK', jobId }), 10);
          }
        }
      }

      worker.addEventListener('message', onWorkerRelayMacro);
      worker.postMessage({
        type: 'INIT_SEND',
        jobId,
        fileId,
        file,
        roomId: roomIdRef.current,
        pepper: getFileCryptoPepper(),
        chunkSize: RELAY_CHUNK_SIZE,
        encryptInJs: true
      });
    });
  }

  async function broadcastFile(file, id) {
    sessionSenderFiles.set(id, file);
    maxDisplayedPercentRef.current = 0;
    peerSentBytesRef.current.set(id, new Map());

    // 1. Register in Electron native process if on desktop
    if (window.dropwireDesktop?.getFilePath && window.dropwireDesktop?.registerDesktopFile) {
      const nativePath = window.dropwireDesktop.getFilePath(file._rawNativeFile || file);
      if (nativePath) {
        await window.dropwireDesktop.registerDesktopFile(id, nativePath, file.name, file.size, file.type);
      }
    }

    saveCompletedDownload(id, URL.createObjectURL(file));

    const otherMembers = membersRef.current.filter(m => m.id !== myId);
    if (otherMembers.length === 0) {
      setSenderProgress(null);
      return true;
    }

    // Set progress to 100% immediately for local same-machine instances
    setSenderProgress({
      id,
      name: file.name,
      percent: 100,
      elapsed: '0.0',
      speed: 'Direct'
    });

    if (isStealthMode) {
      await Promise.all(otherMembers.map(peer => streamEncryptedViaRelay(peer.id, file, id)));
      setSenderProgress(null);
      return true;
    }

    // Initiate WebRTC DataChannel stream with a 10s safety timeout
    await Promise.race([
      Promise.all(
        otherMembers.map(member => {
          const peer = peersRef.current.get(member.id);
          if (peer?.dataChannel?.readyState === 'open') {
            return streamDirectZeroCopyPipe(peer.dataChannel, peer, member.id, file, id);
          }
          return Promise.resolve();
        })
      ),
      new Promise(res => setTimeout(res, 10000))
    ]);

    setSenderProgress(null);
    return true;
  }

  function requestOrResumeDownload(messageObj) {
    const fileId = messageObj.id;
    const matchedMember = membersRef.current.find(
      mem => mem.id === messageObj.senderId || (mem.name && messageObj.senderName && mem.name === messageObj.senderName)
    );
    const senderId = matchedMember?.id || messageObj.senderId;

    if (isStealthMode) {
      sendSignal({ type: 'relay-file-request', targetId: senderId, fileId });
      return;
    }

    const peer = peersRef.current.get(senderId);
    if (peer?.dataChannel?.readyState === 'open') {
      peer.dataChannel.send(JSON.stringify({ type: 'request-file-stream', fileId }));
    } else if (senderId) {
      setupPeerConnection(senderId, true);
    }
  }

  return {
    peersRef,
    localDownloads,
    senderProgress,
    receiverTransfers,
    requestOrResumeDownload,
    securityCode,
    activeConnectionAudit,
    broadcastFile
  };
}

