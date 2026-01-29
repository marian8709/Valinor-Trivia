import React, { useState, useEffect, useRef } from 'react';
import { generateTriviaQuestion, generateSpeech } from '../services/genai';
import { TriviaQuestion, GroundingSource, FeedbackState, Difficulty, AnalyticsEvent } from '../types';
import { Play, Loader2, Award, AlertCircle, Volume2, Search, RotateCcw, Mic, Sparkles, Lightbulb, SkipForward } from 'lucide-react';
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
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const anal = ctx.createAnalyser();
      anal.fftSize = 128; 
      anal.smoothingTimeConstant = 0.8;
      
      audioContextRef.current = ctx;
      analyserRef.current = anal;
      setAnalyser(anal);
    }
    return { ctx: audioContextRef.current, analyser: analyserRef.current! };
  };

  const playClick = () => playThemeSound('ui-click');

  const playAudio = async (base64: string) => {
    try {
      if (!base64) return;
      const { ctx, analyser } = initAudio();
      if (ctx.state === 'suspended') await ctx.resume();

      setAudioPlaying(true);
      const bytes = base64ToUint8Array(base64);
      const buffer = await decodeAudioData(bytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      source.connect(analyser);
      analyser.connect(ctx.destination);
      
      source.onended = () => setAudioPlaying(false);
      source.start(0);
    } catch (e) {
      console.error("Audio playback failed", e);
      setAudioPlaying(false);
    }
  };

  const stopAudio = async () => {
      if (audioContextRef.current && audioContextRef.current.state === 'running') {
          try {
             await audioContextRef.current.suspend();
          } catch (e) {
             console.warn("Could not suspend audio context", e);
          }
      }
      setAudioPlaying(false);
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
        if (audioContextRef.current?.state === 'suspended') {
            await audioContextRef.current.resume();
        }
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
    if (currentAudio && !audioPlaying) {
      if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
      }
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
      if (speech) playAudio(speech);
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

  return (
    <div className="max-w-4xl mx-auto w-full space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* Header / Host Status */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 md:gap-3 p-1 pr-3 md:pr-4 rounded-full border backdrop-blur-md transition-all duration-300 
            ${audioPlaying ? 'bg-green-900/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 
              audioLoading ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-900/50 border-slate-700/50'}`}>
            
            <div className={`p-1.5 md:p-2 rounded-full transition-all duration-300 
                ${audioPlaying ? 'bg-green-500' : audioLoading ? 'bg-indigo-500' : 'bg-slate-800'}`}>
                {audioLoading ? (
                    <Loader2 className="w-3 h-3 md:w-4 md:h-4 text-white animate-spin" />
                ) : audioPlaying ? (
                    <Mic className="w-3 h-3 md:w-4 md:h-4 text-white animate-pulse" />
                ) : (
                    <Volume2 className="w-3 h-3 md:w-4 md:h-4 text-slate-400" />
                )}
            </div>
            
            <span className={`text-[10px] md:text-xs font-bold uppercase tracking-wider hidden md:inline 
                ${audioPlaying ? 'text-green-300' : audioLoading ? 'text-indigo-300' : 'text-slate-500'}`}>
                {audioLoading ? "Generating Voice..." : audioPlaying ? "Host Speaking" : "Host Idle"}
            </span>
        </div>

        <div className="px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-slate-800/50 border border-slate-700 text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">
            {difficulty}
        </div>
        
        <div className="flex gap-2 md:gap-4">
            <button 
                onClick={handleReplay}
                disabled={!currentAudio || audioPlaying || loading || audioLoading}
                className="flex items-center gap-2 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
            >
                <RotateCcw size={16} />
            </button>
            <button onClick={onExit} className="text-slate-500 hover:text-red-400 text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors">Exit</button>
        </div>
      </div>

      {/* Main Question Card */}
      {/* Liquid Glass Effect: High blur, high transparency, subtle gradient border, inner glow */}
      <div className={`
          relative overflow-hidden transition-all duration-500 min-h-[400px] md:min-h-[450px] flex flex-col rounded-3xl
          bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-3xl border border-white/20
          shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]
          before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/10 before:via-transparent before:to-transparent before:pointer-events-none
          after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)] after:pointer-events-none
          ${audioPlaying ? 'border-green-500/40 shadow-[0_0_50px_-10px_rgba(34,197,94,0.3)]' : ''}
      `}>
        
        {/* Loading Overlay */}
        {loading && (
            <div className="absolute inset-0 z-50 bg-slate-950/40 flex flex-col items-center justify-center space-y-6 backdrop-blur-xl animate-in fade-in duration-300">
                 <div className="relative">
                    <div className="absolute inset-0 bg-violet-500 blur-xl opacity-20 animate-pulse"></div>
                    <Loader2 className="w-12 h-12 md:w-16 md:h-16 text-violet-300 animate-spin relative z-10" />
                 </div>
                 <p className="text-violet-200 animate-pulse font-bold tracking-widest uppercase text-xs md:text-sm drop-shadow-md">Initializing Next Query...</p>
            </div>
        )}

        {/* Content */}
        <div className="p-6 md:p-12 pb-24 md:pb-32 flex-1 relative z-10">
            {question && (
                <div className={`${isExiting ? 'animate-exit' : 'animate-enter'}`}>
                    <div className="flex justify-between items-start mb-4 md:mb-6">
                        <span className="inline-block px-2 py-1 md:px-3 rounded-md bg-white/10 border border-white/10 text-[9px] md:text-[10px] font-bold text-slate-300 uppercase tracking-widest backdrop-blur-sm shadow-inner max-w-[150px] truncate">
                         {question.topic}
                        </span>

                        <div className="flex gap-2 items-center">
                            {/* Skip Button */}
                            {selectedAnswer === null && (
                                <button 
                                    onClick={handleSkip}
                                    disabled={loading || audioLoading}
                                    className="flex items-center gap-1 md:gap-2 text-slate-400 hover:text-red-300 transition-colors text-[10px] md:text-xs font-bold uppercase tracking-widest px-2 py-1 md:px-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-red-500/30"
                                    title="Skip (-50 PTS)"
                                >
                                    <SkipForward size={12} />
                                    Skip
                                </button>
                            )}

                            {/* Hint Button */}
                            {!hintRevealed && selectedAnswer === null && (
                                <button 
                                    onClick={() => { playClick(); setHintRevealed(true); }}
                                    className="flex items-center gap-1 md:gap-2 text-yellow-400/90 hover:text-yellow-200 transition-colors text-[10px] md:text-xs font-bold uppercase tracking-widest px-2 py-1 md:px-3 rounded-full border border-yellow-500/20 bg-yellow-500/10 hover:bg-yellow-500/20"
                                >
                                    <Lightbulb size={12} />
                                    Hint
                                </button>
                            )}
                        </div>
                    </div>

                    <h2 className="text-xl md:text-4xl font-black text-white leading-tight drop-shadow-xl tracking-tight mb-6 md:mb-8">
                        {question.question}
                    </h2>

                    {/* Hint Display */}
                    {hintRevealed && (
                        <div className="mb-6 md:mb-8 p-3 md:p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 backdrop-blur-md">
                            <Lightbulb className="text-yellow-400 shrink-0 mt-0.5" size={16} />
                            <div>
                                <p className="text-xs md:text-sm font-bold text-yellow-400 uppercase tracking-widest mb-1">Hint</p>
                                <p className="text-yellow-100 text-xs md:text-sm leading-relaxed">{question.hint}</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-2">
                    {question.options.map((option, idx) => (
                        <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        disabled={selectedAnswer !== null}
                        className={`p-4 md:p-5 text-left rounded-2xl border transition-all duration-300 font-medium relative group overflow-hidden
                            ${selectedAnswer === null 
                            ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-slate-200 hover:text-white hover:scale-[1.01] backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]' 
                            : ''}
                            ${selectedAnswer === idx && result === 'correct' ? 'border-green-400/50 bg-green-500/30 text-green-50 backdrop-blur-xl shadow-[0_0_30px_rgba(74,222,128,0.3)]' : ''}
                            ${selectedAnswer === idx && result === 'incorrect' ? 'border-red-400/50 bg-red-500/30 text-red-50 backdrop-blur-xl shadow-[0_0_30px_rgba(248,113,113,0.3)]' : ''}
                            ${selectedAnswer !== null && idx === question.correctAnswerIndex && result === 'incorrect' ? 'border-green-400/50 bg-green-500/30 text-green-50 backdrop-blur-xl' : ''}
                            ${selectedAnswer !== null && selectedAnswer !== idx && idx !== question.correctAnswerIndex ? 'opacity-30 border-transparent grayscale scale-95' : ''}
                        `}
                        >
                          <div className="flex items-center gap-3 md:gap-4 relative z-10">
                              <span className={`flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg text-xs md:text-sm font-black transition-colors border
                                  ${selectedAnswer === idx 
                                    ? 'border-current bg-current text-slate-950' 
                                    : 'border-white/10 bg-white/10 text-slate-300 group-hover:border-white/40 group-hover:text-white group-hover:bg-white/20'}
                              `}>
                                  {['A', 'B', 'C', 'D'][idx]}
                              </span>
                              <span className="flex-1 text-sm md:text-lg drop-shadow-md leading-snug">{option}</span>
                          </div>
                        </button>
                    ))}
                    </div>
                </div>
            )}
        </div>

        {/* Visualizer Footer - Adjusted specifically for the liquid card */}
        <div className="absolute bottom-0 left-0 right-0 h-32 md:h-40 z-0 pointer-events-none flex items-center justify-center overflow-hidden rounded-b-3xl">
             {/* Fade out visualizer at the bottom of the card */}
             <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent z-10" />
             <div className="w-full h-full opacity-60 mix-blend-overlay">
               <Visualizer 
                  analyser={analyser} 
                  isActive={audioPlaying} 
                  color={result === 'correct' ? '#86efac' : result === 'incorrect' ? '#fca5a5' : '#c4b5fd'} 
               />
             </div>
        </div>
      </div>

      {/* Results & Actions */}
      {!loading && selectedAnswer !== null && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={`p-6 rounded-2xl border backdrop-blur-xl relative overflow-hidden shadow-2xl ${result === 'correct' ? 'bg-green-950/40 border-green-500/30' : 'bg-red-950/40 border-red-500/30'}`}>
                {/* Glow effect behind result */}
                <div className={`absolute top-0 left-0 w-32 h-32 blur-[60px] rounded-full -translate-x-1/2 -translate-y-1/2 ${result === 'correct' ? 'bg-green-500/30' : 'bg-red-500/30'}`}></div>
                
                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
                    <div className={`p-4 rounded-full border-2 ${result === 'correct' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400'}`}>
                        {result === 'correct' ? <Award className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
                    </div>
                    <div>
                        <h3 className={`text-2xl font-black mb-2 uppercase italic ${result === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
                            {result === 'correct' ? "Outstanding!" : "Incorrect"}
                        </h3>
                        {question && <p className="text-slate-200 text-base md:text-lg leading-relaxed drop-shadow-md">{question.explanation}</p>}
                        
                        {result === 'correct' && (
                          <p className="mt-2 text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 md:justify-start justify-center">
                            <span>+{pointsEarned} Points</span>
                            {hintRevealed && (
                                <span className="text-yellow-500 text-xs bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/30">
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
                    className={`group relative px-10 py-3 md:px-12 md:py-4 rounded-full font-black text-white shadow-2xl transition-all duration-300 overflow-hidden
                        ${(audioPlaying || audioLoading)
                            ? 'bg-slate-800 opacity-50 cursor-not-allowed' 
                            : 'bg-white hover:scale-105 active:scale-95'}
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-[length:200%_auto] animate-[gradient_3s_linear_infinite] group-hover:opacity-90"></div>
                    <div className="relative flex items-center gap-3">
                      {audioPlaying || audioLoading ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span className="uppercase tracking-widest text-xs md:text-sm">Processing</span>
                        </>
                      ) : (
                        <>
                          <span className="uppercase tracking-widest text-xs md:text-sm">Next Challenge</span>
                          <Play size={20} fill="currentColor" />
                        </>
                      )}
                    </div>
                </button>
            </div>
        </div>
      )}

      {/* Search Grounding Sources */}
      {!loading && sources.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
            {sources.map((source, i) => (
                <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[9px] md:text-[10px] bg-white/10 text-slate-400 hover:text-green-300 px-3 py-1.5 rounded-full border border-white/10 transition-colors flex items-center gap-2 uppercase tracking-wide font-bold backdrop-blur-sm"
                >
                    <Search size={10} />
                    {source.title.length > 20 ? source.title.substring(0, 20) + '...' : source.title}
                </a>
            ))}
        </div>
      )}
    </div>
  );
};

export default TriviaMode;