// client/src/components/call/CallContextMenus.jsx
import React from 'react';
import { Monitor, AppWindow, Volume2, X, MonitorOff, ExternalLink } from 'lucide-react';

export function UserContextMenu({
  userMenuPopup,
  userVolumes,
  setUserVolumes,
  mutedUsers,
  setMutedUsers,
  disabledVideoUsers,
  setDisabledVideoUsers,
  isMuted,
  toggleMute
}) {
  if (!userMenuPopup) return null;

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{ top: userMenuPopup.y, left: userMenuPopup.x }}
      className="fixed z-50 w-56 bg-[#0d1322] border border-slate-800 rounded-xl p-3 shadow-2xl text-xs text-slate-200 select-none space-y-3 animate-in fade-in"
    >
      <div className="px-1 pb-2 border-b border-slate-800 font-bold text-white truncate">
        {userMenuPopup.name}
      </div>

      {!userMenuPopup.isMe && (
        <>
          <div className="space-y-1.5 px-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-400">
              <span>User Volume</span>
              <span className="font-mono text-blue-400">{userVolumes[userMenuPopup.peerId] ?? 100}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={userVolumes[userMenuPopup.peerId] ?? 100}
              onChange={e =>
                setUserVolumes(prev => ({
                  ...prev,
                  [userMenuPopup.peerId]: Number(e.target.value)
                }))
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          <label className="flex items-center justify-between px-1 py-1 hover:bg-white/5 rounded cursor-pointer">
            <span className="font-medium">Mute</span>
            <input
              type="checkbox"
              checked={Boolean(mutedUsers[userMenuPopup.peerId])}
              onChange={e =>
                setMutedUsers(prev => ({
                  ...prev,
                  [userMenuPopup.peerId]: e.target.checked
                }))
              }
              className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between px-1 py-1 hover:bg-white/5 rounded cursor-pointer">
            <span className="font-medium">Disable Video</span>
            <input
              type="checkbox"
              checked={Boolean(disabledVideoUsers[userMenuPopup.peerId])}
              onChange={e =>
                setDisabledVideoUsers(prev => ({
                  ...prev,
                  [userMenuPopup.peerId]: e.target.checked
                }))
              }
              className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
            />
          </label>
        </>
      )}

      {userMenuPopup.isMe && (
        <label className="flex items-center justify-between px-1 py-1 hover:bg-white/5 rounded cursor-pointer">
          <span className="font-medium">Mute Microphone</span>
          <input
            type="checkbox"
            checked={isMuted}
            onChange={toggleMute}
            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
          />
        </label>
      )}
    </div>
  );
}

