import React, { useState, useEffect, useRef } from 'react';
import { generateTriviaQuestion, generateSpeech } from '../services/genai';
import { TriviaQuestion, GroundingSource, FeedbackState, Difficulty, AnalyticsEvent, HostPersonality } from '../types';
import { Play, Loader2, Award, AlertCircle, Volume2, Search, RotateCcw, Mic, Lightbulb, SkipForward, Hourglass, Pause, VolumeX } from 'lucide-react';
import { base64ToUint8Array, decodeAudioData, playThemeSound } from '../services/audioUtils';
import Visualizer from './Visualizer';

interface TriviaModeProps {
  personality: string;
  topic: string;
  difficulty: Difficulty;
  onExit: () => void;
  updateScore: (points: number) => void;
  history: string[];
  onQuestionGenerated: (questionText: string) => void;
  onFeedback: (feedback: FeedbackState) => void;
  onRecordEvent: (event: Omit<AnalyticsEvent, 'id' | 'timestamp'>) => void;
}

const TriviaMode: React.FC<TriviaModeProps> = ({ 
  personality, topic, difficulty, onExit, updateScore, history, onQuestionGenerated, onFeedback, onRecordEvent 
}) => {
  const [loading, setLoading] = useState(true);
  const [audioLoading, setAudioLoading] = useState(false);
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<string | null>(null);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  
  // Audio State
  const [volume, setVolume] = useState(1.0);
  const [isPaused, setIsPaused] = useState(false);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Derive Host Name from Personality Description
  const hostName = Object.entries(HostPersonality).find(([_, desc]) => desc === personality)?.[0].replace(/_/g, ' ') || 'HOST';

  const initAudio = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const anal = ctx.createAnalyser();
      const gain = ctx.createGain();
      
      // Increased FFT size for better resolution on the wave visualizer
      anal.fftSize = 256; 
      anal.smoothingTimeConstant = 0.85; // Smoother falloff
      
      // Connect: Gain -> Analyser -> Destination
      gain.connect(anal);
      anal.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      analyserRef.current = anal;
      gainNodeRef.current = gain;
      setAnalyser(anal);
    }
    return { 
        ctx: audioContextRef.current, 
        analyser: analyserRef.current!,
        gain: gainNodeRef.current!
    };
  };

  // Update volume when state changes
  useEffect(() => {
    if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const playClick = () => playThemeSound('ui-click');

  const playAudio = async (base64: string) => {
    try {
      if (!base64) return;
      const { ctx, gain } = initAudio();
      
      // Stop any currently playing source
      if (activeSourceRef.current) {
        try { activeSourceRef.current.stop(); } catch (e) { /* ignore */ }
      }

      // Ensure context is running (resumes if it was paused/suspended)
      if (ctx.state === 'suspended') await ctx.resume();
      setIsPaused(false);

      setAudioPlaying(true);
      const bytes = base64ToUint8Array(base64);
      const buffer = await decodeAudioData(bytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      // Connect Source -> Gain (which goes to Analyser -> Dest)
      source.connect(gain);
      
      source.onended = () => {
         // Only switch off playing if we aren't just paused/suspended manually
         // (onended fires when buffer finishes)
         setAudioPlaying(false);
         setIsPaused(false);
         activeSourceRef.current = null;
      };

      activeSourceRef.current = source;
      source.start(0);
    } catch (e) {
      console.error("Audio playback failed", e);
      setAudioPlaying(false);
    }
  };

  const stopAudio = async () => {
      if (activeSourceRef.current) {
          try { activeSourceRef.current.stop(); } catch (e) {}
          activeSourceRef.current = null;
      }
      setAudioPlaying(false);
      setIsPaused(false);
  };

  const togglePlayPause = async () => {
    if (!audioContextRef.current) return;
    playClick();

    if (audioPlaying && !isPaused) {
        // Pause
        await audioContextRef.current.suspend();
        setIsPaused(true);
    } else if (isPaused) {
        // Resume
        await audioContextRef.current.resume();
        setIsPaused(false);
    } else if (!audioPlaying && currentAudio) {
        // Replay if stopped
        playAudio(currentAudio);
    }
  };

  const loadNewQuestion = async () => {
    playClick();
    await stopAudio();
    
    // Trigger exit animation if there is an existing question
    if (question) {
        setIsExiting(true);
        // Wait for animation to complete (matching CSS duration of 400ms)
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    setLoading(true);
    setAudioLoading(false);
    setResult(null);
    setSelectedAnswer(null);
    setCurrentAudio(null);
    setHintRevealed(false);
    setPointsEarned(0);
    setIsExiting(false); // Reset exit state so next one enters correctly

    // Reset background to neutral
    onFeedback('neutral');

    try {
      const { questionData, sources: groundingSources } = await generateTriviaQuestion(topic, personality, difficulty, history);
      
      setQuestion(questionData);
      setSources(groundingSources);
      setLoading(false);
      
      onQuestionGenerated(questionData.question);

      setAudioLoading(true);
      const textToRead = `${questionData.question} 
        Option A: ${questionData.options[0]}. 
        Option B: ${questionData.options[1]}. 
        Option C: ${questionData.options[2]}. 
        Option D: ${questionData.options[3]}.`;

      const speech = await generateSpeech(textToRead, personality);
      setAudioLoading(false);

      if (speech) {
        setCurrentAudio(speech); 
        // Auto-play on load
        playAudio(speech);
      } else {
        console.warn("Speech generation skipped.");
      }

    } catch (e) {
      console.error(e);
      setLoading(false);
      setAudioLoading(false);
    }
  };

  const handleReplay = () => {
    playClick();
    if (currentAudio) {
      playAudio(currentAudio);
    }
  };

  useEffect(() => {
    loadNewQuestion();
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswer = async (index: number) => {
    if (selectedAnswer !== null || !question) return; 
    
    await stopAudio(); // Stop reading question if answering
    setSelectedAnswer(index);
    const isCorrect = index === question.correctAnswerIndex;
    const resultType = isCorrect ? 'correct' : 'incorrect';
    setResult(resultType);
    
    // Play specific result sound
    playThemeSound(resultType);
    
    // Trigger background change
    onFeedback(resultType);
    
    // Calculate points based on difficulty
    let points = 0;
    if (isCorrect) {
      points = 100;
      if (difficulty === 'Medium') points = 200;
      if (difficulty === 'Hard') points = 300;
      
      // Hint penalty (50% reduction) if hint was used
      if (hintRevealed) {
        points = Math.floor(points / 2);
      }
      
      setPointsEarned(points);
      updateScore(points);
    }

    // Record Analytics
    onRecordEvent({
      type: 'answer',
      topic: question.topic,
      result: resultType,
      scoreDelta: points,
      difficulty
    });

    const commentary = isCorrect 
      ? `Correct! ${question.explanation}` 
      : `Wrong! The answer was ${question.options[question.correctAnswerIndex]}. ${question.explanation}`;

    try {
      setAudioLoading(true);
      const speech = await generateSpeech(commentary, personality);
      setAudioLoading(false);
      if (speech) {
          setCurrentAudio(speech);
          playAudio(speech);
      }
    } catch (e) { 
        console.error(e);
        setAudioLoading(false);
    }
  };

  const handleSkip = () => {
    if (loading || audioLoading) return;
    
    // Record Skip Analytics
    if (question) {
        onRecordEvent({
          type: 'skip',
          topic: question.topic,
          result: 'skipped',
          scoreDelta: -50,
          difficulty
        });
    }

    updateScore(-50); // Penalty for skipping
    loadNewQuestion(); // Plays click sound internally
  };

  // Check if we are in an idle state (waiting for user answer)
  const isIdle = !loading && !audioLoading && !audioPlaying && selectedAnswer === null;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 font-sans">
      
      {/* Header / Host Status & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Host Control Center */}
        <div className={`flex items-center gap-2 p-1.5 pr-3 md:pr-4 rounded-full border backdrop-blur-md transition-all duration-300 w-full md:w-auto overflow-hidden shadow-lg
            ${audioPlaying ? 'bg-green-900/20 border-green-500/30' : 
              audioLoading ? 'bg-indigo-900/20 border-indigo-500/30' : 
              'bg-slate-900/60 border-slate-700/50'}`}>
            
            {/* Status Indicator */}
            <div className={`p-2 rounded-full transition-all duration-300 relative shrink-0
                ${audioPlaying ? 'bg-green-500' : audioLoading ? 'bg-indigo-500' : 'bg-slate-700'}
            `}>
                {isIdle && !audioPlaying && <div className="absolute inset-0 rounded-full bg-slate-500 animate-ping opacity-20"></div>}
                
                {audioLoading ? (
                    <Loader2 className="w-3 h-3 md:w-4 md:h-4 text-white animate-spin" />
                ) : audioPlaying ? (
                    <Mic className="w-3 h-3 md:w-4 md:h-4 text-white animate-pulse" />
                ) : isIdle ? (
                    <Hourglass className="w-3 h-3 md:w-4 md:h-4 text-slate-300" />
                ) : (
                    <Volume2 className="w-3 h-3 md:w-4 md:h-4 text-slate-400" />
                )}
            </div>
            
            {/* Status Text - Truncated on small screens */}
            <span className={`text-[10px] md:text-xs font-bold uppercase tracking-wider truncate md:w-auto
                ${audioPlaying ? 'text-green-300' : audioLoading ? 'text-indigo-300' : isIdle ? 'text-slate-300' : 'text-slate-500'}`}>
                {audioLoading ? "Generating..." : audioPlaying ? (isPaused ? "Paused" : "Speaking") : isIdle ? "Host Idle" : "Waiting"}
            </span>

            {/* Divider */}
            <div className="w-px h-4 bg-white/10 mx-1 shrink-0"></div>

            {/* Playback Controls */}
            <div className="flex items-center gap-1 shrink-0">
                <button 
                    onClick={togglePlayPause}
                    disabled={!currentAudio && !audioPlaying}
                    className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={isPaused ? "Resume" : "Pause"}
                >
                    {isPaused || (!audioPlaying && currentAudio) ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
                </button>
                
                <button 
                    onClick={handleReplay}
                    disabled={!currentAudio || audioLoading}
                    className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Replay"
                >
                    <RotateCcw size={14} />
                </button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 ml-1 pr-1 group shrink-0">
                 <button 
                    onClick={() => setVolume(v => v === 0 ? 1 : 0)} 
                    className="text-slate-500 hover:text-white transition-colors p-1"
                    title={volume === 0 ? "Unmute" : "Mute"}
                 >
                    {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                 </button>
                 <div className="w-16 md:w-20 group-hover:opacity-100 opacity-60 transition-opacity">
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={volume} 
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                    />
                 </div>
            </div>
        </div>

        {/* Right Side Info */}
        <div className="flex items-center gap-2 self-end md:self-auto">
            <div className="hidden md:block px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-cyan-900/20 border border-cyan-500/30 text-[10px] md:text-xs font-bold text-cyan-300 uppercase tracking-widest shadow-sm">
                {hostName}
            </div>
            <div className="px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-slate-800/50 border border-slate-700 text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest shadow-sm">
                {difficulty}
            </div>
            <button onClick={onExit} className="ml-2 text-slate-500 hover:text-red-400 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors">Exit</button>
        </div>
      </div>

      {/* Main Question Card - Refined Design */}
      <div className={`
          relative overflow-hidden transition-all duration-500 min-h-[500px] flex flex-col rounded-[2.5rem]
          bg-slate-900/90 backdrop-blur-3xl border border-white/5
          shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]
          ${audioPlaying ? 'border-green-500/20 shadow-[0_0_60px_-15px_rgba(34,197,94,0.1)]' : ''}
          ${isIdle ? 'animate-float' : ''} 
      `}>
        
        {/* Loading Overlay */}
        {loading && (
            <div className="absolute inset-0 z-50 bg-slate-950/90 flex flex-col items-center justify-center space-y-6 backdrop-blur-md animate-in fade-in duration-300">
                 <div className="relative">
                    <div className="absolute inset-0 bg-violet-500 blur-2xl opacity-20 animate-pulse"></div>
                    <Loader2 className="w-12 h-12 md:w-16 md:h-16 text-violet-300 animate-spin relative z-10" />
                 </div>
                 <p className="text-violet-200 animate-pulse font-bold tracking-widest uppercase text-xs md:text-sm drop-shadow-md">Initializing Next Query...</p>
            </div>
        )}

        {/* Content */}
        <div className="p-8 md:p-12 pb-24 md:pb-32 flex-1 relative z-10 flex flex-col">
            {question && (
                <div className={`${isExiting ? 'animate-exit' : 'animate-enter'} h-full flex flex-col`}>
                    <div className="flex justify-between items-start mb-8">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-[10px] md:text-xs font-bold text-slate-300 uppercase tracking-widest shadow-lg max-w-[200px] truncate">
                         {question.topic}
                        </span>

                        <div className="flex gap-3 items-center">
                            {/* Skip Button */}
                            {selectedAnswer === null && (
                                <button 
                                    onClick={handleSkip}
                                    disabled={loading || audioLoading}
                                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-[10px] md:text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-transparent hover:bg-slate-800 hover:border-slate-700"
                                    title="Skip (-50 PTS)"
                                >
                                    <SkipForward size={14} />
                                    Skip
                                </button>
                            )}

                            {/* Hint Button */}
                            {!hintRevealed && selectedAnswer === null && (
                                <button 
                                    onClick={() => { playClick(); setHintRevealed(true); }}
                                    className="flex items-center gap-1.5 text-yellow-500 hover:text-yellow-300 transition-colors text-[10px] md:text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 hover:bg-yellow-500/20"
                                >
                                    <Lightbulb size={14} />
                                    Hint
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Question Text - Readable & Impactful */}
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight tracking-normal mb-10 max-w-5xl drop-shadow-md">
                        {question.question}
                    </h2>

                    {/* Hint Display */}
                    {hintRevealed && (
                        <div className="mb-8 p-5 rounded-2xl bg-yellow-950/30 border border-yellow-500/20 flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
                            <Lightbulb className="text-yellow-500 shrink-0 mt-1" size={20} />
                            <div>
                                <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-1.5">Hint</p>
                                <p className="text-yellow-100/90 text-base leading-relaxed font-medium">{question.hint}</p>
                            </div>
                        </div>
                    )}

                    {/* Options Grid - Clean Cards */}
                    <div className="grid grid-cols-1 gap-4 md:gap-5 md:grid-cols-2 mt-auto">
                    {question.options.map((option, idx) => (
                        <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        disabled={selectedAnswer !== null}
                        className={`p-5 md:p-6 text-left rounded-2xl border-2 transition-all duration-200 relative group overflow-hidden shadow-md
                            ${selectedAnswer === null 
                            ? 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-700 text-slate-200 hover:text-white hover:scale-[1.01]' 
                            : ''}
                            ${selectedAnswer === idx && result === 'correct' ? 'border-green-500 bg-green-500/20 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] scale-[1.01]' : ''}
                            ${selectedAnswer === idx && result === 'incorrect' ? 'border-red-500 bg-red-500/20 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] scale-[1.01]' : ''}
                            ${selectedAnswer !== null && idx === question.correctAnswerIndex && result === 'incorrect' ? 'border-green-500 bg-green-500/20 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)]' : ''}
                            ${selectedAnswer !== null && selectedAnswer !== idx && idx !== question.correctAnswerIndex ? 'opacity-40 border-transparent bg-slate-900/30 grayscale' : ''}
                        `}
                        >
                          <div className="flex items-center gap-5 relative z-10">
                              <span className={`flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-xl text-sm md:text-base font-bold transition-colors border shadow-sm
                                  ${selectedAnswer === idx 
                                    ? 'border-transparent bg-white text-slate-950' 
                                    : 'border-slate-700 bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white group-hover:border-slate-600'}
                                  ${selectedAnswer !== null && idx === question.correctAnswerIndex && result === 'incorrect' ? 'border-transparent bg-white text-green-700' : ''}
                              `}>
                                  {['A', 'B', 'C', 'D'][idx]}
                              </span>
                              <span className="flex-1 text-lg md:text-xl font-semibold leading-normal">{option}</span>
                          </div>
                        </button>
                    ))}
                    </div>
                </div>
            )}
        </div>

        {/* Visualizer Footer */}
        <div className="absolute bottom-0 left-0 right-0 h-40 md:h-48 z-0 pointer-events-none flex items-center justify-center overflow-hidden rounded-b-[2.5rem]">
             <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent z-10" />
             <div className="w-full h-full opacity-30 mix-blend-screen">
               <Visualizer 
                  analyser={analyser} 
                  isActive={audioPlaying && !isPaused} 
                  color={result === 'correct' ? '#4ade80' : result === 'incorrect' ? '#f87171' : '#c084fc'} 
               />
             </div>
        </div>
      </div>

      {/* Results & Actions */}
      {!loading && selectedAnswer !== null && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={`p-6 md:p-8 rounded-3xl border backdrop-blur-xl relative overflow-hidden shadow-2xl ${result === 'correct' ? 'bg-green-950/60 border-green-500/40' : 'bg-red-950/60 border-red-500/40'}`}>
                {/* Glow effect behind result */}
                <div className={`absolute top-0 left-0 w-40 h-40 blur-[80px] rounded-full -translate-x-1/2 -translate-y-1/2 ${result === 'correct' ? 'bg-green-500/40' : 'bg-red-500/40'}`}></div>
                
                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
                    <div className={`p-5 rounded-full border-2 shadow-lg ${result === 'correct' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400'}`}>
                        {result === 'correct' ? <Award className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
                    </div>
                    <div>
                        <h3 className={`text-3xl font-black mb-3 uppercase italic ${result === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
                            {result === 'correct' ? "Outstanding!" : "Incorrect"}
                        </h3>
                        {question && <p className="text-white/90 text-lg md:text-xl leading-relaxed font-medium">{question.explanation}</p>}
                        
                        {result === 'correct' && (
                          <p className="mt-4 text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-3 md:justify-start justify-center">
                            <span className="text-green-400">+{pointsEarned} Points</span>
                            {hintRevealed && (
                                <span className="text-yellow-500 text-xs bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/30">
                                    Hint Used (-50%)
                                </span>
                            )}
                          </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-center">
                <button 
                    onClick={loadNewQuestion}
                    disabled={audioPlaying || audioLoading}
                    className={`group relative px-12 py-5 rounded-full font-black text-white shadow-2xl transition-all duration-300 overflow-hidden min-w-[280px]
                        ${(audioPlaying || audioLoading)
                            ? 'bg-slate-800 opacity-50 cursor-not-allowed' 
                            : 'bg-white hover:scale-105 active:scale-95'}
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-[length:200%_auto] animate-[gradient_3s_linear_infinite] group-hover:opacity-90"></div>
                    <div className="relative flex items-center justify-center gap-3">
                      {audioPlaying || audioLoading ? (
                        <>
                          <Loader2 className="animate-spin" size={24} />
                          <span className="uppercase tracking-widest text-sm">Processing</span>
                        </>
                      ) : (
                        <>
                          <span className="uppercase tracking-widest text-sm">Next Challenge</span>
                          <Play size={24} fill="currentColor" />
                        </>
                      )}
                    </div>
                </button>
            </div>
        </div>
      )}

      {/* Search Grounding Sources */}
      {!loading && sources.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 opacity-70 hover:opacity-100 transition-opacity">
            {sources.map((source, i) => (
                <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] bg-slate-900 text-slate-400 hover:text-green-300 px-4 py-2 rounded-lg border border-slate-700 transition-colors flex items-center gap-2 uppercase tracking-wide font-bold shadow-sm"
                >
                    <Search size={12} />
                    {source.title.length > 25 ? source.title.substring(0, 25) + '...' : source.title}
                </a>
            ))}
        </div>
      )}
    </div>
  );
};

export default TriviaMode;