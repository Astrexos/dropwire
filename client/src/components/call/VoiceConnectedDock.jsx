// client/src/components/call/VoiceConnectedDock.jsx
import React, { useState } from 'react';
import {
  Wifi, PhoneOff, Video, VideoOff, Monitor, Mic, MicOff,
  Headphones, VolumeX, LayoutGrid, AudioLines
} from 'lucide-react';
import { getInitials, getTileColorClass } from './CallTiles';

export default function VoiceConnectedDock({
  roomName = 'Voice / DropWire',
  myId,
  myName,
  members = [],
  isSpeaking,
  remoteSpeakingMap,
  pingMs = 18,
  isMuted,
  isDeafened,
  isCamOn,
  isScreenSharing,
  isStageMinimized,
  onToggleMute,
  onToggleDeafen,
  onToggleCam,
  onToggleScreenShare,
  onToggleStageMinimized,
  onEndCall
}) {
  const [showPingTooltip, setShowPingTooltip] = useState(false);

  const pingColor =
    pingMs < 80 ? 'text-emerald-400' : pingMs < 160 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="fixed bottom-16 left-3 z-40 w-64 bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden select-none text-xs animate-in fade-in">
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              onMouseEnter={() => setShowPingTooltip(true)}
              onMouseLeave={() => setShowPingTooltip(false)}
              className="relative w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 cursor-pointer shrink-0"
            >
              <Wifi size={16} />

              {showPingTooltip && (
                <div className="absolute -top-9 left-0 bg-[#060913] border border-slate-800 px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap text-[11px] font-bold flex items-center gap-1.5 z-50">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className={pingColor}>{pingMs} ms</span>
                  <span className="text-slate-400 font-normal">RTC Connected</span>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="font-bold text-emerald-400 text-xs leading-tight">
                Voice Connected
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                {roomName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleMute}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isMuted
                  ? 'text-red-400 bg-red-500/15'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button
              onClick={onToggleDeafen}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isDeafened
                  ? 'text-red-400 bg-red-500/15'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <VolumeX size={14} /> : <Headphones size={14} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pl-0.5">
          {members.map(m => {
            const isMe = m.id === myId;
            const speaking = isMe ? isSpeaking : Boolean(remoteSpeakingMap?.get(m.id));
            const colorClass = getTileColorClass(m.name || m.id);
            return (
              <div
                key={m.id}
                title={isMe ? `${m.name} (You)` : m.name}
                className={`w-7 h-7 rounded-full ${colorClass} flex items-center justify-center text-[10px] font-bold text-white transition-all ${
                  speaking
                    ? 'ring-2 ring-emerald-400 scale-105'
                    : 'border border-[#060913] opacity-90'
                }`}
              >
                {getInitials(m.name)}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
          <button
            onClick={onToggleCam}
            className={`py-2 rounded-lg flex items-center justify-center transition cursor-pointer ${
              isCamOn
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-[#060913] hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
            title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isCamOn ? <Video size={15} /> : <VideoOff size={15} />}
          </button>

          <button
            onClick={onToggleScreenShare}
            className={`py-2 rounded-lg flex items-center justify-center transition cursor-pointer ${
              isScreenSharing
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-[#060913] hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
            title={isScreenSharing ? 'Stop Sharing' : 'Share Your Screen'}
          >
            <Monitor size={15} />
          </button>

          <button
            onClick={onToggleStageMinimized}
            className={`py-2 rounded-lg flex items-center justify-center transition cursor-pointer ${
              !isStageMinimized
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-[#060913] hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
            title={isStageMinimized ? 'Open Stage View' : 'Minimize Stage View'}
          >
            <LayoutGrid size={15} />
          </button>

          <button
            onClick={onEndCall}
            className="py-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 flex items-center justify-center transition cursor-pointer"
            title="Disconnect"
          >
            <PhoneOff size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

