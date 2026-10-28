// client/src/components/MultiUserWorkspace.jsx
import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ArrowLeft, PanelRight, EyeOff, UploadCloud, Flame } from 'lucide-react';

import { useWebRTCMesh } from '../hooks/useWebRTCMesh';
import { detectMimeType } from '../utils/media';
import { simulateFloodAttack, simulateForgedSignaling } from '../utils/security';
import { simulateMitMTamper } from '../utils/sasValidator';
import { recordDeletedMessageInVault } from '../utils/phoneVault';
import { encryptForRoom, decryptFromRoom } from '../utils/e2eeChat';
import { purgeAllTemporaryStorage } from '../utils/diskStreamer';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import LiveCallOverlay from './LiveCallOverlay';
import MutualVaultBar from './MutualVaultBar';
import WorkspaceInspectorDrawer from './WorkspaceInspectorDrawer';
import { 
  ContextMenu, 
  MediaLightbox, 
  LeaveRoomModal, 
  DeleteConfirmationModal, 
  SecurityIncidentModal, 
  SeenByModal 
} from './Modals';

export default function MultiUserWorkspace({ 
  ws, 
  sendAuthenticated, 
  myId, 
  myName, 
  myPhone, 
  roomId, 
  members, 
  initialHistory, 
  pinnedId, 
  onLeave, 
  isStealthMode,
  isAwaitingPeerJoin = false
}) {
  const [messages, setMessages] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showInspectorDrawer, setShowInspectorDrawer] = useState(false);
  const [securityIncident, setSecurityIncident] = useState(null);
  const [seenByMessage, setSeenByMessage] = useState(null);

  const [isPhantomMode, setIsPhantomMode] = useState(false);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState(null);

  const [contextMenu, setContextMenu] = useState(null);
  const [lightboxMedia, setLightboxMedia] = useState(null);

  const [copyToast, setCopyToast] = useState(null);
  const toastTimerRef = useRef(null);

  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const messagesEndRef = useRef(null);
  const activePeer = members.find(m => m.id !== myId);

  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [contextMenu]);

  function triggerCopyToast(msg) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setCopyToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }

  function triggerSecurityAlert({ title, message, details = null, variant = 'danger' }) {
    setSecurityIncident({ title, message, details, variant });
  }

  async function decryptMessageObject(msg) {
    if (!msg) return msg;
    const copy = { ...msg };
    if (copy.text) copy.text = await decryptFromRoom(copy.text, roomId);
    if (copy.caption) copy.caption = await decryptFromRoom(copy.caption, roomId);
    if (copy.type === 'audio' && copy.downloadUrl) {
      copy.downloadUrl = await decryptFromRoom(copy.downloadUrl, roomId);
    }
    if (copy.replyTo && copy.replyTo.text) {
      copy.replyTo = {
        ...copy.replyTo,
        text: await decryptFromRoom(copy.replyTo.text, roomId)
      };
    }
    return copy;
  }

  const {
    peersRef, 
    localDownloads, 
    senderProgress, 
    receiverTransfers, 
    requestOrResumeDownload, 
    securityCode, 
    activeConnectionAudit, 
    broadcastFile
  } = useWebRTCMesh({ 
    ws, 
    sendAuthenticated, 
    myId,
    myName,
    roomId, 
    members, 
    messages, 
    isStealthMode,
    onSecurityAlert: triggerSecurityAlert
  });

  useEffect(() => {
    const isTransferActive = Boolean(senderProgress) || receiverTransfers.size > 0;
    if (!isTransferActive) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'A file transfer is currently in progress. Leaving will interrupt the transfer.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [senderProgress, receiverTransfers]);

  useEffect(() => {
    let active = true;
    async function loadAndDecryptHistory() {
      if (!initialHistory || initialHistory.length === 0) {
        setMessages([]);
        return;
      }
      const decryptedList = await Promise.all(initialHistory.map(m => decryptMessageObject(m)));
      if (!active) return;
      const merged = new Map();
      decryptedList.forEach(m => merged.set(m.id, m));
      setMessages(Array.from(merged.values()));
    }
    loadAndDecryptHistory();
    return () => { active = false; };
  }, [initialHistory, roomId]);

  useEffect(() => {
    const handleServerEvents = async (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === 'new-message') {
        const rawMsg = data.message;

        if (rawMsg.type === 'system-security-incident') {
          const isRecent = rawMsg.timestamp && (Date.now() - rawMsg.timestamp < 10000);
          if (isRecent) {
            triggerSecurityAlert({
              title: rawMsg.title || 'Security Incident Detected',
              message: rawMsg.text,
              details: `Attacker: ${rawMsg.attackerName} • P2P Mesh severed.`,
              variant: 'danger'
            });
          }
          return;
        }

        const msg = await decryptMessageObject(rawMsg);
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (msg.senderId !== myId && document.visibilityState === 'visible' && msg.type !== 'file') {
          sendAuthenticated({ type: 'read-receipt', messageId: msg.id });
        }
      }
      else if (data.type === 'message-edited') {
        const decryptedText = await decryptFromRoom(data.newText, roomId);
        setMessages(prev => prev.map(m => m.id === data.id ? { ...m, text: decryptedText, caption: decryptedText, edited: true, editedAt: data.editedAt } : m));
      }
      else if (data.type === 'message-deleted') {
        if (myPhone && activePeer?.phone) {
          recordDeletedMessageInVault(myPhone, activePeer.phone, data.id);
        }
        setMessages(prev => prev.filter(m => m.id !== data.id));
      }
      else if (data.type === 'message-reaction-updated') {
        setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
      }
      else if (data.type === 'message-read') {
        setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, readBy: data.readBy } : m));
      }
      else if (data.type === 'vault-notification') {
        const actionText = data.action === 'saved'
          ? `${data.userName} saved a copy of this chat.`
          : `${data.userName} removed their saved copy.`;
        triggerCopyToast(actionText);
      }
    };

    ws.addEventListener('message', handleServerEvents);
    return () => ws.removeEventListener('message', handleServerEvents);
  }, [myId, myPhone, activePeer?.phone, ws, roomId, sendAuthenticated]);

  async function handleSendMessage(text, replyTarget = null, editId = null) {
    if (editId) {
      const editedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const encryptedEdit = await encryptForRoom(text, roomId);
      sendAuthenticated({ type: 'edit-message', id: editId, newText: encryptedEdit, editedAt });
      return;
    }

    const id = 'msg-' + Date.now();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const encryptedText = await encryptForRoom(text, roomId);
    const replyPayload = replyTarget ? { 
      id: replyTarget.id, 
      text: await encryptForRoom(replyTarget.text || replyTarget.caption || replyTarget.fileName, roomId), 
      senderName: replyTarget.senderName || 'Peer' 
    } : null;

    sendAuthenticated({ 
      type: 'chat-message', 
      message: { 
        id, 
        type: 'text', 
        text: encryptedText, 
        time, 
        senderId: myId,
        senderName: myName,
        replyTo: replyPayload,
        isPhantom: isPhantomMode
      } 
    });
  }

  function handleBurnPhantomMessage(msgId) {
    const targetMsg = messages.find(m => m.id === msgId);
    if (!targetMsg) return;
    sendAuthenticated({ type: 'delete-message', id: msgId });
    setMessages(prev => prev.filter(m => m.id !== msgId));
    triggerCopyToast('Phantom message burned from RAM.');
  }

  async function handleSendFile(file, caption) {
    const id = 'file-' + Date.now();
    const safeMime = detectMimeType(file.name, file.type);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const encryptedCaption = caption ? await encryptForRoom(caption, roomId) : '';

    sendAuthenticated({ 
      type: 'chat-message', 
      message: { 
        id, 
        type: 'file', 
        fileName: file.name, 
        fileSize: file.size, 
        mimeType: safeMime, 
        caption: encryptedCaption, 
        time,
        senderId: myId,
        senderName: myName
      } 
    });

    broadcastFile(file, id);
  }

  async function handleSendVoice(base64Audio) {
    const id = 'audio-' + Date.now();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const encryptedAudio = await encryptForRoom(base64Audio, roomId);
    sendAuthenticated({ 
      type: 'chat-message', 
      message: { id, type: 'audio', downloadUrl: encryptedAudio, time, senderId: myId, senderName: myName } 
    });
  }

  async function handleSendGif(gif, replyTarget = null) {
    const id = 'gif-' + Date.now();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const replyPayload = replyTarget ? { 
      id: replyTarget.id, 
      text: await encryptForRoom(replyTarget.text || replyTarget.caption || replyTarget.fileName, roomId), 
      senderName: replyTarget.senderName || 'Peer' 
    } : null;

    sendAuthenticated({
      type: 'chat-message',
      message: { id, type: 'gif', mp4Url: gif.mp4, gifUrl: gif.gif, sentAt: Date.now(), time, senderId: myId, senderName: myName, replyTo: replyPayload }
    });
  }

  const handleMitMTest = async () => {
    const firstPeer = Array.from(peersRef.current.values())[0];
    if (!firstPeer?.pc?.remoteDescription?.sdp) {
      triggerSecurityAlert({
        title: 'Peer Required',
        message: 'Establish a Direct P2P connection with another tab before testing MitM detection.',
        variant: 'warning'
      });
      return;
    }

    const tamperedCode = await simulateMitMTamper(
      firstPeer.pc.localDescription.sdp,
      firstPeer.pc.remoteDescription.sdp,
      roomId
    );

    triggerSecurityAlert({
      title: 'MitM Attack Simulated',
      message: `Legitimate code is #${securityCode}. Tampered attacker code would be #${tamperedCode}. The divergence (#${securityCode} vs #${tamperedCode}) proves how SAS catches proxies.`,
      variant: 'danger'
    });
  };

  function handleDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDraggingFileOver(true);
    }
  }

  function handleDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingFileOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDraggingFileOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      files.forEach(file => handleSendFile(file, ''));
      triggerCopyToast(`Hyper-Streaming ${files.length} file(s) via Direct P2P...`);
    }
  }

  // 🛡️ INVITE HANDSHAKE GATE: If we actively invited someone who hasn't accepted yet, display waiting card!
  if (isAwaitingPeerJoin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-transparent p-6 select-none">
        <div className="bg-[#0d1322] border border-slate-800/90 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl space-y-5 animate-in fade-in">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
            <div className="relative w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-sm">
              P2P
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-white">Waiting for Peer to Accept...</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your encrypted room invitation has been sent. The chat and call workspace will unlock the moment they accept.
            </p>
          </div>

          <button
            onClick={() => {
              purgeAllTemporaryStorage();
              onLeave();
            }}
            className="w-full py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 text-xs font-bold transition cursor-pointer"
          >
            Cancel Invitation
          </button>
        </div>
      </div>
    );
  }

  const otherPeerNames = members.filter(m => m.id !== myId).map(m => m.name).join(', ') || 'Saved Chat';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex h-full min-h-0 bg-transparent relative select-none overflow-hidden"
    >
      {isDraggingFileOver && (
        <div className="absolute inset-3 z-50 rounded-3xl bg-blue-600/15 border-2 border-dashed border-blue-400 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-[#0d1322] border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-2xl">
            <UploadCloud size={32} />
          </div>
          <div className="text-base font-bold text-white">Drop Anywhere to Hyper-Stream via P2P</div>
          <div className="text-xs font-mono text-blue-300">Zero Cloud Storage • Direct Device-to-Device</div>
        </div>
      )}

      <SecurityIncidentModal 
        incident={securityIncident} 
        onClose={() => setSecurityIncident(null)} 
      />

      <SeenByModal 
        message={seenByMessage}
        members={members}
        myId={myId}
        onClose={() => setSeenByMessage(null)}
      />

      {copyToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#0d1322] border border-slate-700 text-white px-4 py-1.5 rounded-full shadow-2xl text-xs font-semibold z-50 animate-in fade-in whitespace-nowrap">
          {copyToast}
        </div>
      )}

      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 relative">
        <div className="relative px-5 py-3 bg-[#0d1322] border-b border-slate-800/80 flex items-center justify-between shrink-0 z-30 min-h-[56px]">
          <div className="flex items-center gap-2.5 min-w-0 z-10">
            <button
              onClick={() => setShowLeaveModal(true)}
              className="md:hidden p-1.5 rounded-lg bg-[#060913] text-slate-300 hover:text-white border border-slate-800"
              title="Back"
            >
              <ArrowLeft size={15} />
            </button>

            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs uppercase shrink-0">
              {otherPeerNames.slice(0, 2)}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-[200px]">
                  {otherPeerNames}
                </h2>
                <button
                  onClick={() => setShowInspectorDrawer(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#060913] hover:bg-slate-800 text-[10px] font-mono border border-slate-800 transition cursor-pointer shrink-0"
                  title="Open Security & Mesh Inspector"
                >
                  <ShieldCheck size={12} className="text-emerald-400" />
                  <span className="text-slate-300">#{securityCode || 'E2EE'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center justify-center z-10">
            <MutualVaultBar 
              sendAuthenticated={sendAuthenticated}
              myName={myName}
              myPhone={myPhone}
              peer={activePeer}
              messages={messages}
              onLoadSavedMessages={setMessages}
              onNotify={triggerCopyToast}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 z-10">
            <button
              onClick={() => {
                const next = !isPhantomMode;
                setIsPhantomMode(next);
                triggerCopyToast(
                  next
                    ? 'Phantom Shroud ON: Messages require hold-to-decrypt & burn on release!'
                    : 'Phantom Shroud OFF: Standard E2EE messages.'
                );
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                isPhantomMode
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10'
                  : 'bg-[#060913] border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Tier 1 Phantom Shroud: Messages arrive blurred and burn the instant the reader releases their cursor"
            >
              <EyeOff size={12} className={isPhantomMode ? 'text-amber-400' : 'text-slate-400'} />
              <span className="hidden lg:inline">{isPhantomMode ? 'Phantom: ON' : 'Phantom'}</span>
            </button>

            <LiveCallOverlay 
              ws={ws}
              sendAuthenticated={sendAuthenticated}
              myId={myId}
              myName={myName}
              members={members}
              isStealthMode={isStealthMode}
            />

            <button
              onClick={() => setShowInspectorDrawer(prev => !prev)}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                showInspectorDrawer
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-[#060913] hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
              }`}
              title="Toggle Workspace Inspector (Files, Mesh Telemetry, Pinned)"
            >
              <PanelRight size={15} />
            </button>
          </div>
        </div>

        <MessageList 
          messages={messages}
          myId={myId}
          myName={myName}
          members={members}
          pinnedId={pinnedId}
          localDownloads={localDownloads}
          receiverTransfers={receiverTransfers}
          onRequestDownload={requestOrResumeDownload}
          isSelectMode={isSelectMode}
          selectedIds={selectedIds}
          onToggleSelect={(id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onOpenContextMenu={(e, m) => { e.preventDefault(); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 300), message: m }); }}
          onToggleReaction={(id, emoji) => sendAuthenticated({ type: 'toggle-reaction', messageId: id, emoji })}
          onReply={(m) => { setEditingMessage(null); setReplyingTo(m); }}
          onBurnPhantomMessage={handleBurnPhantomMessage}
          onOpenLightbox={(url, type, fileName, initialTime = 0) => setLightboxMedia({ url, type, fileName, initialTime })}
          onTogglePin={(id) => sendAuthenticated({ type: 'pin-message', messageId: pinnedId === id ? null : id })}
          onInitiateDeleteBatch={() => setPendingDeleteIds(Array.from(selectedIds))}
          onCancelSelectMode={() => { setIsSelectMode(false); setSelectedIds(new Set()); }}
          senderProgress={senderProgress}
          messagesEndRef={messagesEndRef}
        />

        {isPhantomMode && (
          <div className="max-w-4xl mx-auto w-full px-6 pb-1 flex items-center justify-between text-[11px] text-amber-300 font-mono">
            <span className="flex items-center gap-1.5">
              <Flame size={12} className="text-amber-400" />
              Phantom Shroud Active: Next message requires hold-to-decrypt &amp; burns on release.
            </span>
            <button
              onClick={() => setIsPhantomMode(false)}
              className="underline hover:text-white cursor-pointer"
            >
              Disable
            </button>
          </div>
        )}

        <MessageComposer 
          onSendMessage={handleSendMessage}
          onSendFile={handleSendFile}
          onSendGif={handleSendGif}
          onSendVoiceNote={handleSendVoice}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          peerDisplayName={activePeer?.name || 'Peer'}
          onSecurityAlert={triggerSecurityAlert}
        />
      </div>

      <WorkspaceInspectorDrawer
        isOpen={showInspectorDrawer}
        onClose={() => setShowInspectorDrawer(false)}
        messages={messages}
        localDownloads={localDownloads}
        senderProgress={senderProgress}
        receiverTransfers={receiverTransfers}
        onRequestDownload={requestOrResumeDownload}
        onOpenLightbox={(url, type, fileName) => setLightboxMedia({ url, type, fileName, initialTime: 0 })}
        pinnedId={pinnedId}
        onTogglePin={(id) => sendAuthenticated({ type: 'pin-message', messageId: pinnedId === id ? null : id })}
        securityCode={securityCode}
        audit={activeConnectionAudit}
        isStealthMode={isStealthMode}
        onRunMitMTest={handleMitMTest}
        onRunFloodTest={() => {
          const firstOpen = Array.from(peersRef.current.values()).find(p => p.dataChannel?.readyState === 'open');
          if (firstOpen?.dataChannel) {
            try {
              simulateFloodAttack(firstOpen.dataChannel);
            } catch (err) {
              triggerSecurityAlert({ title: 'Simulation Error', message: err.message, variant: 'danger' });
            }
          } else {
            triggerSecurityAlert({
              title: 'Connection Offline',
              message: 'Direct P2P DataChannel is not active (or room is in Stealth Mode).',
              variant: 'warning'
            });
          }
        }}
        onRunSignalingTest={() => {
          simulateForgedSignaling(ws, roomId);
          triggerCopyToast('Dispatched packet with forged HMAC token to server.');
        }}
      />

      <ContextMenu 
        contextMenu={contextMenu}
        myId={myId}
        pinnedId={pinnedId}
        onReply={(m) => { setEditingMessage(null); setReplyingTo(m); setContextMenu(null); }}
        onEdit={(m) => { setReplyingTo(null); setEditingMessage(m); setContextMenu(null); }}
        onCopy={(m) => { navigator.clipboard.writeText(m.text || m.caption || localDownloads.get(m.id) || ''); triggerCopyToast('Copied to clipboard!'); setContextMenu(null); }}
        onShowSeenBy={(msg) => { setSeenByMessage(msg); setContextMenu(null); }}
        onTogglePin={(id) => { sendAuthenticated({ type: 'pin-message', messageId: pinnedId === id ? null : id }); setContextMenu(null); }}
        onSelect={(id) => { setIsSelectMode(true); setSelectedIds(new Set([id])); setContextMenu(null); }}
        onDelete={(id) => { setPendingDeleteIds([id]); setContextMenu(null); }}
      />

      <MediaLightbox lightboxMedia={lightboxMedia} onClose={() => setLightboxMedia(null)} />
      
      <LeaveRoomModal 
        isOpen={showLeaveModal} 
        onCancel={() => setShowLeaveModal(false)} 
        onConfirm={() => {
          setShowLeaveModal(false);
          purgeAllTemporaryStorage();
          onLeave();
        }} 
      />
      
      <DeleteConfirmationModal 
        pendingDeleteIds={pendingDeleteIds}
        onCancel={() => setPendingDeleteIds(null)}
        onConfirm={() => {
          pendingDeleteIds.forEach(id => {
            if (myPhone && activePeer?.phone) {
              recordDeletedMessageInVault(myPhone, activePeer.phone, id);
            }
            sendAuthenticated({ type: 'delete-message', id });
          });
          setPendingDeleteIds(null);
          setSelectedIds(new Set());
          setIsSelectMode(false);
        }}
      />
    </div>
  );
}

