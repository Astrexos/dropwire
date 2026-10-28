// client/src/components/SettingsModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, User, Mic, Shield, Search, Video,
  Trash2, Check, Sliders
} from 'lucide-react';
import * as phoneVault from '../utils/phoneVault';

const SETTINGS_STORAGE_KEY = 'dropwire_app_settings_v1';

const DEFAULT_SETTINGS = {
  micDeviceId: 'default',
  speakerDeviceId: 'default',
  videoDeviceId: 'default',
  micGainPercent: 100,
  speakerVolumePercent: 100,
  autoSensitivity: true,
  micDecibelGate: -60,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  streamResolution: '1080p',
  streamFps: 60
};

function getOrCreateIdentity() {
  if (typeof phoneVault.getOrCreateIdentity === 'function') return phoneVault.getOrCreateIdentity();
  if (typeof phoneVault.getMyIdentity === 'function') return phoneVault.getMyIdentity();
  if (typeof phoneVault.getPhoneIdentity === 'function') return phoneVault.getPhoneIdentity();
  const phone =
    (typeof phoneVault.getMyPhone === 'function' && phoneVault.getMyPhone()) ||
    localStorage.getItem('dropwire_my_phone') ||
    '000-0000';
  const name =
    (typeof phoneVault.getMyName === 'function' && phoneVault.getMyName()) ||
    localStorage.getItem('dropwire_display_name') ||
    localStorage.getItem('dropwire_my_name') ||
    'Peer';
  return { phoneNumber: phone, displayName: name };
}

function updateDisplayName(newName) {
  if (typeof phoneVault.updateDisplayName === 'function') return phoneVault.updateDisplayName(newName);
  if (typeof phoneVault.setMyName === 'function') phoneVault.setMyName(newName);
  if (typeof phoneVault.saveDisplayName === 'function') phoneVault.saveDisplayName(newName);
  localStorage.setItem('dropwire_display_name', newName);
  localStorage.setItem('dropwire_my_name', newName);
  const current = getOrCreateIdentity();
  return { ...current, displayName: newName };
}

export function getAppSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAppSettings(next) {
  try {
    const merged = { ...getAppSettings(), ...next };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('dropwire-settings-updated', { detail: merged }));
    return merged;
  } catch {
    return next;
  }
}

export async function applySpeakerDeviceToElement(mediaElement, speakerDeviceId) {
  if (!mediaElement || typeof mediaElement.setSinkId !== 'function') return;
  try {
    const targetId = !speakerDeviceId || speakerDeviceId === 'default' ? '' : speakerDeviceId;
    await mediaElement.setSinkId(targetId);
  } catch (e) {}
}

const SIDEBAR_STRUCTURE = [
  {
    group: 'User Settings',
    items: [
      {
        id: 'account',
        label: 'Account',
        icon: User,
        subItems: [
          { id: 'account-profile', label: 'Profile' },
          { id: 'account-identity', label: 'DropWire Number' }
        ]
      },
      {
        id: 'privacy',
        label: 'Data & Privacy',
        icon: Shield,
        subItems: [
          { id: 'privacy-e2ee', label: 'Encryption' },
          { id: 'privacy-vault', label: 'Local Vault' }
        ]
      }
    ]
  },
  {
    group: 'Experience',
    items: [
      {
        id: 'voice',
        label: 'Voice & Video',
        icon: Mic,
        subItems: [
          { id: 'voice-devices', label: 'Voice' },
          { id: 'voice-sensitivity', label: 'Sensitivity' },
          { id: 'voice-processing', label: 'Processing' },
          { id: 'voice-camera', label: 'Camera & Stream' }
        ]
      }
    ]
  }
];

