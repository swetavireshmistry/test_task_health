import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, Activity } from 'lucide-react';

const WS_URL = (import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000') + '/api/ws/voice';
const SILENCE_THRESHOLD_DB = -30;    
const SILENCE_DURATION_MS = 2000;     
const MIN_SPEECH_DURATION_MS = 600;  
const MAX_SPEECH_DURATION_MS = 30000;
const MIC_SETTLE_MS = 400;           
const MIN_AUDIO_ENERGY_DB = -38;     


const STATUS_LABELS = {
  connecting: 'Connecting…',
  listening: 'Listening…',
  transcribing: 'Understanding…',
  processing: 'Thinking…',
  speaking: 'Speaking…',
  muted: 'Muted',
  idle: 'Tap mic to start',
};

const STATUS_COLORS = {
  connecting: 'text-yellow-400',
  listening: 'text-emerald-400',
  transcribing: 'text-sky-400',
  processing: 'text-purple-400',
  speaking: 'text-indigo-400',
  muted: 'text-slate-400',
  idle: 'text-slate-400',
};

export default function VoiceCall() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  const [callStatus, setCallStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [waveform, setWaveform] = useState(new Array(20).fill(2));
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((message, type = 'info') => {
    setLogs((prev) => [{
      id: Math.random().toString(36).substr(2, 9),
      message,
      type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }, ...prev].slice(0, 10));
  }, []);

  const wsRef = useRef(null);
  const threadIdRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const vadTimerRef = useRef(null);
  const speechStartRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const lastSpeechTimeRef = useRef(0);
  const waveformRafRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const isMutedRef = useRef(false);
  const isSpeakerOffRef = useRef(false);
  const callStatusRef = useRef('connecting');
  const audioSourcesRef = useRef([]);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const pendingListenRef = useRef(false);
  const pendingResponseTextRef = useRef('');
  const isAIActiveRef = useRef(false);  
  const micEnabledAtRef = useRef(0);    

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isSpeakerOffRef.current = isSpeakerOff; }, [isSpeakerOff]);
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);

  const connectWS = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Voice WS connected');
      setCallStatus('listening');
      startMicrophone();
      
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      ws.pingInterval = pingInterval;
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'pong') return;
        handleServerMessage(msg);
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('Voice WS error:', err);
      setCallStatus('idle');
    };

    ws.onclose = () => {
      console.log('Voice WS closed');
      if (ws.pingInterval) clearInterval(ws.pingInterval);
      if (callStatusRef.current !== 'idle') {
        setCallStatus('connecting');
        setTimeout(() => connectWS(), 2000);
      }
    };
  }, []);

  const setMicEnabled = (enabled) => {
    isAIActiveRef.current = !enabled;
    if (enabled) micEnabledAtRef.current = Date.now();
    streamRef.current?.getAudioTracks().forEach((t) => {
      if (!isMutedRef.current) t.enabled = enabled;
    });
  };

  const handleServerMessage = (msg) => {
    switch (msg.type) {
      case 'status': {
        if (msg.status === 'listening') {
          if (isPlayingRef.current || audioQueueRef.current.length > 0) {
            pendingListenRef.current = true;
          } else {
            setMicEnabled(true);
            setCallStatus('listening');
            addLog('System: Ready and listening', 'info');
          }
        } else if (msg.status === 'transcribing') {
          setMicEnabled(false);
          if (callStatusRef.current !== 'transcribing') {
            setCallStatus('transcribing');
            addLog('STT: Converting voice to text...', 'step');
          }
          pendingListenRef.current = false;
        } else {
          setMicEnabled(false);
          pendingListenRef.current = false;
          setCallStatus(msg.status);
          if (msg.status === 'processing') addLog('LLM: Processing request...', 'step');
          if (msg.status === 'speaking') addLog('TTS: Synthesizing response...', 'step');
        }
        break;
      }
      case 'transcript':
        setTranscript(msg.text);
        addLog(`STT Result: "${msg.text}"`, 'success');
        break;
      case 'token':
        setResponseText((prev) => prev + msg.text);
        break;
      case 'response_text':
        setResponseText(msg.text);
        pendingResponseTextRef.current = '';
        addLog('LLM Result received', 'success');
        break;
      case 'audio_chunk':
        if (!isSpeakerOffRef.current) {
          queueAudioChunk(msg.data);
          if (callStatusRef.current !== 'speaking') {
            if (pendingResponseTextRef.current) {
              setResponseText(pendingResponseTextRef.current);
              pendingResponseTextRef.current = '';
            }
            setCallStatus('speaking');
          }
        }
        break;
      case 'audio_end':
        if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
          pendingListenRef.current = false;
          setCallStatus('listening');
          addLog('System: Ready and listening', 'info');
        } else {
          pendingListenRef.current = true;
        }
        break;
      case 'interrupt':
        pendingListenRef.current = false;
        stopAllPlayback();
        setCallStatus('listening');
        addLog('Playback interrupted by barge-in', 'warning');
        break;
      case 'debug':
        console.log('[Voice Debug]', msg.message);
        break;
      case 'error':
        console.error('Voice WS error:', msg.message);
        pendingListenRef.current = false;
        setCallStatus('listening');
        break;
    }
  };

  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      startMediaRecorder(stream);
      startVAD();
      startWaveformAnimation();
      startDurationTimer();
    } catch (err) {
      console.error('Mic error:', err);
      setCallStatus('idle');
    }
  };

  const audioDataRef = useRef([]);
  const processorRef = useRef(null);

  const startMediaRecorder = (stream) => {
    console.log('[Voice] Initializing custom WAV recorder');
    
    if (!audioCtxRef.current) return;
    
    const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    
    processor.onaudioprocess = (e) => {
      if (isSpeakingRef.current) {
        const input = e.inputBuffer.getChannelData(0);
        audioDataRef.current.push(new Float32Array(input));
      }
    };
    
    
    const silentGain = audioCtxRef.current.createGain();
    silentGain.gain.value = 0;
    analyserRef.current.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioCtxRef.current.destination);
  };

  const mergeBuffers = (buffers) => {
    let length = 0;
    buffers.forEach(b => length += b.length);
    const result = new Float32Array(length);
    let offset = 0;
    buffers.forEach(b => {
      result.set(b, offset);
      offset += b.length;
    });
    return result;
  };

  const encodeWAV = (samples, sampleRate) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (v, offset, string) => {
      for (let i = 0; i < string.length; i++) v.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  };

  const startVAD = () => {
    const check = () => {
      if (!analyserRef.current) return;

      const buffer = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buffer);

      const rms = Math.sqrt(buffer.reduce((s, x) => s + x * x, 0) / buffer.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      const hasSpeech = db > SILENCE_THRESHOLD_DB;

      const settling = Date.now() - micEnabledAtRef.current < MIC_SETTLE_MS;
      if (isMutedRef.current || isAIActiveRef.current || settling) {
        vadTimerRef.current = setTimeout(check, 80);
        return;
      }

      const now = Date.now();

      if (hasSpeech) {
        lastSpeechTimeRef.current = now;

        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          speechStartRef.current = now;
          setTranscript('');
          setResponseText('');
          pendingResponseTextRef.current = '';
          audioDataRef.current = [];
          setIsRecording(true);
        }
      } else if (isSpeakingRef.current) {
        const silenceDuration = now - lastSpeechTimeRef.current;
        const speechDuration = now - (speechStartRef.current || now);

        if (
          (silenceDuration > SILENCE_DURATION_MS && speechDuration > MIN_SPEECH_DURATION_MS) ||
          speechDuration > MAX_SPEECH_DURATION_MS
        ) {
          isSpeakingRef.current = false;
          setIsRecording(false);

          if (audioDataRef.current.length > 0) {
            const samples = mergeBuffers(audioDataRef.current);

            // Reject clips whose average energy is below the threshold —
            // Whisper hallucinates words ("Maintenance", "Context", etc.) on near-silence.
            const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
            const db = rms > 0 ? 20 * Math.log10(rms) : -100;
            if (db < MIN_AUDIO_ENERGY_DB) {
              audioDataRef.current = [];
              return;
            }

            const wavBlob = encodeWAV(samples, audioCtxRef.current.sampleRate);
            setMicEnabled(false);
            setCallStatus('transcribing');
            addLog('STT: Converting voice to text...', 'step');
            sendAudioBlob(wavBlob, 'audio/wav');
          }
          audioDataRef.current = [];
        }
      }

      vadTimerRef.current = setTimeout(check, 80);
    };

    vadTimerRef.current = setTimeout(check, 80);
  };

  const sendAudioBlob = async (blob, mimeType) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    if (!threadIdRef.current) {
      threadIdRef.current = `voice_${appointmentId || 'new'}_${Date.now()}`;
    }

    wsRef.current.send(JSON.stringify({
      type: 'audio_data',
      data: base64,
      mime_type: mimeType,
      thread_id: threadIdRef.current,
    }));
  };

  const queueAudioChunk = (base64Data) => {
    const blob = new Blob([Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    audioQueueRef.current.push(url);
    if (!isPlayingRef.current) playNextInQueue();
  };

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      // Queue fully drained — if server already signalled end-of-turn, go to listening
      if (pendingListenRef.current) {
        pendingListenRef.current = false;
        setMicEnabled(true);
        setCallStatus('listening');
        addLog('System: Ready and listening', 'info');
      }
      return;
    }
    isPlayingRef.current = true;
    const url = audioQueueRef.current.shift();
    const audio = new Audio(url);
    audioSourcesRef.current.push(audio);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      audioSourcesRef.current = audioSourcesRef.current.filter(a => a !== audio);
      playNextInQueue();
    };
    audio.play().catch(err => {
      console.error('[Audio] Play error:', err);
      playNextInQueue();
    });
  };

  const stopAllPlayback = () => {
    audioSourcesRef.current.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
    audioSourcesRef.current = [];
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    pendingListenRef.current = false;
  };

  // ─── Waveform animation ──────────────────────────────────────────────────────

  const startWaveformAnimation = () => {
    const animate = () => {
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);

        const bars = 20;
        const step = Math.floor(data.length / bars);
        const newWave = Array.from({ length: bars }, (_, i) => {
          const val = data[i * step] / 255;
          return Math.max(2, val * 48);
        });
        setWaveform(newWave);
      }
      waveformRafRef.current = requestAnimationFrame(animate);
    };
    waveformRafRef.current = requestAnimationFrame(animate);
  };

  const startDurationTimer = () => {
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  };

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  const endCall = useCallback(() => {
    clearTimeout(vadTimerRef.current);
    clearInterval(durationIntervalRef.current);
    cancelAnimationFrame(waveformRafRef.current);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (audioCtxRef.current?.state !== 'closed') {
      audioCtxRef.current?.close();
    }

    wsRef.current?.close();
    navigate(-1);
  }, [navigate]);

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    connectWS();
    return () => {
      clearTimeout(vadTimerRef.current);
      clearInterval(durationIntervalRef.current);
      cancelAnimationFrame(waveformRafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
      wsRef.current?.close();
    };
  }, [connectWS]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    if (!next) setCallStatus('listening');
    else setCallStatus('muted');
  };

  const toggleSpeaker = () => setIsSpeakerOff((v) => !v);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const isAISpeaking = callStatus === 'speaking';
  const isProcessing = callStatus === 'processing' || callStatus === 'transcribing';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 flex flex-col items-center justify-between px-6 py-10 select-none overflow-hidden">
      <div className="w-full flex justify-between items-start max-w-sm">
        <div className="text-slate-400 text-sm font-mono">{formatDuration(callDuration)}</div>
        <div className={`text-sm font-medium transition-colors duration-500 ${STATUS_COLORS[callStatus]}`}>
          {STATUS_LABELS[callStatus]}
        </div>
      </div>

      <div className="flex flex-col items-center gap-8 flex-1 justify-center w-full max-w-sm">
        <div className="relative flex items-center justify-center">
          <AnimatePresence>
            {(isRecording || isAISpeaking) && (
              <>
                <motion.div
                  key="ring1"
                  className={`absolute rounded-full border ${isAISpeaking ? 'border-indigo-400/30' : 'border-emerald-400/30'}`}
                  initial={{ width: 160, height: 160, opacity: 0.6 }}
                  animate={{ width: 240, height: 240, opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.div
                  key="ring2"
                  className={`absolute rounded-full border ${isAISpeaking ? 'border-indigo-400/20' : 'border-emerald-400/20'}`}
                  initial={{ width: 160, height: 160, opacity: 0.5 }}
                  animate={{ width: 290, height: 290, opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                />
              </>
            )}
          </AnimatePresence>

          <motion.div
            className="absolute rounded-full blur-2xl"
            animate={{
              background: isAISpeaking
                ? 'radial-gradient(circle, rgba(99,102,241,0.5), transparent)'
                : isRecording
                ? 'radial-gradient(circle, rgba(52,211,153,0.4), transparent)'
                : isProcessing
                ? 'radial-gradient(circle, rgba(168,85,247,0.4), transparent)'
                : 'radial-gradient(circle, rgba(100,116,139,0.2), transparent)',
              width: 180,
              height: 180,
            }}
            transition={{ duration: 0.6 }}
          />

          <motion.div
            className="relative w-36 h-36 rounded-full flex items-center justify-center overflow-hidden"
            animate={{
              scale: isRecording ? [1, 1.04, 1] : isAISpeaking ? [1, 1.06, 1] : 1,
              boxShadow: isAISpeaking
                ? '0 0 40px rgba(99,102,241,0.6), 0 0 80px rgba(99,102,241,0.2)'
                : isRecording
                ? '0 0 40px rgba(52,211,153,0.5), 0 0 80px rgba(52,211,153,0.15)'
                : '0 0 20px rgba(100,116,139,0.2)',
            }}
            transition={{ duration: 0.8, repeat: isRecording || isAISpeaking ? Infinity : 0, ease: 'easeInOut' }}
            style={{ background: 'linear-gradient(135deg, #312e81, #1e1b4b, #0f172a)' }}
          >
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                background: isAISpeaking
                  ? 'radial-gradient(circle at 40% 35%, rgba(129,140,248,0.35), transparent 70%)'
                  : isRecording
                  ? 'radial-gradient(circle at 40% 35%, rgba(52,211,153,0.3), transparent 70%)'
                  : 'radial-gradient(circle at 40% 35%, rgba(148,163,184,0.1), transparent 70%)',
              }}
              transition={{ duration: 0.5 }}
            />
            <span className="relative z-10 text-4xl font-bold text-white/90 tracking-tight">M</span>
          </motion.div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Medi</h1>
          <p className="text-slate-400 text-sm mt-1">Clinical Intake Assistant</p>
        </div>

        <div className="flex items-center gap-[3px] h-12">
          {waveform.map((h, i) => (
            <motion.div
              key={i}
              className="rounded-full"
              animate={{
                height: (isRecording || isAISpeaking) ? `${h}px` : '3px',
                backgroundColor: isAISpeaking ? '#818cf8' : isRecording ? '#34d399' : '#334155',
              }}
              transition={{ duration: 0.08 }}
              style={{ width: '3px', minHeight: '3px' }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {(transcript || responseText) && (
            <motion.div
              key={transcript + responseText}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-4 space-y-3"
            >
              {transcript && (
                <div>
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest">You said</p>
                  <p className="text-sm text-slate-200 leading-relaxed">{transcript}</p>
                </div>
              )}
              {responseText && (
                <div>
                  <p className="text-xs text-indigo-400/70 mb-1 uppercase tracking-widest">Medi</p>
                  <p className="text-sm text-slate-100 leading-relaxed">{responseText}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 text-purple-400 text-sm"
            >
              <Activity size={14} className="animate-pulse" />
              <span>{callStatus === 'transcribing' ? 'Understanding speech…' : 'Processing…'}</span>
            </motion.div>
          )}
        </AnimatePresence>

        
      </div>

      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between px-4">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
              isMuted ? 'bg-white/20 text-white shadow-lg' : 'bg-white/10 text-slate-300 hover:bg-white/15'
            }`}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={endCall}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-2xl shadow-red-500/40 transition-colors duration-200"
          >
            <PhoneOff size={30} className="text-white rotate-[135deg]" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
              isSpeakerOff ? 'bg-white/20 text-white shadow-lg' : 'bg-white/10 text-slate-300 hover:bg-white/15'
            }`}
          >
            {isSpeakerOff ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </motion.button>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">
          {isRecording ? 'Recording — pause to send' : isMuted ? 'Microphone muted' : 'Speak naturally'}
        </p>
      </div>
    </div>
  );
}
