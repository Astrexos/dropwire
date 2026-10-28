// client/src/components/AudioComponents.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { getAppSettings, applySpeakerDeviceToElement } from './SettingsModal';

export function LiveMicWaveform({ stream }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    let audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }

    const tracks = stream.getAudioTracks();
    if (!tracks.length || tracks[0].readyState === 'ended') {
      audioCtx.close().catch(() => {});
      return;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;

    const renderWave = () => {
      if (!tracks.length || tracks[0].readyState === 'ended') return;

      animId = requestAnimationFrame(renderWave);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 18;
      const barWidth = 3;
      const gap = 3.5;
      const totalWidth = barCount * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i + 2] || 0;
        const percent = val / 255;
        const height = Math.max(4, Math.round(percent * 22));
        const x = startX + i * (barWidth + gap);
        const y = (canvas.height - height) / 2;

        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, height, 2);
        } else {
          ctx.rect(x, y, barWidth, height);
        }
        ctx.fill();
      }
    };

    renderWave();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      audioCtx.close().catch(() => {});
    };
  }, [stream]);

  return <canvas ref={canvasRef} width={135} height={28} className="shrink-0" />;
}

export function WaveformVoicePlayer({ url, isMe }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const prefs = getAppSettings();
    audio.volume = Math.min(1, Math.max(0, (prefs.speakerVolumePercent ?? 100) / 100));
    if (prefs.speakerDeviceId) {
      applySpeakerDeviceToElement(audio, prefs.speakerDeviceId);
    }

    const onLoadedMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };

    audio.addEventListener('loadedmetadata', onLoadedMeta);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMeta);
      audio.removeEventListener('ended', onEnded);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const updateSmoothProgress = () => {
    if (audioRef.current && isPlaying) {
      setCurrentTime(audioRef.current.currentTime);
      animFrameRef.current = requestAnimationFrame(updateSmoothProgress);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateSmoothProgress);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, [isPlaying]);

  function togglePlay(e) {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const prefs = getAppSettings();
      audioRef.current.volume = Math.min(1, Math.max(0, (prefs.speakerVolumePercent ?? 100) / 100));
      if (prefs.speakerDeviceId) {
        applySpeakerDeviceToElement(audioRef.current, prefs.speakerDeviceId);
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function toggleSpeed(e) {
    e.stopPropagation();
    if (!audioRef.current) return;
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    audioRef.current.playbackRate = nextSpeed;
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const bars = [8, 14, 22, 12, 18, 28, 16, 24, 10, 20, 26, 14, 18, 24, 16, 22, 12, 28, 18, 12, 20, 14, 10, 16, 22, 14];
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`p-2.5 rounded-2xl flex items-center gap-3 w-64 select-none transition-all duration-200 shadow-md ${
      isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-[#0d1322] text-slate-100 rounded-bl-sm border border-slate-800/90'
    }`}>
      <audio ref={audioRef} src={url} preload="none" />
      
      <button 
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 cursor-pointer ${
          isMe ? 'bg-white text-blue-600 hover:bg-slate-100 shadow-sm' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
        }`}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <div 
        className="flex-1 flex flex-col justify-center gap-1 cursor-pointer py-1"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (audioRef.current && duration) {
            audioRef.current.currentTime = clickRatio * duration;
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
      >
        <div className="flex items-center gap-[2px] h-6 w-full">
          {bars.map((height, i) => {
            const barRatio = (i / bars.length) * 100;
            const isPlayed = progressPercent >= barRatio;
            return (
              <div 
                key={i} 
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  isPlayed 
                    ? (isMe ? 'bg-white' : 'bg-blue-400') 
                    : (isMe ? 'bg-blue-300/50' : 'bg-slate-700')
                }`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>

        <div className="flex justify-between items-center text-[10px] opacity-80 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '0:00'}</span>
        </div>
      </div>

      <button 
        onClick={toggleSpeed}
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold shrink-0 transition-colors cursor-pointer ${
          isMe ? 'bg-blue-700/80 hover:bg-blue-700 text-white' : 'bg-[#060913] hover:bg-slate-800 text-slate-200 border border-slate-800'
        }`}
      >
        {speed}x
      </button>
    </div>
  );
}

export function SyncedChatGif({ mp4Url, gifUrl, sentAt }) {
  const videoRef = useRef(null);
  const [useFallbackImg, setUseFallbackImg] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || useFallbackImg) return;

    const syncFrame = () => {
      if (video.duration && sentAt) {
        const elapsed = (Date.now() - sentAt) / 1000;
        const targetTime = elapsed % video.duration;
        if (Math.abs(video.currentTime - targetTime) > 0.2) {
          video.currentTime = targetTime;
        }
      }
    };

    video.addEventListener('loadedmetadata', syncFrame);
    video.addEventListener('play', syncFrame);

    return () => {
      video.removeEventListener('loadedmetadata', syncFrame);
      video.removeEventListener('play', syncFrame);
    };
  }, [sentAt, useFallbackImg]);

  if (useFallbackImg) {
    return <img src={gifUrl} alt="Reaction GIF" className="w-full h-auto max-h-80 object-cover rounded-2xl" />;
  }

  return (
    <video
      ref={videoRef}
      src={mp4Url}
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      onError={() => setUseFallbackImg(true)}
      className="w-full h-auto max-h-80 object-cover rounded-2xl bg-black"
    />
  );
}

