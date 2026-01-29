import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Mic, MicOff, PhoneOff, Activity, Volume2, Radio } from 'lucide-react';
import Visualizer from './Visualizer';
import { createPCM16Blob, decodeAudioData, playThemeSound } from '../services/audioUtils';
import { AnalyticsEvent } from '../types';

interface LiveModeProps {
  personality: string;
  onClose: () => void;
  onRecordEvent: (event: Omit<AnalyticsEvent, 'id' | 'timestamp'>) => void;
}

const LiveMode: React.FC<LiveModeProps> = ({ personality, onClose, onRecordEvent }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // To hold the active session
  
  // Analytics Refs
  const startTimeRef = useRef<number>(Date.now());

  const playClick = () => playThemeSound('ui-click');

  // Connect to Live API
  const connect = useCallback(async () => {
    try {
      setError(null);
      startTimeRef.current = Date.now();
      
      // Initialize Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // Analysers
      inputAnalyserRef.current = inputAudioContextRef.current.createAnalyser();
      outputAnalyserRef.current = outputAudioContextRef.current.createAnalyser();
      inputAnalyserRef.current.fftSize = 256;
      outputAnalyserRef.current.fftSize = 256;

      // Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: `You are a trivia host with this personality: ${personality}. 
          Keep the conversation fun, lighthearted, and focused on trivia or random facts. 
          Be concise.`,
        },
      };

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            console.log("Live Session Connected");
            setIsConnected(true);

            // Setup Input Processing
            if (!inputAudioContextRef.current || !streamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            source.connect(inputAnalyserRef.current!); // Connect to analyser
            inputAnalyserRef.current!.connect(processor); // Connect analyser to processor
            processor.connect(inputAudioContextRef.current.destination);

            processor.onaudioprocess = (e) => {
              if (!isMicOn) return; // Mute logic
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPCM16Blob(inputData);
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
               const ctx = outputAudioContextRef.current;
               const bytes = new Uint8Array(atob(audioData).split('').map(c => c.charCodeAt(0)));
               
               const audioBuffer = await decodeAudioData(bytes, ctx, 24000, 1);
               
               const source = ctx.createBufferSource();
               source.buffer = audioBuffer;
               
               // Connect to analyser then destination
               source.connect(outputAnalyserRef.current!);
               outputAnalyserRef.current!.connect(ctx.destination);

               // Scheduling
               const currentTime = ctx.currentTime;
               if (nextStartTimeRef.current < currentTime) {
                 nextStartTimeRef.current = currentTime;
               }
               
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
            }
          },
          onclose: () => {
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Live API Error", err);
            setError("Connection error. Please try again.");
            setIsConnected(false);
          }
        }
      });
      
      // Keep track of session promise if needed, but callbacks handle the logic
      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect");
    }
  }, [personality, isMicOn]);

  const disconnect = () => {
    // Record Session Analytics
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    onRecordEvent({
      type: 'session_end',
      mode: 'live',
      duration: duration
    });

    // Stop tracks
    streamRef.current?.getTracks().forEach(track => track.stop());
    
    // Close Audio Contexts safely
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    
    // Disconnect script processor
    processorRef.current?.disconnect();
    
    // Attempt to close session if accessible
    if (sessionRef.current) {
        sessionRef.current.then((s: any) => s.close && s.close());
    }

    setIsConnected(false);
    onClose();
  };

  useEffect(() => {
    connect();
    return () => {
      // Cleanup on unmount
      streamRef.current?.getTracks().forEach(track => track.stop());
      
      if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
         inputAudioContextRef.current.close();
      }
      if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
         outputAudioContextRef.current.close();
      }
      
      processorRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] animate-in fade-in zoom-in duration-300 relative">
      
      {/* Header Info */}
      <div className="text-center space-y-1 md:space-y-2 mb-4 md:mb-8 shrink-0">
        <h2 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500">
          Live Channel
        </h2>
        <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-slate-400">
            <Radio size={14} className={isConnected ? "text-red-500 animate-pulse" : "text-slate-600"} />
            <span>On Air with: <span className="text-white font-bold">{personality}</span></span>
        </div>
      </div>

      {/* Visualizers Container - Flexible Height */}
      <div className="flex-1 w-full max-w-lg mx-auto flex flex-col gap-4 min-h-0 mb-6">
        
        {/* Host Audio Block */}
        <div className="flex-1 bg-slate-800/40 p-4 md:p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Volume2 size={12} /> Host Audio
                </label>
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950/30 rounded-xl overflow-hidden border border-slate-800/50">
                <Visualizer analyser={outputAnalyserRef.current} isActive={true} color="#a855f7" />
            </div>
        </div>
        
        {/* User Audio Block */}
        <div className="flex-1 bg-slate-800/40 p-4 md:p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mic size={12} /> Input Signal
                </label>
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isMicOn ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
             <div className="flex-1 min-h-0 bg-slate-950/30 rounded-xl overflow-hidden border border-slate-800/50 relative">
                <Visualizer analyser={inputAnalyserRef.current} isActive={isMicOn} color="#22c55e" />
                {!isMicOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                        <MicOff className="text-slate-500" size={24} />
                    </div>
                )}
            </div>
        </div>

      </div>

      {/* Control Bar - Fixed at bottom of container */}
      <div className="shrink-0 flex flex-col items-center gap-4 md:gap-6 pb-4">
        
        {error && (
            <div className="text-red-400 text-xs md:text-sm bg-red-950/80 px-4 py-2 rounded-lg border border-red-900/50 backdrop-blur-md animate-in slide-in-from-bottom-2">
            {error}
            </div>
        )}

        <div className="flex items-center gap-4 md:gap-8 w-full justify-center">
            <button 
            onClick={() => { playClick(); setIsMicOn(!isMicOn); }}
            className={`p-4 md:p-5 rounded-full transition-all duration-200 shadow-xl active:scale-95 ${
                isMicOn 
                ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600' 
                : 'bg-red-500/20 text-red-400 border border-red-500/50'
            }`}
            title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
            >
            {isMicOn ? <Mic size={24} className="md:w-8 md:h-8" /> : <MicOff size={24} className="md:w-8 md:h-8" />}
            </button>

            <button 
            onClick={() => { playClick(); disconnect(); }}
            className="flex-1 max-w-[200px] h-14 md:h-16 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold shadow-lg shadow-red-900/40 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-wide text-sm md:text-base"
            >
            <PhoneOff size={20} className="md:w-6 md:h-6" />
            End Call
            </button>
        </div>
        
        <div className="flex items-center gap-2 text-slate-500 text-[10px] md:text-xs font-mono">
            <Activity size={12} className={isConnected ? "text-green-500" : "text-slate-600"} />
            {isConnected ? "SECURE CONNECTION ESTABLISHED" : "ESTABLISHING UPLINK..."}
        </div>
      </div>

    </div>
  );
};

export default LiveMode;