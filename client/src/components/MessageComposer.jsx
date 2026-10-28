// client/src/components/MessageComposer.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Upload, X, Pencil, Mic, Reply, FileText, Smile, Trash2 } from 'lucide-react';
import { formatBytes } from '../utils/media';
import { validateSafeUpload } from '../utils/fileSanitizer';
import { optimizeAnyAttachment } from '../utils/universalOptimizer';
import { getAppSettings } from './SettingsModal';
import { LiveMicWaveform } from './AudioComponents';
import EmoteDrawer from './EmoteDrawer';

export default function MessageComposer({
  onSendMessage, onSendFile, onSendGif, onSendVoiceNote,
  editingMessage, onCancelEdit, replyingTo, onCancelReply, peerDisplayName,
  onSecurityAlert
}) {
  const [textInput, setTextInput] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showEmoteDrawer, setShowEmoteDrawer] = useState(false);
  const [isSendingGif, setIsSendingGif] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micStream, setMicStream] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (editingMessage) {
      setTextInput(editingMessage.text || editingMessage.caption || '');
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  async function processRawFile(rawFile) {
    if (!rawFile) return;

    const check = validateSafeUpload(rawFile);
    if (!check.safe) {
      if (onSecurityAlert) {
        onSecurityAlert({
          title: 'Malicious File Blocked',
          message: `"${rawFile.name}" was rejected (${check.reason}). DropWire strictly blocks executable transfers.`,
          variant: 'danger'
        });
      }
      return;
    }

    setIsOptimizing(true);
    try {
      const optimizedResult = await optimizeAnyAttachment(rawFile);
      optimizedResult.file._wasPreCompressed = optimizedResult.wasPreCompressed;
      optimizedResult.file._originalSize = rawFile.size;
      optimizedResult.file._rawNativeFile = rawFile;
      setAttachedFile(optimizedResult.file);
    } finally {
      setIsOptimizing(false);
    }
  }

  async function handleFileSelect(e) {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    await processRawFile(rawFile);
  }

  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          e.preventDefault();
          await processRawFile(pastedFile);
          return;
        }
      }
    }
  }

  function handleSend() {
    const text = textInput.trim();

    if (editingMessage) {
      if (!text && !editingMessage.fileName) return;
      onSendMessage(text, null, editingMessage.id);
      setTextInput('');
      onCancelEdit();
      return;
    }

    if (attachedFile) {
      onSendFile(attachedFile, text);
      setAttachedFile(null);
      setTextInput('');
      return;
    }

    if (text) {
      onSendMessage(text, replyingTo);
      setTextInput('');
      onCancelReply();
      setShowEmoteDrawer(false);
    }
  }

  function handleGifSelected(gif) {
    if (isSendingGif) return;
    setIsSendingGif(true);
    onSendGif(gif, replyingTo);
    setShowEmoteDrawer(false);
    onCancelReply();
    setTimeout(() => setIsSendingGif(false), 400);
  }

  async function startRecording() {
    try {
      window.dispatchEvent(new CustomEvent('dropwire-voicenote-state', { detail: { recording: true } }));

      const prefs = getAppSettings();
      const audioConstraint = prefs.micDeviceId && prefs.micDeviceId !== 'default'
        ? { deviceId: { exact: prefs.micDeviceId }, echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression }
        : { echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      setMicStream(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setMicStream(null);
        window.dispatchEvent(new CustomEvent('dropwire-voicenote-state', { detail: { recording: false } }));
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      const micPollMs = 1000;
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(prev => prev + 1), micPollMs);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('dropwire-voicenote-state', { detail: { recording: false } }));
      if (onSecurityAlert) {
        onSecurityAlert({
          title: 'Hardware Permission Denied',
          message: 'Microphone permission is required to record voice notes.',
          variant: 'warning'
        });
      }
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      audioChunksRef.current = [];
    }
  }

  function stopAndSendRecording() {
    if (!mediaRecorderRef.current || !isRecording) return;

    mediaRecorderRef.current.onstop = () => {
      micStream?.getTracks().forEach(t => t.stop());
      setMicStream(null);
      window.dispatchEvent(new CustomEvent('dropwire-voicenote-state', { detail: { recording: false } }));

      const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        onSendVoiceNote(reader.result);
      };
    };

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  }

  const formatTimer = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;

  return (
    <div className="px-4 sm:px-6 pb-3 pt-1 shrink-0 relative">
      <div className="max-w-4xl mx-auto w-full relative">
        {showEmoteDrawer && (
          <EmoteDrawer 
            onSelectEmoji={(emoji) => {
              setTextInput(prev => prev + emoji);
              textareaRef.current?.focus();
            }}
            onSelectGif={handleGifSelected}
            isSendingGif={isSendingGif}
          />
        )}

        <div className="bg-[#0d1322] border border-slate-800/90 focus-within:border-blue-500/50 rounded-2xl shadow-2xl px-2.5 py-1.5 transition-colors">
          {(replyingTo || editingMessage || attachedFile || isOptimizing) && (
            <div className="flex items-center justify-between px-3 py-2 mb-1.5 bg-[#060913] rounded-xl border-l-2 border-blue-500 text-xs animate-in slide-in-from-bottom-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="text-blue-400 shrink-0">
                  {editingMessage ? <Pencil size={15}/> : replyingTo ? <Reply size={15}/> : <FileText size={15}/>}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-blue-400 font-bold text-[11px] leading-tight">
                    {isOptimizing
                      ? 'Optimizing Attachment...'
                      : editingMessage
                      ? 'Edit Message'
                      : replyingTo
                      ? `Reply to ${replyingTo.senderName || peerDisplayName}`
                      : 'Ready to Transfer'}
                  </span>
                  <span className="text-slate-300 text-xs truncate max-w-[320px] leading-tight mt-0.5">
                    {isOptimizing
                      ? 'Compressing for high-speed P2P transfer...'
                      : editingMessage
                      ? (editingMessage.text || editingMessage.caption)
                      : replyingTo
                      ? (replyingTo.text || replyingTo.caption)
                      : `${attachedFile.name} (${formatBytes(attachedFile.size)}${
                          attachedFile._originalSize && attachedFile.size < attachedFile._originalSize
                            ? ` • shrunk from ${formatBytes(attachedFile._originalSize)}`
                            : ''
                        })`}
                  </span>
                </div>
              </div>
              {!isOptimizing && (
                <button 
                  onClick={() => { onCancelEdit(); onCancelReply(); setAttachedFile(null); setTextInput(''); }} 
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X size={14}/>
                </button>
              )}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            {isRecording ? (
              <div className="flex-1 flex items-center justify-between bg-[#060913] border border-red-500/30 rounded-xl px-3.5 py-1.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  <span className="font-mono text-xs text-red-400 font-bold shrink-0">{formatTimer(recordingSeconds)}</span>
                  <LiveMicWaveform stream={micStream} />
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={cancelRecording} 
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    title="Cancel recording"
                  >
                    <Trash2 size={13} /> Cancel
                  </button>
                  <button 
                    onClick={stopAndSendRecording}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-md flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title="Send voice note"
                  >
                    <Send size={13} /> Send
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowEmoteDrawer(prev => !prev); }}
                  className="p-2 text-slate-400 hover:text-blue-400 rounded-xl hover:bg-white/[0.04] transition shrink-0 cursor-pointer" 
                  title="Emojis & GIFs"
                >
                  <Smile size={19} />
                </button>

                <label
                  className="p-2 text-slate-400 hover:text-blue-400 rounded-xl hover:bg-white/[0.04] cursor-pointer transition shrink-0"
                  title="Attach file (or drag & drop anywhere)"
                >
                  <Upload size={19} />
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileSelect} 
                  />
                </label>

                <textarea
                  ref={textareaRef}
                  placeholder={attachedFile ? 'Add a caption...' : 'Write a message...'}
                  value={textInput}
                  onPaste={handlePaste}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  className="flex-1 bg-transparent py-2 px-1.5 text-sm text-white placeholder:text-slate-500 outline-none resize-none max-h-32"
                />

                <button
                  disabled={isOptimizing}
                  onClick={textInput.trim() || attachedFile || editingMessage ? handleSend : startRecording}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 shadow-sm active:scale-95 cursor-pointer ${
                    textInput.trim() || attachedFile || editingMessage
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                      : 'bg-[#060913] hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                  title={textInput.trim() || attachedFile || editingMessage ? 'Send' : 'Record voice note'}
                >
                  {textInput.trim() || attachedFile || editingMessage ? <Send size={16} /> : <Mic size={17} />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

