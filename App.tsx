import React, { useState, useEffect } from 'react';
import { AppState, HostPersonality, FeedbackState, Difficulty, AnalyticsEvent } from './types';
import { 
  Mic, Sparkles, MessageCircle, 
  Bot, Zap, Skull, HelpCircle, GraduationCap, Wand2, Crown, 
  ChevronLeft, Play, Atom, BarChart3, LineChart, Settings2, Download, X
} from 'lucide-react';
import TriviaMode from './components/TriviaMode';
import LiveMode from './components/LiveMode';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import InteractiveBackground from './components/InteractiveBackground';
import { playThemeSound, ThemeSound } from './services/audioUtils';

// --- Assets & Data Mapping ---

// Map personalities to visual themes and Audio Stings
const HOST_THEMES: Record<string, { icon: React.ElementType, color: string, gradient: string, sound: ThemeSound }> = {
  [HostPersonality.SARCASTIC]: { 
    icon: Bot, 
    color: "text-pink-400", 
    gradient: "from-pink-500/20 to-rose-500/5",
    sound: 'glitch'
  },
  [HostPersonality.EXCITED]: { 
    icon: Zap, 
    color: "text-yellow-400", 
    gradient: "from-yellow-500/20 to-orange-500/5",
    sound: 'level-up'
  },
  [HostPersonality.PIRATE]: { 
    icon: Skull, 
    color: "text-amber-600", 
    gradient: "from-amber-600/20 to-red-900/10",
    sound: 'foghorn'
  },
  [HostPersonality.MYSTERIOUS]: { 
    icon: HelpCircle, 
    color: "text-violet-400", 
    gradient: "from-violet-600/20 to-indigo-900/10",
    sound: 'mysterious'
  },
  [HostPersonality.PROFESSOR]: { 
    icon: GraduationCap, 
    color: "text-blue-400", 
    gradient: "from-blue-500/20 to-cyan-500/5",
    sound: 'notification'
  },
  [HostPersonality.HARRY_POTTER]: { 
    icon: Wand2, 
    color: "text-emerald-400", 
    gradient: "from-emerald-600/20 to-slate-800/50",
    sound: 'magic'
  },
  [HostPersonality.LORD_OF_THE_RINGS]: { 
    icon: Crown, 
    color: "text-amber-300", 
    gradient: "from-amber-400/20 to-yellow-900/20",
    sound: 'epic'
  }
};

// Map personalities to Background Nebula Colors (3 hex codes for the blobs)
const HOST_PALETTES: Record<string, string[]> = {
  [HostPersonality.SARCASTIC]: ['#be185d', '#831843', '#500724'], // Pinks/Rose
  [HostPersonality.EXCITED]: ['#eab308', '#a16207', '#422006'], // Yellow/Orange
  [HostPersonality.PIRATE]: ['#991b1b', '#7f1d1d', '#450a0a'], // Red/Deep Amber
  [HostPersonality.MYSTERIOUS]: ['#4338ca', '#312e81', '#1e1b4b'], // Indigo/Violet (Default)
  [HostPersonality.PROFESSOR]: ['#2563eb', '#1e40af', '#172554'], // Blue/Dark Blue
  [HostPersonality.HARRY_POTTER]: ['#059669', '#065f46', '#022c22'], // Emerald/Dark Green
  [HostPersonality.LORD_OF_THE_RINGS]: ['#d97706', '#92400e', '#451a03'], // Gold/Bronze/Brown
};

const ValinorLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]">
    <rect x="2" y="2" width="8" height="8" rx="2" className="fill-green-400" />
    <rect x="14" y="2" width="8" height="8" rx="2" className="fill-green-500" />
    <rect x="8" y="14" width="8" height="8" rx="2" className="fill-green-600" />
  </svg>
);

