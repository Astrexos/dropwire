// client/src/components/call/CallTiles.jsx
import React, { useEffect, useRef } from 'react';
import { Monitor, VolumeX, MoreHorizontal } from 'lucide-react';
import { getAppSettings, applySpeakerDeviceToElement } from '../SettingsModal';

export const TILE_PALETTES = [
  'bg-[#1e293b]',
  'bg-[#1d4ed8]',
  'bg-[#0f766e]',
  'bg-[#1e3a2f]',
  'bg-[#3b1d4a]',
  'bg-[#4a1c24]'
];

export function getTileColorClass(seedStr = '') {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TILE_PALETTES[Math.abs(hash) % TILE_PALETTES.length];
}

export function getInitials(name = 'Peer') {
  return String(name).trim().slice(0, 2).toUpperCase() || 'DW';
}

export function ParticipantTile({
  peerId,
  name,
  isMe,
  videoRef,
  stream,
  isCamOn,
  isSpeaking,
  muteAudio,
  userVolume = 100,
  isVideoDisabled = false,
  compact = false,
  styleObj = {},
  onOpenUserMenu
}) {
  const fallbackRef = useRef(null);
  const targetRef = videoRef || fallbackRef;
  const bgClass = getTileColorClass(name || peerId);
  const showVideo = isCamOn && !isVideoDisabled;

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const prefs = getAppSettings();
    const globalSpeakerFactor = (prefs.speakerVolumePercent ?? 100) / 100;
    const shouldMute = Boolean(isMe || muteAudio || userVolume === 0 || globalSpeakerFactor === 0);

    el.muted = shouldMute;
    el.volume = shouldMute ? 0 : Math.min(1, Math.max(0, (userVolume / 100) * globalSpeakerFactor));

    if (!isMe && prefs.speakerDeviceId) {
      applySpeakerDeviceToElement(el, prefs.speakerDeviceId);
    }

    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream, isCamOn, isMe, muteAudio, userVolume, targetRef]);

  // Listen for live Speaker Device or Speaker Volume changes from SettingsModal
  useEffect(() => {
    if (isMe) return;
    const onSettingsSync = (e) => {
      const el = targetRef.current;
      const s = e.detail;
      if (!el || !s) return;
      if (s.speakerDeviceId) {
        applySpeakerDeviceToElement(el, s.speakerDeviceId);
      }
      const globalSpeakerFactor = (s.speakerVolumePercent ?? 100) / 100;
      const shouldMute = Boolean(muteAudio || userVolume === 0 || globalSpeakerFactor === 0);
      el.muted = shouldMute;
      el.volume = shouldMute ? 0 : Math.min(1, Math.max(0, (userVolume / 100) * globalSpeakerFactor));
    };
    window.addEventListener('dropwire-settings-updated', onSettingsSync);
    return () => window.removeEventListener('dropwire-settings-updated', onSettingsSync);
  }, [isMe, muteAudio, userVolume, targetRef]);

  return (
    <div
      style={styleObj}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onOpenUserMenu) onOpenUserMenu(e, peerId, name, isMe);
      }}
      className={`group relative rounded-xl overflow-hidden flex items-center justify-center transition-all select-none ${bgClass} ${
        compact ? 'h-24 w-40 shrink-0' : ''
      } ${
        isSpeaking
          ? 'ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
          : 'border border-slate-800/80'
      }`}
    >
      <video
        ref={targetRef}
        autoPlay
        playsInline
        muted={isMe || muteAudio || userVolume === 0}
        className={`w-full h-full object-cover ${showVideo ? 'block' : 'hidden'}`}
      />

      {!showVideo && (
        <div className="flex flex-col items-center justify-center">
          <div
            className={`${
              compact ? 'w-11 h-11 text-xs' : 'w-20 h-20 text-xl'
            } rounded-full bg-[#060913]/50 backdrop-blur-md border border-white/15 flex items-center justify-center font-bold text-white shadow-xl transition-transform group-hover:scale-105`}
          >
            {getInitials(name)}
          </div>
        </div>
      )}

      <div className="absolute bottom-2.5 left-2.5 bg-[#060913]/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-white flex items-center gap-1.5 max-w-[75%] truncate shadow">
        <span className="truncate">{name}</span>
        {muteAudio && !isMe && <VolumeX size={11} className="text-red-400 shrink-0" />}
      </div>

      {onOpenUserMenu && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenUserMenu(e, peerId, name, isMe);
          }}
          className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-md bg-[#060913]/80 hover:bg-[#060913] text-slate-200 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
          title="User Options"
        >
          <MoreHorizontal size={15} />
        </button>
      )}
    </div>
  );
}

export function StreamPreviewTile({
  streamerName,
  streamSource,
  isWatching,
  compact = false,
  styleObj = {},
  onWatchStream,
  onOpenStreamMenu
}) {
  const previewVideoRef = useRef(null);

  useEffect(() => {
    const el = previewVideoRef.current;
    if (el && streamSource) {
      el.muted = true;
      el.volume = 0;
      if (el.srcObject !== streamSource) {
        el.srcObject = streamSource;
      }
      el.play().catch(() => {});
    }
  }, [streamSource]);

  return (
    <div
      style={styleObj}
      onClick={() => {
        if (!isWatching && onWatchStream) onWatchStream();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onOpenStreamMenu) onOpenStreamMenu(e);
      }}
      className={`group relative rounded-xl overflow-hidden bg-[#060913] flex items-center justify-center select-none border border-slate-800 transition-all ${
        compact ? 'h-24 w-40 shrink-0 cursor-pointer' : 'cursor-pointer'
      }`}
    >
      <video
        ref={previewVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover opacity-35 blur-[1px] transition-opacity group-hover:opacity-45"
      />

      {compact ? (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <Monitor size={24} className="text-white drop-shadow-md" />
          </div>
          <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded shadow">
            LIVE
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onWatchStream) onWatchStream();
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xl transition transform group-hover:scale-105 cursor-pointer"
            >
              Watch Stream
            </button>
          </div>

          <div className="absolute bottom-2.5 left-2.5 bg-[#060913]/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-white flex items-center gap-1.5 shadow">
            <Monitor size={12} className="text-blue-400" />
            <span className="truncate">{streamerName}</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenStreamMenu) onOpenStreamMenu(e);
            }}
            className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-md bg-[#060913]/80 hover:bg-[#060913] text-slate-200 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
          >
            <MoreHorizontal size={15} />
          </button>
        </>
      )}
    </div>
  );
}