export default function SettingsModal({ isOpen, onClose, onNameChanged }) {
  const [activeCategory, setActiveCategory] = useState('voice');
  const [activeSubSection, setActiveSubSection] = useState('voice-devices');
  const [searchQuery, setSearchQuery] = useState('');

  const [settings, setSettings] = useState(() => getAppSettings());
  const [identity, setIdentity] = useState(() => getOrCreateIdentity());
  const [displayNameInput, setDisplayNameInput] = useState(identity.displayName || '');
  const [savedNameBanner, setSavedNameBanner] = useState(false);
  const [clearedVaultBanner, setClearedVaultBanner] = useState(false);

  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [cameras, setCameras] = useState([]);

  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testLevelPercent, setTestLevelPercent] = useState(0);
  const testStreamRef = useRef(null);
  const testAudioCtxRef = useRef(null);
  const testGainNodeRef = useRef(null);
  const testIntervalRef = useRef(null);
  const testAudioElRef = useRef(null);

  const [isTestingCam, setIsTestingCam] = useState(false);
  const camPreviewRef = useRef(null);
  const camStreamRef = useRef(null);

  async function refreshHardwareDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      let list = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = list.some(d => d.label && d.label.trim() !== '');
      if (!hasLabels) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          tempStream.getTracks().forEach(t => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
        } catch (e) {}
      }

      setMics(list.filter(d => d.kind === 'audioinput'));
      setSpeakers(list.filter(d => d.kind === 'audiooutput'));
      setCameras(list.filter(d => d.kind === 'videoinput'));
    } catch (e) {}
  }

  useEffect(() => {
    if (!isOpen) {
      stopMicTest();
      stopCamPreview();
      return;
    }
    setSettings(getAppSettings());
    const idObj = getOrCreateIdentity();
    setIdentity(idObj);
    setDisplayNameInput(idObj.displayName || '');

    refreshHardwareDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshHardwareDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshHardwareDevices);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      stopMicTest();
      stopCamPreview();
    };
  }, []);

  if (!isOpen) return null;

  function updateField(key, value) {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveAppSettings(next);

      if (key === 'micGainPercent' && testGainNodeRef.current) {
        testGainNodeRef.current.gain.value = Number(value) / 100;
      }
      if (key === 'speakerVolumePercent' && testAudioElRef.current) {
        testAudioElRef.current.volume = Math.min(1, Number(value) / 100);
      }
      if (key === 'speakerDeviceId' && testAudioElRef.current) {
        applySpeakerDeviceToElement(testAudioElRef.current, value);
      }
      if (
        (key === 'echoCancellation' || key === 'noiseSuppression' || key === 'autoGainControl') &&
        testStreamRef.current
      ) {
        const track = testStreamRef.current.getAudioTracks()[0];
        track?.applyConstraints?.({
          echoCancellation: next.echoCancellation,
          noiseSuppression: next.noiseSuppression,
          autoGainControl: next.autoGainControl
        }).catch(() => {});
      }
      return next;
    });
  }

  async function toggleMicTest() {
    if (isTestingMic) {
      stopMicTest();
      return;
    }
    try {
      const audioConstraint = {
        ...(settings.micDeviceId && settings.micDeviceId !== 'default'
          ? { deviceId: { exact: settings.micDeviceId } }
          : {}),
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
      testStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = (settings.micGainPercent ?? 100) / 100;
      testGainNodeRef.current = gain;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const dest = ctx.createMediaStreamDestination();

      src.connect(gain);
      gain.connect(analyser);
      gain.connect(dest);

      if (testAudioElRef.current) {
        testAudioElRef.current.srcObject = dest.stream;
        testAudioElRef.current.volume = Math.min(1, (settings.speakerVolumePercent ?? 100) / 100);
        await applySpeakerDeviceToElement(testAudioElRef.current, settings.speakerDeviceId);
        testAudioElRef.current.play().catch(() => {});
      }

      testAudioCtxRef.current = ctx;
      setIsTestingMic(true);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const micPollMs = 1000 / 15;
      testIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const avg = sum / buf.length;
        const pct = Math.min(100, Math.round((avg / 135) * 100));
        setTestLevelPercent(pct);
      }, 60);
    } catch (e) {
      stopMicTest();
    }
  }

  function stopMicTest() {
    if (testIntervalRef.current) clearInterval(testIntervalRef.current);
    testIntervalRef.current = null;
    if (testAudioElRef.current) {
      testAudioElRef.current.pause();
      testAudioElRef.current.srcObject = null;
    }
    testStreamRef.current?.getTracks().forEach(t => t.stop());
    testStreamRef.current = null;
    testAudioCtxRef.current?.close().catch(() => {});
    testAudioCtxRef.current = null;
    testGainNodeRef.current = null;
    setIsTestingMic(false);
    setTestLevelPercent(0);
  }

  async function toggleCamPreview() {
    if (isTestingCam) {
      stopCamPreview();
      return;
    }
    try {
      const videoConstraint =
        settings.videoDeviceId && settings.videoDeviceId !== 'default'
          ? { deviceId: { exact: settings.videoDeviceId }, width: { ideal: 640 }, height: { ideal: 360 } }
          : { width: { ideal: 640 }, height: { ideal: 360 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false
      });
      camStreamRef.current = stream;
      setIsTestingCam(true);
      setTimeout(() => {
        if (camPreviewRef.current) {
          camPreviewRef.current.srcObject = stream;
          camPreviewRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (e) {}
  }

  function stopCamPreview() {
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
    if (camPreviewRef.current) {
      camPreviewRef.current.srcObject = null;
    }
    setIsTestingCam(false);
  }

  function handleSaveDisplayName(e) {
    e.preventDefault();
    const cleaned = displayNameInput.trim();
    if (!cleaned) return;
    const updated = updateDisplayName(cleaned);
    setIdentity(updated);
    if (onNameChanged) onNameChanged(updated.displayName);
    setSavedNameBanner(true);
    setTimeout(() => setSavedNameBanner(false), 2000);
  }

  function handleClearSavedRooms() {
    localStorage.removeItem('dropwire_saved_rooms_v1');
    setClearedVaultBanner(true);
    setTimeout(() => setClearedVaultBanner(false), 2000);
  }

  function handleSelectCategory(catId, firstSubId) {
    setActiveCategory(catId);
    if (firstSubId) {
      setActiveSubSection(firstSubId);
      setTimeout(() => {
        document.getElementById(firstSubId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
  }

  function handleSelectSubSection(catId, subId) {
    setActiveCategory(catId);
    setActiveSubSection(subId);
    setTimeout(() => {
      document.getElementById(subId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }

  const gatePercent = Math.round(((settings.micDecibelGate + 90) / 80) * 100);
  const currentCategoryTitle =
    SIDEBAR_STRUCTURE.flatMap(g => g.items).find(i => i.id === activeCategory)?.label || 'Settings';

  return (
    /* CENTERED MODAL OVERLAY ON TOP OF THE MAIN APP (Matches Image 1!) */
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in"
    >
      <audio ref={testAudioElRef} className="hidden" />

      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[920px] h-[85vh] max-h-[680px] bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-slate-200"
      >
        {/* LEFT SIDEBAR */}
        <div className="w-full md:w-60 bg-[#060913] border-b md:border-b-0 md:border-r border-slate-800/90 flex flex-col justify-between p-3.5 shrink-0 overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            {/* User Mini Header (Like Image 1 Top-Left) */}
            <div className="flex items-center justify-between px-1.5 pt-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center font-bold text-blue-400 text-xs uppercase shrink-0">
                  {(identity.displayName || 'DW').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {identity.displayName || 'User'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    #{identity.phoneNumber}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-[#0d1322] border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Navigation Groups */}
            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
              {SIDEBAR_STRUCTURE.map(group => (
                <div key={group.group} className="space-y-1 min-w-fit md:min-w-0">
                  <div className="hidden md:block px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">
                    {group.group}
                  </div>

                  {group.items
                    .filter(item =>
                      !searchQuery ||
                      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      item.subItems.some(s => s.label.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .map(item => {
                      const Icon = item.icon;
                      const isExpanded = activeCategory === item.id;
                      return (
                        <div key={item.id} className="space-y-1">
                          <button
                            onClick={() => handleSelectCategory(item.id, item.subItems[0]?.id)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              isExpanded
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                            }`}
                          >
                            <Icon size={15} />
                            <span>{item.label}</span>
                          </button>

                          {/* Expandable Sub-Items Tree under Active Section */}
                          {isExpanded && item.subItems && (
                            <div className="hidden md:block pl-3 space-y-0.5 pt-0.5 border-l border-slate-800 ml-3">
                              {item.subItems.map(sub => {
                                const isSubActive = activeSubSection === sub.id;
                                return (
                                  <button
                                    key={sub.id}
                                    onClick={() => handleSelectSubSection(item.id, sub.id)}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition cursor-pointer relative ${
                                      isSubActive
                                        ? 'text-white font-semibold bg-white/5'
                                        : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                  >
                                    {isSubActive && (
                                      <span className="w-0.5 h-3.5 bg-blue-400 rounded-full absolute -left-[1px] top-2" />
                                    )}
                                    <span>{sub.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:block px-2 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
            DropWire v1.0.0
          </div>
        </div>

        {/* RIGHT CONTENT PANE */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#0d1322]">
          {/* Sticky Top Bar with Category Name on Left & Clean "X" on Top-Right (Image 1!) */}
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-[#0d1322]">
            <h2 className="text-sm font-bold text-white">{currentCategoryTitle}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Settings Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* ==================== VOICE & VIDEO TAB ==================== */}
            {activeCategory === 'voice' && (
              <>
                <section id="voice-devices" className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Voice</h3>
                    <button
                      onClick={refreshHardwareDevices}
                      className="px-2.5 py-1 rounded-lg bg-[#060913] hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-semibold transition cursor-pointer"
                    >
                      Refresh Hardware
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 block">Microphone</label>
                      <select
                        value={settings.micDeviceId}
                        onChange={e => updateField('micDeviceId', e.target.value)}
                        className="w-full bg-[#060913] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {mics.length === 0 && <option value="default">Default Microphone</option>}
                        {mics.map((m, idx) => (
                          <option key={m.deviceId || idx} value={m.deviceId}>
                            {m.label || `Microphone ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 block">Speaker</label>
                      <select
                        value={settings.speakerDeviceId}
                        onChange={e => updateField('speakerDeviceId', e.target.value)}
                        className="w-full bg-[#060913] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {speakers.length === 0 && <option value="default">Default Output Device</option>}
                        {speakers.map((s, idx) => (
                          <option key={s.deviceId || idx} value={s.deviceId}>
                            {s.label || `Speaker ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Microphone Volume</span>
                        <span className="font-mono text-blue-400">{settings.micGainPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={settings.micGainPercent}
                        onChange={e => updateField('micGainPercent', Number(e.target.value))}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-300">Speaker Volume</span>
                        <span className="font-mono text-blue-400">{settings.speakerVolumePercent}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={settings.speakerVolumePercent}
                        onChange={e => updateField('speakerVolumePercent', Number(e.target.value))}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Mic Test Bar */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={toggleMicTest}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                        isTestingMic
                          ? 'bg-red-600 hover:bg-red-500 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                      }`}
                    >
                      {isTestingMic ? 'Stop Test' : 'Mic Test'}
                    </button>

                    <div className="flex-1 flex items-center justify-between gap-0.5 h-6 px-2 bg-[#060913] rounded-xl border border-slate-800">
                      {Array.from({ length: 44 }).map((_, idx) => {
                        const threshold = (idx / 44) * 100;
                        const active = isTestingMic && testLevelPercent >= threshold;
                        return (
                          <div
                            key={idx}
                            className={`w-1 h-3.5 rounded-full transition-colors duration-75 ${
                              active ? 'bg-emerald-400' : 'bg-slate-800'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </section>

                <hr className="border-slate-800/80" />

                <section id="voice-sensitivity" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">
                        Automatically Adjust Input Sensitivity
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Controls how much sound DropWire transmits from your mic.
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const nextAuto = !settings.autoSensitivity;
                        updateField('autoSensitivity', nextAuto);
                        if (nextAuto) updateField('micDecibelGate', -65);
                      }}
                      className={`w-10 h-5.5 rounded-full p-0.5 transition cursor-pointer flex items-center shrink-0 ${
                        settings.autoSensitivity ? 'bg-blue-600 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow" />
                    </button>
                  </div>

                  {!settings.autoSensitivity && (
                    <div className="relative pt-1">
                      <div
                        className="w-full h-2 rounded-full"
                        style={{
                          background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${gatePercent}%, #10b981 ${gatePercent}%, #10b981 100%)`
                        }}
                      />
                      <input
                        type="range"
                        min="-90"
                        max="-10"
                        value={settings.micDecibelGate}
                        onChange={e => updateField('micDecibelGate', Number(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer"
                      />
                      <div
                        style={{ left: `calc(${gatePercent}% - 8px)` }}
                        className="pointer-events-none w-4 h-4 rounded-full bg-white border-2 border-slate-900 shadow-lg absolute -top-0.5"
                      />
                    </div>
                  )}
                </section>

                <hr className="border-slate-800/80" />

                <section id="voice-processing" className="space-y-3">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <Sliders size={14} className="text-blue-400" />
                    <span>Voice Processing</span>
                  </h3>

                  {[
                    {
                      key: 'echoCancellation',
                      title: 'Echo Cancellation',
                      desc: 'Prevents speaker audio from looping back into your microphone.'
                    },
                    {
                      key: 'noiseSuppression',
                      title: 'Noise Suppression',
                      desc: 'Reduces background fan and room noise from your mic.'
                    },
                    {
                      key: 'autoGainControl',
                      title: 'Automatic Gain Control',
                      desc: 'Automatically balances your microphone volume level.'
                    }
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-none">
                      <div>
                        <div className="text-xs font-semibold text-white">{item.title}</div>
                        <div className="text-[11px] text-slate-400">{item.desc}</div>
                      </div>
                      <button
                        onClick={() => updateField(item.key, !settings[item.key])}
                        className={`w-10 h-5.5 rounded-full p-0.5 transition cursor-pointer flex items-center shrink-0 ${
                          settings[item.key] ? 'bg-blue-600 justify-end' : 'bg-slate-700 justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow" />
                      </button>
                    </div>
                  ))}
                </section>

                <hr className="border-slate-800/80" />

                <section id="voice-camera" className="space-y-4">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <Video size={14} className="text-blue-400" />
                    <span>Camera & Streaming</span>
                  </h3>

                  <div className="flex items-center justify-between gap-3">
                    <select
                      value={settings.videoDeviceId}
                      onChange={e => updateField('videoDeviceId', e.target.value)}
                      className="flex-1 bg-[#060913] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                    >
                      {cameras.length === 0 && <option value="default">Default Camera</option>}
                      {cameras.map((c, idx) => (
                        <option key={c.deviceId || idx} value={c.deviceId}>
                          {c.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={toggleCamPreview}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
                    >
                      {isTestingCam ? 'Stop Video' : 'Test Video'}
                    </button>
                  </div>

                  {isTestingCam && (
                    <div className="aspect-video max-w-xs bg-black rounded-xl overflow-hidden border border-slate-800">
                      <video ref={camPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 block">Stream Resolution</label>
                      <select
                        value={settings.streamResolution}
                        onChange={e => updateField('streamResolution', e.target.value)}
                        className="w-full bg-[#060913] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                      >
                        <option value="720p">720p HD</option>
                        <option value="1080p">1080p Full HD</option>
                        <option value="1440p">1440p QHD</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 block">Stream Frame Rate</label>
                      <select
                        value={settings.streamFps}
                        onChange={e => updateField('streamFps', Number(e.target.value))}
                        className="w-full bg-[#060913] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                      >
                        <option value={30}>30 FPS</option>
                        <option value={60}>60 FPS</option>
                      </select>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* ==================== ACCOUNT TAB ==================== */}
            {activeCategory === 'account' && (
              <div className="space-y-6">
                <section id="account-profile" className="bg-[#060913] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-white">Display Name</h3>
                  <form onSubmit={handleSaveDisplayName} className="flex gap-2.5">
                    <input
                      type="text"
                      value={displayNameInput}
                      onChange={e => setDisplayNameInput(e.target.value)}
                      maxLength={28}
                      className="flex-1 bg-[#0d1322] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
                    >
                      Save
                    </button>
                  </form>
                  {savedNameBanner && (
                    <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                      <Check size={14} /> Saved!
                    </div>
                  )}
                </section>

                <section id="account-identity" className="bg-[#060913] border border-slate-800 rounded-2xl p-5 space-y-1.5">
                  <div className="text-xs font-bold text-slate-300">Your DropWire Number</div>
                  <div className="text-xl font-mono font-extrabold text-blue-400">
                    {identity.phoneNumber}
                  </div>
                </section>
              </div>
            )}

            {/* ==================== DATA & PRIVACY TAB ==================== */}
            {activeCategory === 'privacy' && (
              <div className="space-y-6">
                <section id="privacy-e2ee" className="bg-[#060913] border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="text-xs font-bold text-emerald-400">
                    End-to-End Encryption Active
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Messages, voice notes, and P2P streams are encrypted in memory using PBKDF2-HMAC-SHA512 + Bitwise ROL-3 Scrambling + AES-256-GCM.
                  </p>
                </section>

                <section id="privacy-vault" className="bg-[#060913] border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div>
                    <div className="text-xs font-bold text-white">Local Vault Storage</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Clear locally saved room history from this device.
                    </div>
                  </div>
                  <button
                    onClick={handleClearSavedRooms}
                    className="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Clear Saved Data</span>
                  </button>
                  {clearedVaultBanner && (
                    <div className="text-xs text-emerald-400 font-semibold">
                      Cleared!
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