const App: React.FC = () => {
  // Initialize state from LocalStorage if available
  const [state, setState] = useState<AppState>(() => {
    try {
        const saved = localStorage.getItem('valinor_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...parsed, screen: parsed.screen === 'trivia' || parsed.screen === 'live' ? 'menu' : parsed.screen };
        }
    } catch (e) {
        console.error("Failed to load state", e);
    }
    
    return {
      screen: 'setup',
      personality: HostPersonality.EXCITED,
      topic: 'General Knowledge',
      difficulty: 'Medium',
      score: 0,
      history: [],
      analytics: []
    };
  });

  const [bgFeedback, setBgFeedback] = useState<FeedbackState>('neutral');
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('valinor_v1', JSON.stringify(state));
  }, [state]);

  // Handle PWA Install Prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    playClick();
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const personalities = Object.entries(HostPersonality);
  const playClick = () => playThemeSound('ui-click');

  const recordAnalytics = (event: Omit<AnalyticsEvent, 'id' | 'timestamp'>) => {
    setState(prev => ({
      ...prev,
      analytics: [
        ...prev.analytics, 
        { ...event, id: crypto.randomUUID(), timestamp: Date.now() }
      ]
    }));
  };

  const clearData = () => {
    if (window.confirm("Are you sure you want to clear all history, score, and analytics?")) {
        playClick();
        setState(prev => ({ ...prev, score: 0, history: [], analytics: [] }));
    }
  };

  const startTrivia = () => {
    playClick();
    recordAnalytics({ type: 'session_start', mode: 'trivia' });
    setState(prev => ({ ...prev, screen: 'trivia' }));
  };
  
  const startLive = () => {
    playClick();
    recordAnalytics({ type: 'session_start', mode: 'live' });
    setState(prev => ({ ...prev, screen: 'live' }));
  };

  const showStats = () => {
    playClick();
    setState(prev => ({ ...prev, screen: 'stats' }));
  };

  const goHome = () => {
    playClick();
    setState(prev => ({ ...prev, screen: 'menu' }));
    setBgFeedback('neutral');
  };

  const goToStart = () => {
    playClick();
    setState(prev => ({ ...prev, screen: 'setup' }));
    setBgFeedback('neutral');
  };

  const handleTriviaFeedback = (feedback: FeedbackState) => {
    setBgFeedback(feedback);
    if (feedback !== 'neutral') {
      setTimeout(() => setBgFeedback('neutral'), 2500);
    }
  };

  const selectHost = (desc: string) => {
    const theme = HOST_THEMES[desc];
    if (theme && theme.sound) playThemeSound(theme.sound);
    setState(prev => ({ ...prev, personality: desc, screen: 'menu' }));
  };

  const currentPalette = HOST_PALETTES[state.personality] || HOST_PALETTES[HostPersonality.MYSTERIOUS];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-green-500/30 overflow-x-hidden relative flex flex-col">
      
      {/* Dynamic Canvas Background */}
      <div className="fixed inset-0 z-0">
          <InteractiveBackground state={bgFeedback} palette={currentPalette} />
          <div className="absolute inset-0 bg-radial-gradient from-transparent via-slate-950/50 to-slate-950/90 pointer-events-none" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-4 flex flex-col flex-1 max-w-6xl">
        
        {/* Navbar */}
        <header className="flex items-center justify-between mb-6 py-3 px-4 md:py-4 md:px-6 bg-slate-900/40 backdrop-blur-md border border-slate-800/50 rounded-2xl shadow-lg">
          <button onClick={goToStart} className="flex items-center gap-2 md:gap-3 group">
            <div className="p-1.5 md:p-2 bg-slate-950 rounded-lg border border-slate-800 shadow-inner group-hover:border-green-500/50 transition-colors">
              <ValinorLogo />
            </div>
            <h1 className="text-lg md:text-2xl font-black tracking-[0.2em] animate-logo-breath font-mono uppercase select-none">
              Valinor
            </h1>
          </button>
          
          <div className="flex items-center gap-2 md:gap-4 bg-slate-950/60 px-3 py-1.5 md:px-5 md:py-2 rounded-xl border border-slate-800/50 shadow-inner">
            <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest hidden md:inline">Score</span>
            <span className="text-lg md:text-2xl font-mono font-bold text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]">
              {state.score.toLocaleString()}
            </span>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col w-full">
            
          {state.screen === 'setup' && (
             <div className="flex flex-col items-center justify-center py-6 md:py-10 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center space-y-3 mb-8 md:mb-12">
                  <span className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[10px] md:text-xs font-medium text-green-400 uppercase tracking-wider shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                    Game Setup
                  </span>
                  <h2 className="text-3xl md:text-6xl font-black text-white tracking-tight drop-shadow-lg">
                    SELECT <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">HOST</span>
                  </h2>
                  <p className="text-sm md:text-lg text-slate-400 max-w-xl mx-auto px-4">
                    Choose the AI personality that will guide you.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                  {personalities.map(([key, desc], index) => {
                    const theme = HOST_THEMES[desc] || { icon: Bot, color: "text-slate-400", gradient: "from-slate-800 to-slate-900" };
                    const Icon = theme.icon;
                    const isSelected = state.personality === desc;

                    return (
                      <button
                        key={key}
                        onClick={() => selectHost(desc)}
                        style={{ animationDelay: `${index * 75}ms` }}
                        className={`group relative overflow-hidden rounded-2xl p-1 transition-all duration-500 ease-out h-full
                          animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards
                          hover:-translate-y-1 md:hover:-translate-y-2 hover:scale-[1.01]
                          ${isSelected 
                            ? 'ring-2 ring-green-500 shadow-[0_0_30px_rgba(34,197,94,0.4)] scale-[1.02]' 
                            : 'hover:ring-1 hover:ring-slate-500/50 hover:shadow-2xl'}
                        `}
                      >
                        <div className={`absolute inset-0 bg-slate-900 border border-slate-800 rounded-2xl transition-colors duration-500 group-hover:bg-slate-800/60`}></div>
                        <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                        
                        <Icon className={`absolute -right-8 -bottom-8 w-32 h-32 md:w-40 md:h-40 opacity-5 group-hover:opacity-10 transition-all duration-700 ease-out -rotate-12 group-hover:rotate-0 group-hover:scale-110 ${theme.color}`} />

                        <div className="relative z-10 p-5 md:p-6 flex flex-col h-full text-left">
                          <div className="flex items-center gap-4 mb-4">
                              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shadow-lg`}>
                                <Icon className={`w-6 h-6 md:w-7 md:h-7 ${theme.color}`} />
                              </div>
                              <h3 className="text-lg md:text-xl font-bold text-white tracking-wide group-hover:text-green-300 capitalize transition-colors">
                                {key.toLowerCase().replace(/_/g, ' ')}
                              </h3>
                          </div>
                          
                          <p className="text-xs md:text-sm text-slate-400 group-hover:text-slate-100 leading-relaxed transition-colors mb-4">
                            {desc}
                          </p>
                          
                          <div className="mt-auto flex items-center text-[10px] md:text-xs font-bold text-slate-600 group-hover:text-white transition-colors uppercase tracking-widest">
                            Select <span className="ml-2 group-hover:translate-x-2 transition-transform duration-300">→</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
             </div>
          )}

          {state.screen === 'menu' && (
            <div className="flex flex-col items-center justify-center py-6 md:py-10 animate-in slide-in-from-right-8 duration-500">
               <div className="w-full max-w-4xl space-y-6 md:space-y-8">
                 
                 {/* Unified Host Bar */}
                 {(() => {
                    const currentHostEntry = personalities.find(([key, desc]) => desc === state.personality);
                    const hostName = currentHostEntry ? currentHostEntry[0].replace(/_/g, ' ') : 'Unknown';
                    const theme = HOST_THEMES[state.personality] || { icon: Bot, color: "text-slate-400", gradient: "from-slate-800 to-slate-900" };
                    const HostIcon = theme.icon;

                    return (
                        <button
                            onClick={() => { playClick(); setState(prev => ({ ...prev, screen: 'setup' })); }}
                            className="group relative w-full overflow-hidden rounded-2xl bg-slate-900/40 border border-slate-800/60 p-1 flex items-center gap-3 md:gap-4 transition-all duration-300 hover:bg-slate-900/80 hover:border-slate-600 hover:shadow-xl text-left backdrop-blur-sm"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-r ${theme.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}></div>

                            <div className="relative z-10 p-2.5 md:p-3 rounded-xl bg-slate-950/80 border border-slate-800 shadow-lg m-1.5 md:m-2 group-hover:scale-105 transition-transform">
                                <HostIcon className={`w-6 h-6 md:w-8 md:h-8 ${theme.color}`} />
                            </div>

                            <div className="relative z-10 flex-1 py-2 pr-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Host</span>
                                    <span className={`w-1.5 h-1.5 rounded-full ${theme.color.replace('text-', 'bg-')} animate-pulse`}></span>
                                </div>
                                <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-wide group-hover:text-green-300 transition-colors">
                                    {hostName}
                                </h3>
                                <p className="text-xs text-slate-400 truncate max-w-[200px] md:max-w-md hidden md:block">
                                    {state.personality}
                                </p>
                            </div>

                            <div className="relative z-10 px-4 py-4 md:px-6 flex items-center gap-2 border-l border-slate-800 bg-slate-950/30 h-full self-stretch">
                                <div className="text-right hidden md:block">
                                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Change</span>
                                </div>
                                <Settings2 size={18} className="text-slate-400 group-hover:text-green-400 transition-colors" />
                            </div>
                        </button>
                    );
                 })()}

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mt-2 md:mt-4">
                    {/* Game Mode Cards */}
                    <button onClick={startTrivia} className="group relative h-48 md:h-64 overflow-hidden rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-violet-500/50 transition-all duration-300 text-left backdrop-blur-sm">
                      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 to-transparent group-hover:from-violet-600/20 transition-all"></div>
                      <div className="relative z-10 p-6 md:p-8 h-full flex flex-col justify-between">
                        <div>
                          <div className="bg-slate-950/50 w-fit p-2 md:p-3 rounded-2xl border border-violet-500/30 mb-3 md:mb-4">
                            <Sparkles className="text-violet-400 w-6 h-6 md:w-8 md:h-8" />
                          </div>
                          <h3 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2">Classic Trivia</h3>
                          <p className="text-xs md:text-sm text-slate-400">AI-generated questions grounded in real-time.</p>
                        </div>
                        <div className="flex items-center gap-2 text-violet-400 font-bold tracking-wider text-xs md:text-sm">
                          <Play size={14} className="fill-current" /> PLAY NOW
                        </div>
                      </div>
                    </button>

                    <button onClick={startLive} className="group relative h-48 md:h-64 overflow-hidden rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 transition-all duration-300 text-left backdrop-blur-sm">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-transparent group-hover:from-emerald-600/20 transition-all"></div>
                      <div className="relative z-10 p-6 md:p-8 h-full flex flex-col justify-between">
                        <div>
                          <div className="bg-slate-950/50 w-fit p-2 md:p-3 rounded-2xl border border-emerald-500/30 mb-3 md:mb-4">
                            <Mic className="text-emerald-400 w-6 h-6 md:w-8 md:h-8" />
                          </div>
                          <h3 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2">Live Voice</h3>
                          <p className="text-xs md:text-sm text-slate-400">Real-time voice conversation with the host.</p>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-400 font-bold tracking-wider text-xs md:text-sm">
                          <MessageCircle size={14} /> CONNECT
                        </div>
                      </div>
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Difficulty Selector */}
                    <div className="bg-slate-900/50 border border-slate-800 p-4 md:p-6 rounded-2xl flex flex-col gap-3 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-1">
                             <div className="p-1.5 md:p-2 bg-slate-800 rounded-lg text-slate-400"><BarChart3 size={16} /></div>
                             <label className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Difficulty</label>
                        </div>
                        <div className="grid grid-cols-3 gap-2 flex-1">
                            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((level) => {
                                const isActive = state.difficulty === level;
                                let activeClass = "";
                                if(level === 'Easy') activeClass = "bg-green-500/20 text-green-400 border-green-500/50";
                                if(level === 'Medium') activeClass = "bg-amber-500/20 text-amber-400 border-amber-500/50";
                                if(level === 'Hard') activeClass = "bg-red-500/20 text-red-400 border-red-500/50";

                                return (
                                    <button
                                        key={level}
                                        onClick={() => { playClick(); setState(prev => ({ ...prev, difficulty: level })); }}
                                        className={`py-2 px-2 md:px-3 rounded-lg border text-xs md:text-sm font-bold transition-all duration-200 uppercase tracking-wide
                                            ${isActive ? activeClass : 'bg-slate-950/50 border-slate-700 text-slate-500 hover:bg-slate-800'}
                                        `}
                                    >
                                        {level}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Topic Override */}
                    <div className="bg-slate-900/50 border border-slate-800 p-4 md:p-6 rounded-2xl flex flex-col gap-3 backdrop-blur-sm">
                       <div className="flex items-center gap-3 mb-1">
                             <div className="p-1.5 md:p-2 bg-slate-800 rounded-lg text-slate-400"><Atom size={16} /></div>
                             <label className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Custom Topic</label>
                        </div>
                       <input 
                            type="text" 
                            value={state.topic}
                            onChange={(e) => setState(prev => ({...prev, topic: e.target.value}))}
                            placeholder="e.g. 80s Movies..."
                            className="w-full h-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 text-sm"
                        />
                    </div>
                 </div>

               </div>
            </div>
          )}

          {state.screen === 'trivia' && (
            <TriviaMode 
              personality={state.personality} 
              topic={state.topic} 
              difficulty={state.difficulty}
              onExit={goHome}
              updateScore={(pts) => setState(prev => ({ ...prev, score: prev.score + pts }))}
              history={state.history}
              onQuestionGenerated={(q) => setState(prev => ({...prev, history: [...prev.history, q]}))}
              onFeedback={handleTriviaFeedback}
              onRecordEvent={recordAnalytics}
            />
          )}

          {state.screen === 'live' && (
            <LiveMode 
              personality={state.personality}
              onClose={goHome}
              onRecordEvent={recordAnalytics}
            />
          )}

          {state.screen === 'stats' && (
            <AnalyticsDashboard 
              data={state.analytics} 
              onBack={goHome} 
              onClear={clearData}
            />
          )}

        </main>
        
        {/* Footer */}
        {state.screen !== 'trivia' && state.screen !== 'live' && state.screen !== 'stats' && (
            <footer className="w-full py-4 md:py-6 text-center mt-auto border-t border-slate-900 bg-slate-950/50 mb-16 md:mb-0">
                <button 
                    onClick={showStats}
                    className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-600 hover:text-green-400 transition-colors flex items-center justify-center gap-2 mx-auto group"
                >
                    <LineChart size={12} className="group-hover:scale-110 transition-transform" />
                    Application Analytics
                </button>
                <div className="text-[10px] text-slate-700 mt-2 font-mono">
                    Valinor System v2.1 • Session ID: {crypto.randomUUID().split('-')[0]}
                </div>
            </footer>
        )}
        
        {/* PWA INSTALL PROMPT - FLOATING BANNER */}
        {installPrompt && (
            <div className="fixed bottom-4 left-4 right-4 z-[100] animate-in slide-in-from-bottom-10 fade-in duration-500">
                <div className="bg-slate-900/95 border border-slate-700 p-4 rounded-2xl backdrop-blur-xl shadow-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-green-500 to-emerald-700 rounded-xl shadow-lg">
                            <Download size={20} className="text-white"/>
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white">Install App</div>
                            <div className="text-xs text-slate-400">Better performance & fullscreen</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setInstallPrompt(null)} className="p-2 text-slate-500 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                        <button 
                            onClick={installApp} 
                            className="px-4 py-2 bg-white text-slate-950 text-xs font-black uppercase rounded-lg hover:bg-green-400 hover:text-slate-900 transition-colors tracking-wide"
                        >
                            Install
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;