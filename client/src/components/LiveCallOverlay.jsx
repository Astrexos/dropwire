// client/src/components/LiveCallOverlay.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, PhoneOff, Video, VideoOff, Mic, MicOff, 
  Maximize2, Minimize2, Monitor, Eye, EyeOff, MoreHorizontal
} from 'lucide-react';
import { getAppSettings, saveAppSettings } from './SettingsModal';
import { ParticipantTile, StreamPreviewTile } from './call/CallTiles';
import { UserContextMenu, StreamContextMenu, GoLiveModal } from './call/CallContextMenus';
import VoiceConnectedDock from './call/VoiceConnectedDock';

function upgradeSdpForHighQualityStereoAudio(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;
  return sdp.replace(
    /a=fmtp:111 (.*)/g,
    'a=fmtp:111 $1;stereo=1;sprop-stereo=1;maxaveragebitrate=510000;cbr=1;usedtx=0;maxplaybackrate=48000'
  );
}

function getLocalMachineFingerprint() {
  const nav = window.navigator;
  return [
    nav.userAgent,
    nav.hardwareConcurrency,
    nav.deviceMemory,
    window.screen?.width,
    window.screen?.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ].join('|');
}

export default function LiveCallOverlay({ ws, sendAuthenticated, myId, myName, members, isStealthMode }) {
  const initialPrefs = getAppSettings();
  const [callState, setCallState] = useState('idle');
  const [callerInfo, setCallerInfo] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteSpeakingMap, setRemoteSpeakingMap] = useState(new Map());
  const [pingMs, setPingMs] = useState(14);
  const [isStageMinimized, setIsStageMinimized] = useState(false);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [streamerId, setStreamerId] = useState(null);
  const [streamerName, setStreamerName] = useState('');
  const [isWatchingStream, setIsWatchingStream] = useState(false);
  const [remoteCamStates, setRemoteCamStates] = useState(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [samePcPeers, setSamePcPeers] = useState(new Set());

  const [userVolumes, setUserVolumes] = useState({});
  const [mutedUsers, setMutedUsers] = useState({});
  const [disabledVideoUsers, setDisabledVideoUsers] = useState({});
  const [userMenuPopup, setUserMenuPopup] = useState(null);

  const [hideMembers, setHideMembers] = useState(false);
  const [streamAudioVolume, setStreamAudioVolume] = useState(100);
  const [isStreamAudioMuted, setIsStreamAudioMuted] = useState(false);
  const [streamAttenuation, setStreamAttenuation] = useState(true);
  const [streamAttenuationStrength, setStreamAttenuationStrength] = useState(40);
  const [streamMenuPopup, setStreamMenuPopup] = useState(null);

  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [pickerTab, setPickerTab] = useState('screens');
  const [availableWindows, setAvailableWindows] = useState([]);
  const [availableScreens, setAvailableScreens] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [shareSystemAudio, setShareSystemAudio] = useState(true);
  const [streamRes, setStreamRes] = useState(initialPrefs.streamResolution || '1080p');
  const [streamFps, setStreamFps] = useState(initialPrefs.streamFps || 60);

  const callStateRef = useRef('idle');
  const streamerIdRef = useRef(null);
  const activeSourceIdRef = useRef(null);
  const windowWatcherIntervalRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const isMutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isVoiceNoteRecordingRef = useRef(false);
  const inputGateRef = useRef(initialPrefs.micDecibelGate ?? -65);
  const inputGainValueRef = useRef(initialPrefs.micGainPercent ?? 100);
  const outputVolRef = useRef(initialPrefs.speakerVolumePercent ?? 100);
  const selectedMicRef = useRef(initialPrefs.micDeviceId || 'default');

  const callDockRef = useRef(null);
  const posRef = useRef({ x: 300, y: 50 });
  const [position, setPosition] = useState({ x: 300, y: 50 });
  const [savedPreFullscreenPos, setSavedPreFullscreenPos] = useState({ x: 300, y: 50 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragRef = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });

  const localCamVideoRef = useRef(null);
  const localScreenVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());
  const remoteStreamVideoRef = useRef(null);

  const pcsRef = useRef(new Map());
  const rawStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const savedCameraTrackRef = useRef(null);
  const processedAudioTrackRef = useRef(null);
  const gainNodeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioDestinationRef = useRef(null);
  const screenAudioSourceRef = useRef(null);
  const dbIntervalRef = useRef(null);

  function getRemoteVideoRef(peerId) {
    if (!remoteVideoRefs.current.has(peerId)) {
      remoteVideoRefs.current.set(peerId, React.createRef());
    }
    return remoteVideoRefs.current.get(peerId);
  }

  function updateCallState(nextState) {
    callStateRef.current = nextState;
    setCallState(nextState);
  }

  function updateStreamerId(nextId) {
    streamerIdRef.current = nextId;
    setStreamerId(nextId);
  }

  const hasActiveStream = Boolean(streamerId);
  const isMeStreaming = streamerId === myId;
  const activeStreamSource = isMeStreaming ? screenStreamRef.current : (streamerId ? remoteStreams.get(streamerId) : null);

  // Guarded 3000ms RTT Ping Monitor (Updates state outside loop only if delta >= 3ms)
  useEffect(() => {
    if (callState !== 'active') {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      return;
    }

    const pingPollMs = 3000;
    pingIntervalRef.current = setInterval(async () => {
      let bestRtt = null;
      for (const [, pc] of pcsRef.current.entries()) {
        try {
          const stats = await pc.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
              const rttMs = Math.max(1, Math.round(report.currentRoundTripTime * 1000));
              if (bestRtt === null || rttMs < bestRtt) bestRtt = rttMs;
            }
          });
        } catch (e) {}
      }
      if (bestRtt !== null) {
        setPingMs(prev => (Math.abs(prev - bestRtt) >= 3 ? bestRtt : prev));
      }
    }, 3000);

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [callState]);

  useEffect(() => {
    const closeMenus = () => {
      setUserMenuPopup(null);
      setStreamMenuPopup(null);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    if (hasActiveStream && isWatchingStream && activeStreamSource && !isStageMinimized) {
      const targetVideo = isMeStreaming ? localScreenVideoRef.current : remoteStreamVideoRef.current;
      if (targetVideo) {
        const shouldMuteStage = isMeStreaming || isDeafened || isStreamAudioMuted || (streamerId && samePcPeers.has(streamerId));
        targetVideo.muted = Boolean(shouldMuteStage);
        if (targetVideo.srcObject !== activeStreamSource) {
          targetVideo.srcObject = activeStreamSource;
        }
        targetVideo.play().catch(() => {});
      }
    }
  }, [hasActiveStream, isWatchingStream, isStageMinimized, isMeStreaming, isDeafened, activeStreamSource, streamerId, isScreenSharing, isStreamAudioMuted, samePcPeers]);

  useEffect(() => {
    const targetVideo = isMeStreaming ? localScreenVideoRef.current : remoteStreamVideoRef.current;
    if (targetVideo) {
      const shouldMuteStage =
        !isWatchingStream ||
        isMeStreaming ||
        isDeafened ||
        isStreamAudioMuted ||
        (streamerId && samePcPeers.has(streamerId));

      targetVideo.muted = Boolean(shouldMuteStage);

      let effectiveVol = Math.min(1, Math.max(0, streamAudioVolume / 100));
      const someoneTalking = isSpeaking || Array.from(remoteSpeakingMap.values()).some(Boolean);
      if (streamAttenuation && someoneTalking) {
        const duckFactor = Math.max(0, 1 - streamAttenuationStrength / 100);
        effectiveVol = effectiveVol * duckFactor;
      }
      targetVideo.volume = shouldMuteStage ? 0 : effectiveVol;
    }
  }, [
    isWatchingStream,
    isMeStreaming,
    isDeafened,
    isStreamAudioMuted,
    streamAudioVolume,
    streamAttenuation,
    streamAttenuationStrength,
    isSpeaking,
    remoteSpeakingMap,
    streamerId,
    samePcPeers
  ]);

  useEffect(() => {
    return () => {
      cleanupCall('Component Unmounted');
    };
  }, []);

  // Batched Peer Cleanup (Never calls setState inside the for-loop!)
  useEffect(() => {
    const activeMemberIds = new Set(members.map(m => m.id));

    if (callState === 'ringing' && callerInfo && !activeMemberIds.has(callerInfo.id)) {
      cleanupCall('Caller left while ringing');
      return;
    }

    if (callState === 'active') {
      const removedPeerIds = [];
      for (const [peerId, pc] of pcsRef.current.entries()) {
        if (!activeMemberIds.has(peerId)) {
          try { pc.close(); } catch (e) {}
          pcsRef.current.delete(peerId);
          remoteVideoRefs.current.delete(peerId);
          removedPeerIds.push(peerId);
        }
      }

      if (removedPeerIds.length > 0) {
        setRemoteStreams(prev => {
          const n = new Map(prev);
          removedPeerIds.forEach(id => n.delete(id));
          return n;
        });
        setRemoteCamStates(prev => {
          const n = new Map(prev);
          removedPeerIds.forEach(id => n.delete(id));
          return n;
        });
        if (removedPeerIds.includes(streamerIdRef.current)) {
          updateStreamerId(null);
          setStreamerName('');
          setIsWatchingStream(false);
        }
      }

      const remainingOtherPeers = members.filter(m => m.id !== myId);
      if (remainingOtherPeers.length === 0) {
        cleanupCall('No remaining peers in room');
      }
    }
  }, [members, myId, callState, callerInfo]);

  useEffect(() => {
    const onSettingsSync = async (e) => {
      const s = e.detail;
      if (!s) return;
      inputGainValueRef.current = s.micGainPercent ?? 100;
      inputGateRef.current = s.micDecibelGate ?? -65;
      outputVolRef.current = s.speakerVolumePercent ?? 100;

      if (gainNodeRef.current && !isMutedRef.current && !isVoiceNoteRecordingRef.current) {
        gainNodeRef.current.gain.value = inputGainValueRef.current / 100;
      }

      if (s.micDeviceId && s.micDeviceId !== selectedMicRef.current) {
        selectedMicRef.current = s.micDeviceId;
        if (callStateRef.current === 'active') {
          try {
            const newAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: s.micDeviceId }, echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression }
            });
            const processedTrack = buildWebAudioPipeline(newAudioStream);
            pcsRef.current.forEach(pc => {
              const sender = pc.getSenders().find(snd => snd.track && snd.track.kind === 'audio');
              if (sender && processedTrack) sender.replaceTrack(processedTrack);
            });
          } catch (err) {}
        }
      }
    };

    const onVoiceNoteState = (e) => {
      isVoiceNoteRecordingRef.current = Boolean(e.detail?.recording);
    };

    window.addEventListener('dropwire-settings-updated', onSettingsSync);
    window.addEventListener('dropwire-voicenote-state', onVoiceNoteState);
    return () => {
      window.removeEventListener('dropwire-settings-updated', onSettingsSync);
      window.removeEventListener('dropwire-voicenote-state', onVoiceNoteState);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current.isDragging || isFullscreen) return;
      const sidebarOffset = window.innerWidth >= 768 ? Math.min(360, Math.max(280, Math.round(window.innerWidth * 0.26))) : 0;
      const currentWidth = hasActiveStream && isWatchingStream ? 760 : 620;
      const minX = sidebarOffset + 12;
      const maxX = Math.max(minX, window.innerWidth - currentWidth - 12);
      const nextX = Math.max(minX, Math.min(maxX, e.clientX - dragRef.current.offsetX));
      const nextY = Math.max(12, Math.min(window.innerHeight - 280, e.clientY - dragRef.current.offsetY));
      posRef.current = { x: nextX, y: nextY };
      if (callDockRef.current) {
        callDockRef.current.style.left = `${nextX}px`;
        callDockRef.current.style.top = `${nextY}px`;
      }
    };
    const handleMouseUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        setPosition({ ...posRef.current });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isFullscreen, hasActiveStream, isWatchingStream]);

  useEffect(() => {
    const handleCallSignaling = async (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }

      if (data.type === 'call-invite') {
        if (data.sameMachineToken && data.sameMachineToken === getLocalMachineFingerprint()) {
          setSamePcPeers(prev => new Set(prev).add(data.fromId));
        }
        setRemoteCamStates(prev => new Map(prev).set(data.fromId, Boolean(data.video)));
        const existingPc = pcsRef.current.get(data.fromId);

        if (callStateRef.current === 'active' || existingPc) {
          if (existingPc && myId > data.fromId && existingPc.signalingState !== 'stable') return;
          const pc = existingPc || createCallPeer(data.fromId);
          if (!existingPc && rawStreamRef.current) {
            if (processedAudioTrackRef.current) pc.addTrack(processedAudioTrackRef.current, rawStreamRef.current);
            const activeVidTrack = isScreenSharing && screenStreamRef.current
              ? screenStreamRef.current.getVideoTracks()[0]
              : rawStreamRef.current.getVideoTracks()[0];
            if (activeVidTrack) {
              pc.addTrack(activeVidTrack, rawStreamRef.current);
            } else {
              pc.addTransceiver('video', { direction: 'sendrecv' });
            }
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload)).catch(() => {});
          pc.getTransceivers().forEach(t => {
            if (t.receiver?.track?.kind === 'video') t.direction = 'sendrecv';
          });
          const answer = await pc.createAnswer().catch(() => null);
          if (answer) {
            answer.sdp = upgradeSdpForHighQualityStereoAudio(answer.sdp);
            await pc.setLocalDescription(answer).catch(() => {});
            sendAuthenticated({
              type: 'call-answer',
              targetId: data.fromId,
              payload: answer,
              sameMachineToken: getLocalMachineFingerprint()
            });
          }
          updateCallState('active');
          return;
        }

        setCallerInfo({
          id: data.fromId,
          name: data.callerName,
          video: data.video,
          offer: data.payload,
          sameMachineToken: data.sameMachineToken
        });
        updateCallState('ringing');
      } else if (data.type === 'call-answer') {
        if (data.sameMachineToken && data.sameMachineToken === getLocalMachineFingerprint()) {
          setSamePcPeers(prev => new Set(prev).add(data.fromId));
        }
        const pc = pcsRef.current.get(data.fromId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload)).catch(() => {});
          updateCallState('active');
        }
      } else if (data.type === 'call-candidate' && data.payload) {
        const pc = pcsRef.current.get(data.fromId);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(data.payload)).catch(() => {});
        }
      } else if (data.type === 'call-cam-toggle') {
        setRemoteCamStates(prev => new Map(prev).set(data.fromId, Boolean(data.camOn)));
      } else if (data.type === 'call-speaking') {
        setRemoteSpeakingMap(prev => new Map(prev).set(data.fromId, Boolean(data.speaking)));
      } else if (data.type === 'call-stream-state') {
        if (data.isLive) {
          const isSamePc = Boolean(
            data.sameMachineToken && data.sameMachineToken === getLocalMachineFingerprint()
          );
          if (isSamePc) {
            setSamePcPeers(prev => new Set(prev).add(data.fromId));
            setIsStreamAudioMuted(true);
          } else {
            setIsStreamAudioMuted(false);
          }
          updateStreamerId(data.fromId);
          setStreamerName(data.streamerName || 'Peer');
          setIsWatchingStream(false);
        } else if (streamerIdRef.current === data.fromId) {
          updateStreamerId(null);
          setStreamerName('');
          setIsWatchingStream(false);
        }
      } else if (data.type === 'call-end') {
        cleanupCall('Peer ended call');
      }
    };

    ws.addEventListener('message', handleCallSignaling);
    return () => {
      ws.removeEventListener('message', handleCallSignaling);
    };
  }, [ws, myId, isScreenSharing]);

  function buildWebAudioPipeline(rawStream) {
    try {
      if (dbIntervalRef.current) clearInterval(dbIntervalRef.current);
      audioCtxRef.current?.close().catch(() => {});

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 48000 });
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(rawStream);
      const gainNode = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;

      const destination = ctx.createMediaStreamDestination();
      destination.channelCount = 2;
      audioDestinationRef.current = destination;

      gainNode.gain.value = isMutedRef.current ? 0 : (inputGainValueRef.current / 100);
      source.connect(analyser);
      source.connect(gainNode);
      gainNode.connect(destination);

      if (screenStreamRef.current && screenStreamRef.current.getAudioTracks().length > 0) {
        attachSystemAudioTrackToMixer(screenStreamRef.current.getAudioTracks()[0], ctx, destination);
      }

      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const gatePollMs = 1000 / 4; // 250ms guarded voice-activity gate interval
      dbIntervalRef.current = setInterval(() => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const db = avg > 0 ? Math.round(20 * Math.log10(avg / 255)) : -100;

        const nowSpeaking = !isMutedRef.current && !isVoiceNoteRecordingRef.current && db >= inputGateRef.current;
        const crossedGate = nowSpeaking !== isSpeakingRef.current;
        if (crossedGate) {
          isSpeakingRef.current = nowSpeaking;
          setIsSpeaking(nowSpeaking);
          members.filter(m => m.id !== myId).forEach(p => {
            sendAuthenticated({ type: 'call-speaking', targetId: p.id, speaking: nowSpeaking });
          });
        }

        if (isMutedRef.current || isVoiceNoteRecordingRef.current) {
          gainNode.gain.value = 0;
        } else {
          gainNode.gain.value = nowSpeaking ? (inputGainValueRef.current / 100) : 0;
        }
      }, gatePollMs);

      const outTrack = destination.stream.getAudioTracks()[0];
      if (outTrack) outTrack.enabled = true;
      processedAudioTrackRef.current = outTrack;
      return outTrack;
    } catch (e) {
      const fallbackTrack = rawStream.getAudioTracks()[0];
      processedAudioTrackRef.current = fallbackTrack;
      return fallbackTrack;
    }
  }

  function attachSystemAudioTrackToMixer(screenAudioTrack, ctx, targetNode) {
    if (!screenAudioTrack || !ctx || !targetNode) return;
    try {
      if (screenAudioSourceRef.current) {
        try { screenAudioSourceRef.current.disconnect(); } catch (e) {}
        screenAudioSourceRef.current = null;
      }
      if (typeof screenAudioTrack.applyConstraints === 'function') {
        screenAudioTrack.applyConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000
        }).catch(() => {});
      }

      const sysAudioStream = new MediaStream([screenAudioTrack]);
      const sysSource = ctx.createMediaStreamSource(sysAudioStream);
      const sysGain = ctx.createGain();
      sysGain.gain.setValueAtTime(0.01, ctx.currentTime);
      sysGain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 0.15);

      sysSource.connect(sysGain);
      sysGain.connect(targetNode);
      screenAudioSourceRef.current = sysSource;

      if (processedAudioTrackRef.current) {
        processedAudioTrackRef.current.enabled = true;
      }
    } catch (err) {}
  }

  function createCallPeer(targetId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (e) => {
      if (e.candidate && !isStealthMode) {
        sendAuthenticated({ type: 'call-candidate', targetId, payload: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const lastUiUpdate = Date.now();
      setRemoteStreams(prev => {
        const existing = prev.get(targetId);
        const combinedTracks = new Map();

        if (existing) {
          existing.getTracks().forEach(t => combinedTracks.set(t.kind, t));
        }
        if (e.streams && e.streams[0]) {
          e.streams[0].getTracks().forEach(t => combinedTracks.set(t.kind, t));
        }
        if (e.track) {
          combinedTracks.set(e.track.kind, e.track);
        }

        const mergedStream = new MediaStream(Array.from(combinedTracks.values()));
        return new Map(prev).set(targetId, mergedStream);
      });
    };

    pcsRef.current.set(targetId, pc);
    return pc;
  }

  async function acquireLowCpuStream(withVideo) {
    const prefs = getAppSettings();
    inputGainValueRef.current = prefs.micGainPercent ?? 100;
    inputGateRef.current = prefs.micDecibelGate ?? -65;
    outputVolRef.current = prefs.speakerVolumePercent ?? 100;

    const audioConstraints = prefs.micDeviceId && prefs.micDeviceId !== 'default'
      ? { deviceId: { exact: prefs.micDeviceId }, echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression }
      : { echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: true };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: withVideo
          ? { width: { ideal: 640, max: 640 }, height: { ideal: 360, max: 360 }, frameRate: { ideal: 24, max: 30 } }
          : false
      });
      return { stream, gotVideo: withVideo && stream.getVideoTracks().length > 0 };
    } catch (err) {
      if (withVideo) {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        return { stream: audioOnlyStream, gotVideo: false };
      }
      throw err;
    }
  }

  async function startCall(withVideo) {
    const otherPeers = members.filter(m => m.id !== myId);
    if (otherPeers.length === 0) return;

    try {
      const { stream: rawStream, gotVideo } = await acquireLowCpuStream(withVideo);
      rawStreamRef.current = rawStream;
      savedCameraTrackRef.current = rawStream.getVideoTracks()[0] || null;
      setIsCamOn(gotVideo);
      setIsScreenSharing(false);
      setIsStageMinimized(false);
      updateCallState('active');

      const processedAudioTrack = buildWebAudioPipeline(rawStream);

      for (const peer of otherPeers) {
        const pc = createCallPeer(peer.id);
        if (processedAudioTrack) pc.addTrack(processedAudioTrack, rawStream);
        const videoTracks = rawStream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoTracks.forEach(vt => pc.addTrack(vt, rawStream));
        } else {
          pc.addTransceiver('video', { direction: 'sendrecv', streams: [rawStream] });
        }

        const offer = await pc.createOffer();
        offer.sdp = upgradeSdpForHighQualityStereoAudio(offer.sdp);
        await pc.setLocalDescription(offer);

        sendAuthenticated({
          type: 'call-invite',
          targetId: peer.id,
          callerName: myName,
          video: gotVideo,
          payload: offer,
          sameMachineToken: getLocalMachineFingerprint()
        });
      }
    } catch (err) {
      cleanupCall('startCall failed');
    }
  }

  async function acceptCall() {
    if (!callerInfo) return;
    try {
      if (callerInfo.sameMachineToken && callerInfo.sameMachineToken === getLocalMachineFingerprint()) {
        setSamePcPeers(prev => new Set(prev).add(callerInfo.id));
      }
      const { stream: rawStream, gotVideo } = await acquireLowCpuStream(callerInfo.video);
      rawStreamRef.current = rawStream;
      savedCameraTrackRef.current = rawStream.getVideoTracks()[0] || null;
      setIsCamOn(gotVideo);
      setIsScreenSharing(false);
      setIsStageMinimized(false);
      updateCallState('active');

      const processedAudioTrack = buildWebAudioPipeline(rawStream);

      const pc = createCallPeer(callerInfo.id);
      if (processedAudioTrack) pc.addTrack(processedAudioTrack, rawStream);
      rawStream.getVideoTracks().forEach(vt => pc.addTrack(vt, rawStream));

      await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.offer));
      pc.getTransceivers().forEach(t => {
        if (t.receiver?.track?.kind === 'video') t.direction = 'sendrecv';
      });
      const answer = await pc.createAnswer();
      answer.sdp = upgradeSdpForHighQualityStereoAudio(answer.sdp);
      await pc.setLocalDescription(answer);

      sendAuthenticated({
        type: 'call-answer',
        targetId: callerInfo.id,
        payload: answer,
        sameMachineToken: getLocalMachineFingerprint()
      });
      sendAuthenticated({ type: 'call-cam-toggle', targetId: callerInfo.id, camOn: gotVideo });
    } catch (err) {
      cleanupCall('acceptCall failed');
    }
  }

  function endCall() {
    members.filter(m => m.id !== myId).forEach(peer => {
      sendAuthenticated({ type: 'call-end', targetId: peer.id });
    });
    cleanupCall('User clicked End Call');
  }

  function cleanupCall() {
    if (dbIntervalRef.current) clearInterval(dbIntervalRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (windowWatcherIntervalRef.current) {
      clearInterval(windowWatcherIntervalRef.current);
      windowWatcherIntervalRef.current = null;
    }
    activeSourceIdRef.current = null;

    if (screenAudioSourceRef.current) {
      try { screenAudioSourceRef.current.disconnect(); } catch (e) {}
      screenAudioSourceRef.current = null;
    }

    if (localScreenVideoRef.current) {
      localScreenVideoRef.current.pause();
      localScreenVideoRef.current.srcObject = null;
    }
    if (localCamVideoRef.current) {
      localCamVideoRef.current.pause();
      localCamVideoRef.current.srcObject = null;
    }

    pcsRef.current.forEach(pc => {
      try {
        pc.getSenders().forEach(s => {
          try { s.replaceTrack(null); } catch (e) {}
        });
        pc.close();
      } catch (e) {}
    });
    pcsRef.current.clear();

    screenStreamRef.current?.getTracks().forEach(t => {
      t.onended = null;
      t.stop();
    });
    screenStreamRef.current = null;

    rawStreamRef.current?.getTracks().forEach(t => t.stop());
    rawStreamRef.current = null;
    savedCameraTrackRef.current?.stop();
    savedCameraTrackRef.current = null;
    processedAudioTrackRef.current?.stop();
    processedAudioTrackRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    remoteVideoRefs.current.clear();
    setRemoteStreams(new Map());
    setRemoteCamStates(new Map());
    setRemoteSpeakingMap(new Map());
    setSamePcPeers(new Set());
    updateCallState('idle');
    setCallerInfo(null);
    setIsMuted(false);
    isMutedRef.current = false;
    setIsDeafened(false);
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setIsCamOn(false);
    setIsScreenSharing(false);
    setIsStageMinimized(false);
    updateStreamerId(null);
    setStreamerName('');
    setIsWatchingStream(false);
    setShowGoLiveModal(false);
    setIsFullscreen(false);
    setHideMembers(false);
    setUserMenuPopup(null);
    setStreamMenuPopup(null);
  }

  function toggleMute() {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    isMutedRef.current = nextMute;

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextMute ? 0 : (inputGainValueRef.current / 100);
    }
    rawStreamRef.current?.getAudioTracks().forEach(t => {
      t.enabled = !nextMute;
    });
    if (nextMute && isSpeakingRef.current) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      members.filter(m => m.id !== myId).forEach(p => {
        sendAuthenticated({ type: 'call-speaking', targetId: p.id, speaking: false });
      });
    }
  }

  function toggleDeafen() {
    const nextDeaf = !isDeafened;
    setIsDeafened(nextDeaf);
    if (nextDeaf && !isMuted) {
      toggleMute();
    }
  }

  async function toggleCamera() {
    if (!rawStreamRef.current) return;
    const otherPeers = members.filter(m => m.id !== myId);

    if (isScreenSharing) {
      await stopScreenSharingCleanly();
      return;
    }

    const videoTrack = rawStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      const nextState = !videoTrack.enabled;
      videoTrack.enabled = nextState;
      setIsCamOn(nextState);
      otherPeers.forEach(p => {
        sendAuthenticated({ type: 'call-cam-toggle', targetId: p.id, camOn: nextState });
      });
    } else {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { max: 24 } }
        });
        const newVidTrack = camStream.getVideoTracks()[0];
        rawStreamRef.current.addTrack(newVidTrack);
        savedCameraTrackRef.current = newVidTrack;

        for (const peer of otherPeers) {
          const pc = pcsRef.current.get(peer.id);
          if (pc) {
            const vTransceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
            if (vTransceiver && vTransceiver.sender) {
              vTransceiver.direction = 'sendrecv';
              await vTransceiver.sender.replaceTrack(newVidTrack);
            } else {
              pc.addTrack(newVidTrack, rawStreamRef.current);
            }
          }
        }
        setIsCamOn(true);
        otherPeers.forEach(p => {
          sendAuthenticated({ type: 'call-cam-toggle', targetId: p.id, camOn: true });
        });
      } catch (e) {}
    }
  }

  async function handleScreenShareButtonClick() {
    if (isScreenSharing) {
      await stopScreenSharingCleanly();
      return;
    }

    if (window.dropwireDesktop && typeof window.dropwireDesktop.getSources === 'function') {
      try {
        const sources = await window.dropwireDesktop.getSources();
        const wins = sources.filter(s => !s.isScreen);
        const scrs = sources.filter(s => s.isScreen);

        setAvailableWindows(wins);
        setAvailableScreens(scrs);

        if (scrs.length > 0) {
          setSelectedSourceId(scrs[0].id);
          setPickerTab('screens');
        } else if (wins.length > 0) {
          setSelectedSourceId(wins[0].id);
          setPickerTab('windows');
        }
        setShowGoLiveModal(true);
        return;
      } catch (e) {}
    }

    if (navigator.mediaDevices?.getDisplayMedia) {
      await startScreenStreamWithConfig('web:display', shareSystemAudio, streamRes, streamFps);
    }
  }

  async function stopScreenSharingCleanly() {
    if (windowWatcherIntervalRef.current) {
      clearInterval(windowWatcherIntervalRef.current);
      windowWatcherIntervalRef.current = null;
    }
    activeSourceIdRef.current = null;

    if (screenAudioSourceRef.current) {
      try { screenAudioSourceRef.current.disconnect(); } catch (e) {}
      screenAudioSourceRef.current = null;
    }

    if (localScreenVideoRef.current) {
      localScreenVideoRef.current.pause();
      localScreenVideoRef.current.srcObject = null;
    }

    const camTrack = savedCameraTrackRef.current || rawStreamRef.current?.getVideoTracks()[0] || null;
    const restoredCamOn = Boolean(camTrack && camTrack.enabled);

    const otherPeers = members.filter(m => m.id !== myId);
    for (const peer of otherPeers) {
      const pc = pcsRef.current.get(peer.id);
      if (pc) {
        const vTransceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
        if (vTransceiver?.sender) {
          await vTransceiver.sender.replaceTrack(restoredCamOn ? camTrack : null).catch(() => {});
        }
      }
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      screenStreamRef.current = null;
    }

    setIsScreenSharing(false);
    setIsCamOn(restoredCamOn);
    updateStreamerId(null);
    setStreamerName('');
    setIsWatchingStream(false);

    for (const peer of otherPeers) {
      sendAuthenticated({ type: 'call-stream-state', targetId: peer.id, isLive: false });
      sendAuthenticated({ type: 'call-cam-toggle', targetId: peer.id, camOn: restoredCamOn });
    }
  }

  async function startScreenStreamWithConfig(sourceId, withAudio, resolution, fps) {
    setShowGoLiveModal(false);
    const otherPeers = members.filter(m => m.id !== myId);

    try {
      saveAppSettings({ ...getAppSettings(), streamResolution: resolution, streamFps: fps });

      const myMachineToken = getLocalMachineFingerprint();
      otherPeers.forEach(p => {
        sendAuthenticated({
          type: 'call-stream-state',
          targetId: p.id,
          isLive: true,
          streamerName: myName,
          sameMachineToken: myMachineToken
        });
      });

      await new Promise(r => setTimeout(r, 80));

      const resMap = {
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
        '1440p': { width: 2560, height: 1440 }
      };
      const targetDim = resMap[resolution] || resMap['1080p'];
      const targetFps = Number(fps) || 60;

      let displayStream = null;
      const isElectronSource = Boolean(
        window.dropwireDesktop && sourceId && !String(sourceId).startsWith('web:')
      );

      if (isElectronSource) {
        // 🚫 ZERO YELLOW BORDER IN ELECTRON:
        // Uses legacy `chromeMediaSource: 'desktop'` via getUserMedia instead of getDisplayMedia (WGC)!
        const videoStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: targetDim.width,
              maxHeight: targetDim.height,
              minFrameRate: 30,
              maxFrameRate: targetFps
            }
          }
        });

        const tracks = [...videoStream.getVideoTracks()];

        if (withAudio) {
          try {
            const screenAudioId = availableScreens[0]?.id || sourceId;
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: screenAudioId
                }
              },
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: screenAudioId,
                  maxWidth: 32,
                  maxHeight: 32,
                  maxFrameRate: 1
                }
              }
            });
            audioStream.getVideoTracks().forEach(vt => vt.stop());
            if (audioStream.getAudioTracks()[0]) {
              tracks.push(audioStream.getAudioTracks()[0]);
            }
          } catch (audioErr) {}
        }

        displayStream = new MediaStream(tracks);
      } else {
        if (sourceId && window.dropwireDesktop?.selectSource) {
          await window.dropwireDesktop.selectSource(sourceId, withAudio);
        }
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: targetDim.width },
            height: { ideal: targetDim.height },
            frameRate: { ideal: targetFps, max: targetFps }
          },
          audio: withAudio
            ? {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2,
                sampleRate: 48000
              }
            : false
        });
      }

      screenStreamRef.current = displayStream;
      activeSourceIdRef.current = sourceId;

      const screenVideoTrack = displayStream.getVideoTracks()[0];
      const screenAudioTrack = displayStream.getAudioTracks()[0];

      if (screenVideoTrack) {
        if ('contentHint' in screenVideoTrack) {
          screenVideoTrack.contentHint = 'motion';
        }
        screenVideoTrack.onended = () => {
          stopScreenSharingCleanly();
        };
      }

      if (windowWatcherIntervalRef.current) {
        clearInterval(windowWatcherIntervalRef.current);
      }
      windowWatcherIntervalRef.current = setInterval(async () => {
        const currentVidTrack = screenStreamRef.current?.getVideoTracks()[0];
        if (!currentVidTrack || currentVidTrack.readyState === 'ended') {
          stopScreenSharingCleanly();
          return;
        }
        if (
          activeSourceIdRef.current &&
          String(activeSourceIdRef.current).startsWith('window:') &&
          window.dropwireDesktop?.checkSourceAlive
        ) {
          const isAlive = await window.dropwireDesktop.checkSourceAlive(activeSourceIdRef.current);
          if (!isAlive) {
            stopScreenSharingCleanly();
          }
        }
      }, 2500);

      if (screenAudioTrack && audioCtxRef.current && audioDestinationRef.current) {
        if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume().catch(() => {});
        }
        attachSystemAudioTrackToMixer(screenAudioTrack, audioCtxRef.current, audioDestinationRef.current);
      }

      for (const peer of otherPeers) {
        const pc = pcsRef.current.get(peer.id);
        if (pc) {
          let vSender = null;
          const vTransceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
          if (vTransceiver && vTransceiver.sender) {
            vTransceiver.direction = 'sendrecv';
            await vTransceiver.sender.replaceTrack(screenVideoTrack);
            vSender = vTransceiver.sender;
          } else {
            vSender = pc.addTrack(screenVideoTrack, displayStream);
          }

          if (vSender && typeof vSender.getParameters === 'function') {
            try {
              const params = vSender.getParameters();
              if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
              }
              params.encodings[0].maxBitrate = resolution === '1440p' ? 12_000_000 : 8_000_000;
              params.encodings[0].maxFramerate = targetFps;
              params.encodings[0].scaleResolutionDownBy = 1.0;
              params.degradationPreference = 'maintain-framerate';
              await vSender.setParameters(params).catch(() => {});
            } catch (err) {}
          }
        }
      }

      setIsScreenSharing(true);
      updateStreamerId(myId);
      setStreamerName(myName || 'You');
      setIsWatchingStream(true);
      setIsStageMinimized(false);
    } catch (e) {
      otherPeers.forEach(p => {
        sendAuthenticated({ type: 'call-stream-state', targetId: p.id, isLive: false });
      });
    }
  }

  function handleOpenUserMenu(e, peerId, name, isMe) {
    const rectX = Math.min(window.innerWidth - 240, Math.max(12, e.clientX));
    const rectY = Math.min(window.innerHeight - 260, Math.max(12, e.clientY));
    setStreamMenuPopup(null);
    setUserMenuPopup({ x: rectX, y: rectY, peerId, name, isMe });
  }

  function handleOpenStreamMenu(e) {
    const rectX = Math.min(window.innerWidth - 260, Math.max(12, e.clientX));
    const rectY = Math.min(window.innerHeight - 320, Math.max(12, e.clientY));
    setUserMenuPopup(null);
    setStreamMenuPopup({ x: rectX, y: rectY });
  }

  async function handlePopOutStream() {
    setStreamMenuPopup(null);
    const targetVideo = isMeStreaming ? localScreenVideoRef.current : remoteStreamVideoRef.current;
    if (targetVideo && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await targetVideo.requestPictureInPicture();
        }
      } catch (e) {}
    }
  }

  function handleToggleFullscreen() {
    if (!isFullscreen) {
      setSavedPreFullscreenPos({ x: posRef.current.x, y: posRef.current.y });
      setIsFullscreen(true);
    } else {
      setIsFullscreen(false);
      posRef.current = { ...savedPreFullscreenPos };
      setPosition({ ...savedPreFullscreenPos });
    }
  }

  function startDragging(e) {
    if (isFullscreen) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    const rect = callDockRef.current?.getBoundingClientRect();
    const currentLeft = rect ? rect.left : posRef.current.x;
    const currentTop = rect ? rect.top : posRef.current.y;
    posRef.current = { x: currentLeft, y: currentTop };
    dragRef.current = {
      isDragging: true,
      offsetX: e.clientX - currentLeft,
      offsetY: e.clientY - currentTop
    };
  }

  const otherMembers = members.filter(m => m.id !== myId);
  const totalGridBoxes = 1 + otherMembers.length + (hasActiveStream ? 1 : 0);

  function getGridTileStyle(count) {
    if (count === 1) return { width: '100%', height: '100%' };
    if (count === 2) return { width: 'calc(50% - 6px)', height: '82%' };
    if (count === 3 || count === 4) return { width: 'calc(50% - 6px)', height: 'calc(50% - 6px)' };
    return { width: 'calc(33.333% - 8px)', height: 'calc(50% - 6px)' };
  }

  const gridTileStyle = getGridTileStyle(totalGridBoxes);
  const sidebarWidth =
    typeof window !== 'undefined' && window.innerWidth >= 768
      ? Math.min(360, Math.max(280, Math.round(window.innerWidth * 0.26)))
      : 0;
  const stageAvailableWidth = (typeof window !== 'undefined' ? window.innerWidth : 1280) - sidebarWidth;
  const desiredWidth = hasActiveStream && isWatchingStream ? 760 : 620;
  const desiredHeight = hasActiveStream && isWatchingStream ? 500 : 400;
  const responsiveWidth = Math.min(desiredWidth, stageAvailableWidth - 24);
  const responsiveHeight = Math.min(desiredHeight, (typeof window !== 'undefined' ? window.innerHeight : 800) - 40);

  const minSafeLeft = sidebarWidth + 12;
  const maxSafeLeft = Math.max(minSafeLeft, (typeof window !== 'undefined' ? window.innerWidth : 1280) - responsiveWidth - 12);
  const safeLeft = Math.max(minSafeLeft, Math.min(maxSafeLeft, position.x));

  return (
    <>
      {callState === 'idle' && !isStealthMode && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => startCall(false)}
            className="p-1.5 rounded-lg bg-[#060913] hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-800 transition cursor-pointer"
            title="Start Voice Call"
          >
            <Phone size={14} />
          </button>
          <button
            onClick={() => startCall(true)}
            className="p-1.5 rounded-lg bg-[#060913] hover:bg-blue-500/20 text-slate-300 hover:text-blue-400 border border-slate-800 transition cursor-pointer"
            title="Start Video Call"
          >
            <Video size={14} />
          </button>
        </div>
      )}

      {callState === 'ringing' && callerInfo && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center backdrop-blur-md p-4">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 animate-bounce">
              {callerInfo.video ? <Video size={26} /> : <Phone size={26} />}
            </div>
            <h3 className="text-sm font-bold text-white">{callerInfo.name || 'Peer'}</h3>
            <p className="text-xs text-slate-400 mt-1 mb-5">
              Incoming {callerInfo.video ? 'Video' : 'Voice'} Call
            </p>
            <div className="flex gap-3">
              <button onClick={endCall} className="flex-1 py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold transition cursor-pointer">
                Decline
              </button>
              <button onClick={acceptCall} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 cursor-pointer">
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      <GoLiveModal
        showGoLiveModal={showGoLiveModal}
        setShowGoLiveModal={setShowGoLiveModal}
        pickerTab={pickerTab}
        setPickerTab={setPickerTab}
        availableScreens={availableScreens}
        availableWindows={availableWindows}
        selectedSourceId={selectedSourceId}
        setSelectedSourceId={setSelectedSourceId}
        shareSystemAudio={shareSystemAudio}
        setShareSystemAudio={setShareSystemAudio}
        startScreenStreamWithConfig={startScreenStreamWithConfig}
        streamRes={streamRes}
        streamFps={streamFps}
      />

      <UserContextMenu
        userMenuPopup={userMenuPopup}
        userVolumes={userVolumes}
        setUserVolumes={setUserVolumes}
        mutedUsers={mutedUsers}
        setMutedUsers={setMutedUsers}
        disabledVideoUsers={disabledVideoUsers}
        setDisabledVideoUsers={setDisabledVideoUsers}
        isMuted={isMuted}
        toggleMute={toggleMute}
      />

      <StreamContextMenu
        streamMenuPopup={streamMenuPopup}
        setIsWatchingStream={setIsWatchingStream}
        setStreamMenuPopup={setStreamMenuPopup}
        isStreamAudioMuted={isStreamAudioMuted}
        setIsStreamAudioMuted={setIsStreamAudioMuted}
        streamAudioVolume={streamAudioVolume}
        setStreamAudioVolume={setStreamAudioVolume}
        handlePopOutStream={handlePopOutStream}
        streamAttenuation={streamAttenuation}
        setStreamAttenuation={setStreamAttenuation}
        streamAttenuationStrength={streamAttenuationStrength}
        setStreamAttenuationStrength={setStreamAttenuationStrength}
      />

      {callState === 'active' && (
        <VoiceConnectedDock
          roomName="Voice / DropWire"
          myId={myId}
          myName={myName}
          members={members}
          isSpeaking={isSpeaking}
          remoteSpeakingMap={remoteSpeakingMap}
          pingMs={pingMs}
          isMuted={isMuted}
          isDeafened={isDeafened}
          isCamOn={isCamOn}
          isScreenSharing={isScreenSharing}
          isStageMinimized={isStageMinimized}
          onToggleMute={toggleMute}
          onToggleDeafen={toggleDeafen}
          onToggleCam={toggleCamera}
          onToggleScreenShare={handleScreenShareButtonClick}
          onToggleStageMinimized={() => setIsStageMinimized(prev => !prev)}
          onEndCall={endCall}
        />
      )}

      {callState === 'active' && !isStageMinimized && (
        <div
          ref={callDockRef}
          onMouseDown={startDragging}
          onDoubleClick={handleToggleFullscreen}
          style={
            isFullscreen
              ? {
                  top: 0,
                  left: `${sidebarWidth}px`,
                  width: `${stageAvailableWidth}px`,
                  height: '100dvh'
                }
              : {
                  top: position.y,
                  left: safeLeft,
                  width: `${responsiveWidth}px`,
                  height: `${responsiveHeight}px`
                }
          }
          className={`fixed z-40 bg-[#060913] border border-slate-800 shadow-2xl flex flex-col justify-between select-none ${
            isFullscreen ? 'rounded-none p-4' : 'rounded-2xl p-3 cursor-grab active:cursor-grabbing'
          }`}
        >
          <div className="flex-1 min-h-0 w-full flex flex-col gap-3 overflow-hidden">
            {hasActiveStream && isWatchingStream ? (
              <>
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenStreamMenu(e);
                  }}
                  className="group w-full flex-1 min-h-0 bg-black rounded-xl overflow-hidden relative flex items-center justify-center"
                >
                  <video
                    ref={isMeStreaming ? localScreenVideoRef : remoteStreamVideoRef}
                    autoPlay
                    playsInline
                    muted={isMeStreaming || isDeafened || isStreamAudioMuted || Boolean(streamerId && samePcPeers.has(streamerId))}
                    className="w-full h-full object-contain bg-black"
                  />

                  <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHideMembers(prev => !prev);
                      }}
                      className="p-2 rounded-lg bg-[#0d1322]/90 hover:bg-[#0d1322] text-slate-200 hover:text-white border border-slate-700 cursor-pointer"
                      title={hideMembers ? 'Show Members' : 'Hide Members'}
                    >
                      {hideMembers ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenStreamMenu(e);
                      }}
                      className="p-2 rounded-lg bg-[#0d1322]/90 hover:bg-[#0d1322] text-slate-200 hover:text-white border border-slate-700 cursor-pointer"
                      title="Stream Options"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>

                {!hideMembers && (
                  <div className="w-full h-24 flex items-center justify-center gap-2.5 overflow-x-auto custom-scrollbar shrink-0">
                    <StreamPreviewTile
                      streamerName={streamerName}
                      streamSource={activeStreamSource}
                      isWatching={true}
                      compact={true}
                      onOpenStreamMenu={handleOpenStreamMenu}
                    />

                    <ParticipantTile
                      peerId={myId}
                      name={myName || 'Me'}
                      isMe={true}
                      videoRef={localCamVideoRef}
                      stream={rawStreamRef.current}
                      isCamOn={isCamOn}
                      isSpeaking={isSpeaking}
                      muteAudio={true}
                      compact={true}
                      onOpenUserMenu={handleOpenUserMenu}
                    />

                    {otherMembers.map(member => {
                      const isThisPeerStreaming = streamerId === member.id;
                      return (
                        <ParticipantTile
                          key={member.id}
                          peerId={member.id}
                          name={member.name || 'Peer'}
                          isMe={false}
                          videoRef={getRemoteVideoRef(member.id)}
                          stream={remoteStreams.get(member.id)}
                          isCamOn={!isThisPeerStreaming && Boolean(remoteCamStates.get(member.id))}
                          isSpeaking={Boolean(remoteSpeakingMap.get(member.id))}
                          muteAudio={
                            isDeafened ||
                            isThisPeerStreaming ||
                            Boolean(mutedUsers[member.id]) ||
                            samePcPeers.has(member.id)
                          }
                          userVolume={userVolumes[member.id] ?? 100}
                          isVideoDisabled={Boolean(disabledVideoUsers[member.id])}
                          compact={true}
                          onOpenUserMenu={handleOpenUserMenu}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-0 w-full p-2 flex flex-wrap items-center justify-center content-center gap-3 overflow-hidden">
                {hasActiveStream && (
                  <StreamPreviewTile
                    streamerName={streamerName}
                    streamSource={activeStreamSource}
                    isWatching={false}
                    styleObj={gridTileStyle}
                    onWatchStream={() => setIsWatchingStream(true)}
                    onOpenStreamMenu={handleOpenStreamMenu}
                  />
                )}

                <ParticipantTile
                  peerId={myId}
                  name={myName || 'Me'}
                  isMe={true}
                  videoRef={localCamVideoRef}
                  stream={rawStreamRef.current}
                  isCamOn={isCamOn}
                  isSpeaking={isSpeaking}
                  muteAudio={true}
                  styleObj={gridTileStyle}
                  onOpenUserMenu={handleOpenUserMenu}
                />

                {otherMembers.map(member => {
                  const isThisPeerStreaming = streamerId === member.id;
                  return (
                    <ParticipantTile
                      key={member.id}
                      peerId={member.id}
                      name={member.name || 'Peer'}
                      isMe={false}
                      videoRef={getRemoteVideoRef(member.id)}
                      stream={remoteStreams.get(member.id)}
                      isCamOn={!isThisPeerStreaming && Boolean(remoteCamStates.get(member.id))}
                      isSpeaking={Boolean(remoteSpeakingMap.get(member.id))}
                      muteAudio={
                        isDeafened ||
                        Boolean(mutedUsers[member.id]) ||
                        samePcPeers.has(member.id)
                      }
                      userVolume={userVolumes[member.id] ?? 100}
                      isVideoDisabled={Boolean(disabledVideoUsers[member.id])}
                      styleObj={gridTileStyle}
                      onOpenUserMenu={handleOpenUserMenu}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-3 px-2 shrink-0">
            <div className="w-12" />

            <div className="flex items-center gap-2 bg-[#0d1322] border border-slate-800 px-3 py-1.5 rounded-2xl shadow-xl">
              <button
                onClick={toggleMute}
                className={`p-2.5 rounded-xl transition cursor-pointer ${
                  isMuted
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-[#060913] hover:bg-slate-800 text-slate-200'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              <button
                onClick={toggleCamera}
                className={`p-2.5 rounded-xl transition cursor-pointer ${
                  isCamOn
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#060913] hover:bg-slate-800 text-slate-300'
                }`}
                title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {isCamOn ? <Video size={16} /> : <VideoOff size={16} />}
              </button>

              <button
                onClick={handleScreenShareButtonClick}
                className={`p-2.5 rounded-xl transition cursor-pointer ${
                  isScreenSharing
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-[#060913] hover:bg-slate-800 text-slate-200'
                }`}
                title={isScreenSharing ? 'Stop Streaming' : 'Share Your Screen'}
              >
                <Monitor size={16} />
              </button>

              <button
                onClick={endCall}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition cursor-pointer shadow-lg shadow-red-600/20"
                title="Disconnect"
              >
                <PhoneOff size={16} />
              </button>
            </div>

            <div className="w-12 flex justify-end">
              <button
                onClick={handleToggleFullscreen}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

