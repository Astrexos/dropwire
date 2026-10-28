// client/src/components/MessageList.jsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Check, CheckCheck, FileDown, Maximize2, 
  Pin, PinOff, Trash2, Clock, AlertTriangle, FileText,
  Smile, CornerUpLeft, MoreVertical, Shield, EyeOff, Eye, Flame
} from 'lucide-react';

import { QUICK_EMOJIS } from '../constants/emotes';
import { formatBytes, isImageFile, isVideoFile } from '../utils/media';
import { WaveformVoicePlayer, SyncedChatGif } from './AudioComponents';

export default function MessageList({
  messages, 
  myId, 
  myName = '', 
  members, 
  pinnedId, 
  localDownloads, 
  receiverTransfers = new Map(), 
  onRequestDownload,
  isSelectMode, 
  selectedIds, 
  onToggleSelect, 
  onOpenContextMenu, 
  onToggleReaction,
  onReply,
  onBurnPhantomMessage,
  onOpenLightbox, 
  onTogglePin, 
  onInitiateDeleteBatch, 
  onCancelSelectMode,
  senderProgress, 
  messagesEndRef
}) {
  const activeVideoRefs = useRef(new Map());
  const [failedVideoIds, setFailedVideoIds] = useState(new Set());
  const [openEmojiPickerMsgId, setOpenEmojiPickerMsgId] = useState(null);
  const [heldPhantomMsgId, setHeldPhantomMsgId] = useState(null);

  // Jump to Replied Message State & 1.8s Animation Timer
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const highlightTimerRef = useRef(null);

  const pinnedMessage = messages.find(m => m.id === pinnedId);

  useEffect(() => {
    const closePicker = () => setOpenEmojiPickerMsgId(null);
    window.addEventListener('click', closePicker);
    return () => window.removeEventListener('click', closePicker);
  }, []);

  useEffect(() => {
    if (!heldPhantomMsgId) return;
    const handleBlurOrRelease = () => {
      const targetId = heldPhantomMsgId;
      setHeldPhantomMsgId(null);
      if (targetId && onBurnPhantomMessage) {
        onBurnPhantomMessage(targetId);
      }
    };
    window.addEventListener('blur', handleBlurOrRelease);
    window.addEventListener('mouseup', handleBlurOrRelease);
    window.addEventListener('touchend', handleBlurOrRelease);
    return () => {
      window.removeEventListener('blur', handleBlurOrRelease);
      window.removeEventListener('mouseup', handleBlurOrRelease);
      window.removeEventListener('touchend', handleBlurOrRelease);
    };
  }, [heldPhantomMsgId, onBurnPhantomMessage]);

  function scrollToMessage(targetId) {
    if (!targetId) return;
    const el = document.getElementById('msg-' + targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedMsgId(targetId);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedMsgId(null);
        highlightTimerRef.current = null;
      }, 1800);
    }
  }

  const lastReadMessageIdByMember = new Map();

  messages.forEach(msg => {
    members.forEach(mem => {
      if (mem.id === myId) return;
      const isSenderOfThisMsg =
        (msg.senderId && msg.senderId === mem.id) ||
        (msg.senderName && mem.name && msg.senderName === mem.name);
      const hasReadThisMsg = Array.isArray(msg.readBy) && msg.readBy.includes(mem.id);

      if (isSenderOfThisMsg || hasReadThisMsg) {
        lastReadMessageIdByMember.set(mem.id, msg.id);
      }
    });
  });

  const watermarkReadersByMsgId = new Map();
  lastReadMessageIdByMember.forEach((msgId, memberId) => {
    const memObj = members.find(m => m.id === memberId);
    if (memObj) {
      if (!watermarkReadersByMsgId.has(msgId)) {
        watermarkReadersByMsgId.set(msgId, []);
      }
      watermarkReadersByMsgId.get(msgId).push(memObj);
    }
  });

  let highestWatermarkIndex = -1;
  messages.forEach((msg, i) => {
    if (watermarkReadersByMsgId.has(msg.id)) highestWatermarkIndex = i;
  });

  async function handleDownloadFile(e, msg, downloadUrl) {
    e.stopPropagation();
    if (!downloadUrl) return;

    if (window.dropwireDesktop?.saveDesktopFile && downloadUrl.startsWith('dropwire-file:')) {
      await window.dropwireDesktop.saveDesktopFile(msg.id, msg.fileName);
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = msg.fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-transparent relative">
      {pinnedMessage && (
        <div className="px-5 py-2 bg-[#0d1322]/95 border-b border-slate-800/80 flex items-center justify-between z-10 shrink-0 backdrop-blur-md">
          <div 
            onClick={() => document.getElementById('msg-' + pinnedMessage.id)?.scrollIntoView({ behavior: 'smooth' })}
            className="max-w-4xl mx-auto w-full flex items-center justify-between cursor-pointer min-w-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Pin size={14} className="text-blue-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block leading-tight">
                  Pinned Message
                </span>
                <span className="text-xs text-slate-300 truncate block">
                  {pinnedMessage.isPhantom ? '🔒 Phantom Shroud Message' : (pinnedMessage.text || pinnedMessage.caption || pinnedMessage.fileName)}
                </span>
              </div>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(pinnedMessage.id);
              }}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-2 cursor-pointer"
              title="Unpin"
            >
              <PinOff size={14} />
            </button>
          </div>
        </div>
      )}

      {isSelectMode && (
        <div className="px-5 py-2 bg-[#0d1322] border-b border-blue-500/30 shrink-0 animate-in slide-in-from-top-1">
          <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
            <span className="text-xs text-slate-200 font-semibold">
              Selected ({selectedIds.size})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onInitiateDeleteBatch}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-md shadow-red-600/20 cursor-pointer"
              >
                <Trash2 size={13} /> Delete ({selectedIds.size})
              </button>
              <button
                onClick={onCancelSelectMode}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 custom-scrollbar h-0 min-h-0">
        <div className="max-w-4xl mx-auto w-full flex flex-col">
          <div className="w-full flex justify-center my-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0d1322] border border-slate-800/80 text-[10px] font-mono text-slate-400 shadow-sm">
              <Shield size={11} className="text-emerald-400" />
              <span>ZERO-KNOWLEDGE E2EE MESH • {members.length} {members.length === 1 ? 'MEMBER' : 'MEMBERS'}</span>
            </div>
          </div>

          {messages.map((m, idx) => {
            const isMe =
              (m.senderId && m.senderId === myId) ||
              (m.senderName && myName && m.senderName === myName);

            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const isSameSenderAsPrev = Boolean(
              prevMsg &&
              ((prevMsg.senderId && m.senderId && prevMsg.senderId === m.senderId) ||
               (prevMsg.senderName && m.senderName && prevMsg.senderName === m.senderName))
            );

            const isImage = m.type === 'file' && isImageFile(m.fileName, m.mimeType);
            const isVideo = m.type === 'file' && isVideoFile(m.fileName, m.mimeType);
            const isPdf = m.type === 'file' && (m.mimeType === 'application/pdf' || m.fileName?.toLowerCase().endsWith('.pdf'));
            const isAudio = m.type === 'audio';
            const isGif = m.type === 'gif';
            const isSelected = selectedIds.has(m.id);

            const activeDownloadUrl = localDownloads.get(m.id);
            const isSenderStreaming = isMe && Boolean(senderProgress && senderProgress.id === m.id && senderProgress.percent < 100);
            const isTransferFinished = Boolean(activeDownloadUrl);

            // Hide unready file message from receiver entirely until ready
            if (!isMe && m.type === 'file' && !isTransferFinished) {
              return null;
            }

            const hasCodecError = failedVideoIds.has(m.id);

            const hasBeenRead =
              idx <= highestWatermarkIndex ||
              Boolean(m.readBy && m.readBy.some(id => id !== myId));

            const hasReactions = m.reactions && Object.keys(m.reactions).length > 0;
            const watermarkReaders = watermarkReadersByMsgId.get(m.id) || [];
            const isEmojiDrawerOpen = openEmojiPickerMsgId === m.id;
            const isPhantomHeld = heldPhantomMsgId === m.id;
            const isHighlighted = highlightedMsgId === m.id;

            return (
              <div 
                key={m.id} 
                id={'msg-' + m.id}
                className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} ${
                  idx === 0 ? 'mt-1' : isSameSenderAsPrev ? 'mt-1' : 'mt-3'
                }`}
              >
                {!isMe && !isSameSenderAsPrev && (
                  <span className="text-[11px] font-semibold text-blue-400 px-1 mb-0.5">
                    {m.senderName}
                  </span>
                )}

                <div className={`flex items-center gap-1.5 max-w-[78%] sm:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {isSelectMode && isMe && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(m.id)}
                      className="w-4 h-4 rounded accent-blue-600 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                    />
                  )}

                  <div className="flex flex-col min-w-0">
                    {m.isPhantom ? (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setHeldPhantomMsgId(m.id);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setHeldPhantomMsgId(m.id);
                        }}
                        onContextMenu={(e) => onOpenContextMenu(e, m)}
                        className={`relative rounded-2xl px-4 py-2.5 border transition-all cursor-pointer select-none overflow-hidden shadow-lg ${
                          isPhantomHeld
                            ? 'bg-[#0d1322] border-emerald-500/60 text-white ring-2 ring-emerald-500/20'
                            : isMe
                            ? 'bg-blue-950/60 border-blue-500/40 text-blue-200'
                            : 'bg-[#0d1322] border-amber-500/40 text-slate-200'
                        }`}
                      >
                        {!isPhantomHeld ? (
                          <div className="flex items-center gap-2.5 py-0.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                              <EyeOff size={14} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>Phantom Shroud</span>
                                <Flame size={12} className="text-amber-400" />
                              </div>
                              <div className="text-[10px] font-mono text-amber-300/90">
                                {isMe ? 'Hold to preview (Burns when peer releases)' : 'Press & hold to decrypt • Burns on release'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 animate-in fade-in duration-100">
                            <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-emerald-400 border-b border-white/10 pb-1">
                              <span className="flex items-center gap-1">
                                <Eye size={11} /> DECRYPTED • RELEASE TO BURN
                              </span>
                              <span>{m.time}</span>
                            </div>
                            <div className="text-sm text-white pt-0.5 whitespace-pre-wrap break-words">
                              {m.text || m.caption}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isGif ? (
                      <div 
                        onContextMenu={(e) => onOpenContextMenu(e, m)}
                        className={`relative rounded-2xl overflow-hidden shadow-xl border border-slate-800 max-w-[300px] w-full ${
                          isMe ? 'rounded-br-sm' : 'rounded-bl-sm'
                        }`}
                      >
                        <SyncedChatGif mp4Url={m.mp4Url} gifUrl={m.gifUrl} sentAt={m.sentAt} />
                        <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[10px] font-mono bg-black/65 px-2 py-0.5 rounded-full text-white/90">
                          <span>{m.time}</span>
                          {isMe && (hasBeenRead ? <CheckCheck size={12} className="text-blue-300" /> : <Check size={12} className="text-slate-300" />)}
                        </div>
                      </div>
                    ) : isAudio ? (
                      <div 
                        onContextMenu={(e) => onOpenContextMenu(e, m)}
                        className="flex flex-col items-end"
                      >
                        <WaveformVoicePlayer url={m.downloadUrl} isMe={isMe} />
                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 mt-0.5 px-1">
                          <span>{m.time}</span>
                          {isMe && (hasBeenRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} className="text-slate-400" />)}
                        </div>
                      </div>
                    ) : (
                      <div 
                        onContextMenu={(e) => onOpenContextMenu(e, m)}
                        className={`relative flex flex-col w-fit max-w-full ${
                          m.type === 'file' ? 'min-w-[220px]' : ''
                        } rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${
                          isSelectMode && isMe ? 'cursor-pointer' : ''
                        } ${
                          isHighlighted
                            ? 'ring-2 ring-blue-400 scale-[1.02] shadow-[0_0_25px_rgba(59,130,246,0.6)]'
                            : ''
                        } ${
                          isSelected
                            ? 'ring-2 ring-blue-400 bg-blue-700 text-white'
                            : isMe
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-[#0d1322] text-slate-100 rounded-bl-sm border border-slate-800/90'
                        }`}
                      >
                        {/* 🔗 CLICKABLE REPLY QUOTE BANNER (Smoothly scrolls & pulses original message!) */}
                        {m.replyTo && (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToMessage(m.replyTo.id);
                            }}
                            className="mx-2.5 mt-2 mb-0.5 pl-2.5 border-l-2 border-white/80 bg-black/25 hover:bg-black/40 rounded-r-lg py-1 pr-2 text-xs cursor-pointer transition select-none group/reply"
                            title="Click to jump to replied message"
                          >
                            <div className="flex items-center gap-1">
                              <CornerUpLeft size={10} className="text-blue-300 opacity-80" />
                              <span className="font-bold text-[10px] opacity-90 block text-blue-200 group-hover/reply:underline">
                                {m.replyTo.senderName}
                              </span>
                            </div>
                            <span className="opacity-80 truncate block max-w-[220px] text-[11px] text-slate-200 mt-0.5">
                              {m.replyTo.text}
                            </span>
                          </div>
                        )}

                        {/* 1. PLAYABLE MEDIA (Images, Videos, PDFs) */}
                      {m.type === 'file' && isTransferFinished && (
                        <div className="p-1.5 pb-0">
                          {isImage ? (
                            <div
                              className="relative group/media cursor-pointer"
                              onClick={() => onOpenLightbox(activeDownloadUrl, 'image', m.fileName)}
                            >
                              <img
                                src={activeDownloadUrl}
                                alt={m.fileName}
                                className="max-h-80 w-auto object-cover rounded-xl"
                              />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/media:opacity-100 transition-opacity rounded-xl flex items-center justify-center text-white">
                                <Maximize2 size={22} />
                              </div>
                            </div>
                          ) : isVideo ? (
                            <div className="relative group/media overflow-hidden rounded-xl bg-black">
                              {!hasCodecError ? (
                                <>
                                  <video 
                                    key={activeDownloadUrl}
                                    ref={el => activeVideoRefs.current.set(m.id, el)}
                                    src={activeDownloadUrl} 
                                    controls 
                                    playsInline 
                                    preload="metadata"
                                    onError={(e) => {
                                      if (e.currentTarget.error?.code === 4) {
                                        setFailedVideoIds(prev => new Set(prev).add(m.id));
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="max-h-80 w-full rounded-xl bg-black outline-none" 
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const vid = activeVideoRefs.current.get(m.id);
                                      if (vid) vid.pause();
                                      onOpenLightbox(activeDownloadUrl, 'video', m.fileName, vid?.currentTime || 0);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition opacity-0 group-hover/media:opacity-100 cursor-pointer"
                                    title="Expand video"
                                  >
                                    <Maximize2 size={15} />
                                  </button>
                                </>
                              ) : (
                                <div className="p-4 text-center text-xs text-slate-300 flex flex-col items-center gap-1.5">
                                  <AlertTriangle size={20} className="text-amber-400" />
                                  <span className="font-semibold">{m.fileName}</span>
                                  <span className="text-[10px] text-slate-400">
                                    Video codec requires external player. Click Save below to watch on your device.
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : isPdf ? (
                            <div className="p-3 bg-[#060913] rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                                  <FileText size={20} />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-white block truncate">{m.fileName}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">PDF Document • {formatBytes(m.fileSize)}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(activeDownloadUrl, '_blank');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition shrink-0 cursor-pointer"
                              >
                                Open PDF
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}

                        {m.type !== 'file' && (m.text || m.caption) && (
                          <div className="px-3.5 py-1.5 text-sm leading-snug whitespace-pre-wrap break-words">
                            <span>{m.text || m.caption}</span>
                            <span
                              className={`inline-flex items-center gap-1 float-right ml-3 mt-1 text-[10px] font-mono select-none leading-none ${
                                isMe ? 'text-blue-100/80' : 'text-slate-400'
                              }`}
                            >
                              {m.edited && <span className="italic text-[9px]">edited</span>}
                              <span>{m.time}</span>
                              {isMe &&
                                (hasBeenRead ? (
                                  <CheckCheck size={12} className="text-blue-200" />
                                ) : (
                                  <Check size={12} className="text-blue-200/70" />
                                ))}
                            </span>
                          </div>
                        )}

                        {m.type === 'file' && (
                          <>
                            {m.caption && (
                              <div className="px-3.5 pt-2 pb-0.5 text-sm leading-snug whitespace-pre-wrap break-words">
                                {m.caption}
                              </div>
                            )}

                            <div className="px-3.5 py-2 flex flex-col gap-1.5">
                              {/* 1. SENDER PROGRESS BAR: Shows exclusively while senderProgress is active */}
                              {isSenderStreaming ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-4 text-[10px] font-mono text-blue-100">
                                    <span className="truncate max-w-[160px]">Streaming {m.fileName}...</span>
                                    <span className="shrink-0">{senderProgress?.percent || 0}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                                    <div className="h-full bg-white transition-all duration-150" style={{ width: `${senderProgress?.percent || 0}%` }} />
                                  </div>
                                </div>
                              ) : isTransferFinished ? (
                                /* 2. FINISHED STATE: Rendered on Sender AND Receiver once ready! */
                                <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-white/10">
                                  <button
                                    onClick={(e) => handleDownloadFile(e, m, activeDownloadUrl)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                      isMe
                                        ? 'bg-white text-blue-600 hover:bg-blue-50'
                                        : 'bg-blue-600 text-white hover:bg-blue-500'
                                    }`}
                                  >
                                    <FileDown size={13} /> Save ({formatBytes(m.fileSize)})
                                  </button>

                                  <div className={`flex items-center gap-1 text-[10px] font-mono select-none shrink-0 ${isMe ? 'text-blue-100/90' : 'text-slate-400'}`}>
                                    {m.edited && <span className="italic mr-0.5 text-[9px]">edited</span>}
                                    <span>{m.time}</span>
                                    {isMe && (hasBeenRead ? <CheckCheck size={13} className="text-blue-200" /> : <Check size={13} className="text-blue-200/70" />)}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenEmojiPickerMsgId(prev => (prev === m.id ? null : m.id));
                      }}
                      className="p-1.5 rounded-full hover:bg-[#0d1322] text-slate-400 hover:text-white border border-transparent hover:border-slate-800 transition cursor-pointer"
                      title="React"
                    >
                      <Smile size={14} />
                    </button>

                    {onReply && !m.isPhantom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReply(m);
                        }}
                        className="p-1.5 rounded-full hover:bg-[#0d1322] text-slate-400 hover:text-white border border-transparent hover:border-slate-800 transition cursor-pointer"
                        title="Reply"
                      >
                        <CornerUpLeft size={14} />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContextMenu(e, m);
                      }}
                      className="p-1.5 rounded-full hover:bg-[#0d1322] text-slate-400 hover:text-white border border-transparent hover:border-slate-800 transition cursor-pointer"
                      title="More Options"
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>

                {isEmojiDrawerOpen && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="mt-1 flex items-center gap-1 bg-[#0d1322] border border-slate-800 rounded-full px-2.5 py-1 shadow-2xl z-20 animate-in fade-in"
                  >
                    {QUICK_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          onToggleReaction(m.id, emoji);
                          setOpenEmojiPickerMsgId(null);
                        }}
                        className="hover:scale-125 transition-transform px-1.5 py-0.5 text-sm cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {hasReactions && (
                  <div className="flex flex-wrap gap-1 mt-1 px-1">
                    {Object.entries(m.reactions).map(([emoji, usersArr]) => (
                      <button
                        key={emoji}
                        onClick={() => onToggleReaction(m.id, emoji)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition active:scale-95 cursor-pointer ${
                          usersArr.includes(myId) 
                            ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' 
                            : 'bg-[#0d1322] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span className="font-mono font-bold text-[10px]">{usersArr.length}</span>
                      </button>
                    ))}
                  </div>
                )}

                {watermarkReaders.length > 0 && (
                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] text-slate-500 font-mono">Seen by</span>
                    <div className="flex items-center -space-x-1.5">
                      {watermarkReaders.slice(0, 5).map(r => (
                        <div 
                          key={r.id} 
                          title={`Read up to here by ${r.name}`}
                          className="w-4 h-4 rounded-full bg-blue-600 border border-[#060913] text-white text-[9px] font-bold flex items-center justify-center uppercase shadow-sm"
                        >
                          {r.name ? r.name.charAt(0) : '?'}
                        </div>
                      ))}
                    </div>
                    {watermarkReaders.length > 5 && (
                      <span className="text-[9px] text-slate-500 font-mono font-bold">
                        +{watermarkReaders.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

    </div>
  );
}