export function StreamContextMenu({
  streamMenuPopup,
  setIsWatchingStream,
  setStreamMenuPopup,
  isStreamAudioMuted,
  setIsStreamAudioMuted,
  streamAudioVolume,
  setStreamAudioVolume,
  handlePopOutStream,
  streamAttenuation,
  setStreamAttenuation,
  streamAttenuationStrength,
  setStreamAttenuationStrength
}) {
  if (!streamMenuPopup) return null;

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{ top: streamMenuPopup.y, left: streamMenuPopup.x }}
      className="fixed z-50 w-64 bg-[#0d1322] border border-slate-800 rounded-xl p-3 shadow-2xl text-xs text-slate-200 select-none space-y-3 animate-in fade-in"
    >
      <button
        onClick={() => {
          setIsWatchingStream(false);
          setStreamMenuPopup(null);
        }}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 text-white font-semibold transition cursor-pointer"
      >
        <MonitorOff size={15} className="text-slate-300" />
        <span>Stop Watching</span>
      </button>

      <div className="border-t border-slate-800 pt-2.5 space-y-2.5 px-1">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="font-semibold text-white">Mute</span>
          <input
            type="checkbox"
            checked={isStreamAudioMuted}
            onChange={e => setIsStreamAudioMuted(e.target.checked)}
            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
          />
        </label>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-slate-300">Stream Volume</div>
          <input
            type="range"
            min="0"
            max="100"
            disabled={isStreamAudioMuted}
            value={isStreamAudioMuted ? 0 : streamAudioVolume}
            onChange={e => setStreamAudioVolume(Number(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>

      <div className="border-t border-slate-800 pt-2">
        <button
          onClick={handlePopOutStream}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 font-semibold transition cursor-pointer"
        >
          <ExternalLink size={15} className="text-blue-400" />
          <span>Pop Out Stream</span>
        </button>
      </div>

      <div className="border-t border-slate-800 pt-2.5 space-y-2.5 px-1">
        <label className="flex items-start justify-between gap-2 cursor-pointer">
          <div>
            <div className="font-semibold text-white">Stream Attenuation</div>
            <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
              Automatically reduce stream volume when people are talking.
            </div>
          </div>
          <input
            type="checkbox"
            checked={streamAttenuation}
            onChange={e => setStreamAttenuation(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-blue-600 rounded cursor-pointer shrink-0"
          />
        </label>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-slate-300">Stream Attenuation Strength</div>
          <input
            type="range"
            min="0"
            max="100"
            disabled={!streamAttenuation}
            value={streamAttenuationStrength}
            onChange={e => setStreamAttenuationStrength(Number(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
}

export function GoLiveModal({
  showGoLiveModal,
  setShowGoLiveModal,
  pickerTab,
  setPickerTab,
  availableScreens,
  availableWindows,
  selectedSourceId,
  setSelectedSourceId,
  shareSystemAudio,
  setShareSystemAudio,
  startScreenStreamWithConfig,
  streamRes,
  streamFps
}) {
  if (!showGoLiveModal) return null;

  return (
    <div
      onClick={() => setShowGoLiveModal(false)}
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in select-none text-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[#0d1322] border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#060913]">
          <div className="flex items-center gap-2">
            <Monitor size={17} className="text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Screen Share</h3>
          </div>
          <button
            onClick={() => setShowGoLiveModal(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-slate-800 bg-[#060913]/60 px-6 pt-3 gap-4">
          <button
            onClick={() => {
              setPickerTab('screens');
              if (availableScreens[0]) setSelectedSourceId(availableScreens[0].id);
            }}
            className={`pb-2.5 px-2 font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              pickerTab === 'screens'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Monitor size={14} />
            <span>Entire Screen</span>
          </button>

          <button
            onClick={() => {
              setPickerTab('windows');
              if (availableWindows[0]) setSelectedSourceId(availableWindows[0].id);
            }}
            className={`pb-2.5 px-2 font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              pickerTab === 'windows'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <AppWindow size={14} />
            <span>Applications</span>
          </button>
        </div>

        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-h-72 overflow-y-auto custom-scrollbar">
          {(pickerTab === 'windows' ? availableWindows : availableScreens).map(src => {
            const isSelected = selectedSourceId === src.id;
            return (
              <div
                key={src.id}
                onClick={() => setSelectedSourceId(src.id)}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${
                  isSelected
                    ? 'border-blue-500 bg-blue-600/15 ring-2 ring-blue-500/50'
                    : 'border-slate-800 bg-[#060913] hover:border-slate-700'
                }`}
              >
                <div className="aspect-video bg-black rounded-lg overflow-hidden relative flex items-center justify-center border border-slate-800">
                  {src.thumbnail ? (
                    <img src={src.thumbnail} alt={src.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-600 gap-1">
                      {src.isScreen ? <Monitor size={24} /> : <AppWindow size={24} />}
                    </div>
                  )}
                  {src.appIcon && (
                    <img src={src.appIcon} alt="" className="w-4 h-4 absolute bottom-1 right-1 rounded shadow-md" />
                  )}
                </div>

                <div className="flex items-center justify-between px-1">
                  <span className="font-semibold text-[11px] text-slate-200 truncate">
                    {src.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-[#060913] border-t border-slate-800 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-semibold">
            <input
              type="checkbox"
              checked={shareSystemAudio}
              onChange={e => setShareSystemAudio(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
            />
            <Volume2 size={14} className="text-blue-400" />
            <span>Share System Audio</span>
          </label>

          <div className="flex justify-end gap-2.5">
            <button
              onClick={() => setShowGoLiveModal(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              disabled={!selectedSourceId}
              onClick={() => startScreenStreamWithConfig(selectedSourceId, shareSystemAudio, streamRes, streamFps)}
              className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold transition shadow-lg shadow-blue-600/20 cursor-pointer"
            >
              Go Live
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

