import React, { useMemo, useState } from 'react';
import { AnalyticsEvent, Difficulty } from '../types';
import { ChevronLeft, ArrowUp, Trash2, Mic, Sparkles, LayoutDashboard, Clock, Trophy, Target, AlertCircle, HelpCircle, BarChart3, Activity, History } from 'lucide-react';
import { playThemeSound } from '../services/audioUtils';

interface AnalyticsDashboardProps {
  data: AnalyticsEvent[];
  onBack: () => void;
  onClear: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ data, onBack, onClear }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'trivia' | 'live'>('overview');

  const handleBack = () => {
    playThemeSound('ui-click');
    onBack();
  };

  const switchTab = (tab: 'overview' | 'trivia' | 'live') => {
    playThemeSound('ui-click');
    setActiveTab(tab);
  };

  // Stable ID for UI rendering
  const sessionDisplayId = useMemo(() => crypto.randomUUID().split('-')[0].toUpperCase(), []);

  // --- Data Processing Helpers ---

  const getLast7Days = () => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]); 
    }
    return days;
  };

  const last7Days = getLast7Days();

  // Bucket events by day
  const eventsByDay = useMemo(() => {
    const map: Record<string, AnalyticsEvent[]> = {};
    last7Days.forEach(day => map[day] = []);
    data.forEach(e => {
      const day = new Date(e.timestamp).toISOString().split('T')[0];
      if (map[day]) map[day].push(e);
    });
    return map;
  }, [data, last7Days]);

  // --- OVERVIEW STATS ---
  const scoreTrendData = last7Days.map(day => {
    const events = eventsByDay[day] || [];
    return events.reduce((acc, curr) => acc + (curr.scoreDelta || 0), 0);
  });
  const totalScoreWeek = scoreTrendData.reduce((a, b) => a + b, 0);

  // Daily Activity (Count of interactions per day)
  const activityData = last7Days.map(day => {
    const events = eventsByDay[day] || [];
    return events.filter(e => e.type === 'answer' || e.type === 'skip').length;
  });

  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(e => {
        if (e.topic) counts[e.topic] = (counts[e.topic] || 0) + 1;
    });
    return counts;
  }, [data]);
  const sortedTopics = (Object.entries(topicCounts) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const totalTopicEvents = (Object.values(topicCounts) as number[]).reduce((a, b) => a + b, 0) || 1;

  const topicAccuracy = useMemo(() => {
    const map: Record<string, { correct: number, total: number }> = {};
    data.forEach(e => {
        if (e.topic && (e.result === 'correct' || e.result === 'incorrect')) {
            if (!map[e.topic]) map[e.topic] = { correct: 0, total: 0 };
            map[e.topic].total++;
            if (e.result === 'correct') map[e.topic].correct++;
        }
    });
    return Object.entries(map)
        .map(([topic, stats]) => ({ topic, acc: Math.round((stats.correct / stats.total) * 100), total: stats.total }))
        .sort((a, b) => b.total - a.total) 
        .slice(0, 5);
  }, [data]);

  // --- SESSION HISTORY RECONSTRUCTION ---
  const sessionHistory = useMemo(() => {
    const history: {
        id: string;
        date: string;
        timestamp: number;
        mode: 'trivia' | 'live';
        duration: string;
        score: number;
    }[] = [];

    let currentSess: {
        id: string;
        startTime: number;
        mode: 'trivia' | 'live';
        score: number;
        lastActivity: number;
        explicitDuration: number;
    } | null = null;

    // Ensure data is sorted chronologically
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);

    for (const e of sortedData) {
        if (e.type === 'session_start') {
            if (currentSess) {
                // Close and push previous session
                const dur = currentSess.explicitDuration || (currentSess.lastActivity - currentSess.startTime) / 1000;
                history.push({
                    id: currentSess.id,
                    timestamp: currentSess.startTime,
                    date: new Date(currentSess.startTime).toLocaleString(),
                    mode: currentSess.mode,
                    duration: dur > 60 ? `${Math.floor(dur / 60)}m ${Math.floor(dur % 60)}s` : `${Math.floor(dur)}s`,
                    score: currentSess.score
                });
            }
            // Start new session
            currentSess = {
                id: e.id,
                startTime: e.timestamp,
                mode: e.mode || 'trivia',
                score: 0,
                lastActivity: e.timestamp,
                explicitDuration: 0
            };
        } else if (currentSess) {
            // Update current session
            if (e.type === 'answer' || e.type === 'skip') {
                currentSess.score += (e.scoreDelta || 0);
                currentSess.lastActivity = e.timestamp;
            } else if (e.type === 'session_end') {
                if (e.duration) currentSess.explicitDuration = e.duration;
                currentSess.lastActivity = e.timestamp;
            }
        }
    }

    // Push the final active session
    if (currentSess) {
        const dur = currentSess.explicitDuration || (currentSess.lastActivity - currentSess.startTime) / 1000;
        history.push({
            id: currentSess.id,
            timestamp: currentSess.startTime,
            date: new Date(currentSess.startTime).toLocaleString(),
            mode: currentSess.mode,
            duration: dur > 60 ? `${Math.floor(dur / 60)}m ${Math.floor(dur % 60)}s` : `${Math.floor(dur)}s`,
            score: currentSess.score
        });
    }

    // Return newest first
    return history.sort((a, b) => b.timestamp - a.timestamp);
  }, [data]);

  // --- TRIVIA SPECIFIC STATS ---
  const triviaStats = useMemo(() => {
    const events = data.filter(e => e.mode === 'trivia');
    const answers = events.filter(e => e.type === 'answer');
    const skips = events.filter(e => e.type === 'skip').length;
    const correct = answers.filter(e => e.result === 'correct').length;
    const incorrect = answers.filter(e => e.result === 'incorrect').length;
    const total = answers.length || 1;
    const accuracy = Math.round((correct / total) * 100);
    const score = events.reduce((acc, curr) => acc + (curr.scoreDelta || 0), 0);
    
    const byDifficulty: Record<string, {correct: number, total: number}> = {
        'Easy': {correct: 0, total: 0},
        'Medium': {correct: 0, total: 0},
        'Hard': {correct: 0, total: 0}
    };
    
    answers.forEach(e => {
        if (e.difficulty && byDifficulty[e.difficulty]) {
            byDifficulty[e.difficulty].total++;
            if (e.result === 'correct') byDifficulty[e.difficulty].correct++;
        }
    });

    return { correct, incorrect, skips, total, accuracy, score, byDifficulty };
  }, [data]);

  // --- LIVE SPECIFIC STATS ---
  const liveStats = useMemo(() => {
    const sessions = data.filter(e => e.type === 'session_end' && e.mode === 'live');
    const totalSessions = sessions.length;
    const totalDurationSec = sessions.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    const avgDuration = totalSessions ? Math.round(totalDurationSec / totalSessions) : 0;
    
    const fmt = (s: number) => {
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}m ${sec}s`;
    };

    return { sessions, totalSessions, totalDuration: fmt(totalDurationSec), avgDuration: fmt(avgDuration) };
  }, [data]);


  // --- SVG Chart Components ---
  const LineChart = ({ dataPoints, color, height = 100, fillArea = false }: { dataPoints: number[], color: string, height?: number, fillArea?: boolean }) => {
    const max = Math.max(...dataPoints, 10);
    const min = 0;
    const width = 100;
    const gradientId = `grad-${color.replace('#', '')}`;
    
    const points = dataPoints.length > 0 
        ? dataPoints.map((val, i) => {
            const x = (i / (dataPoints.length - 1)) * width;
            const y = height - ((val - min) / (max - min)) * height;
            return `${x},${y}`;
          }).join(' ')
        : `0,${height} ${width},${height}`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {fillArea && <path d={`M0,${height} ${points} L${width},${height} Z`} fill={`url(#${gradientId})`} />}
        <polyline fill="none" stroke={color} strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {dataPoints.length > 0 && dataPoints.map((val, i) => {
           const x = (i / (dataPoints.length - 1)) * width;
           const y = height - ((val - min) / (max - min)) * height;
           return <circle key={i} cx={x} cy={y} r="3" fill="#0f172a" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
    );
  };

  const DonutChart = () => {
     let cumulativePercent = 0;
     const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f43f5e']; 
     return (
        <div className="relative w-28 h-28 md:w-36 md:h-36">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {sortedTopics.length > 0 ? sortedTopics.map(([topic, count], i) => {
                    const percent = (count / totalTopicEvents) * 100;
                    const dashArray = `${percent} ${100 - percent}`;
                    const offset = 100 - cumulativePercent;
                    cumulativePercent += percent;
                    return (
                        <circle key={topic} r="40" cx="50" cy="50" fill="transparent" stroke={colors[i % colors.length]} strokeWidth="15" strokeDasharray={dashArray} strokeDashoffset={offset} />
                    );
                }) : (
                     <circle r="40" cx="50" cy="50" fill="transparent" stroke="#1e293b" strokeWidth="15" />
                )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Topics</span>
                <span className="text-lg md:text-xl font-bold text-white">{sortedTopics.length}</span>
            </div>
        </div>
     );
  };

  return (
    <div className="flex flex-col space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 w-full max-w-5xl mx-auto">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
         <div className="flex items-center gap-3 md:gap-4">
            <button 
                onClick={handleBack}
                className="p-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white transition-colors"
            >
                <ChevronLeft size={20} />
            </button>
            <div>
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Analytics</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] md:text-xs text-slate-500 font-mono">
                    <span>ID: {sessionDisplayId}</span>
                    <span className="hidden md:inline w-1 h-1 rounded-full bg-slate-600"></span>
                    <span>LOGS: {data.length}</span>
                </div>
            </div>
         </div>
         
         <div className="flex items-center gap-3 self-end md:self-auto">
             <button 
                onClick={onClear}
                className="p-2 rounded-xl bg-red-900/10 border border-red-900/30 text-red-400 hover:bg-red-900/30 hover:text-red-200 transition-colors flex items-center gap-2 text-[10px] md:text-xs font-bold uppercase tracking-wider"
             >
                <Trash2 size={16} /> <span className="hidden md:inline">Reset Data</span>
             </button>
         </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-3 bg-slate-900/50 p-1 rounded-xl border border-slate-800 backdrop-blur-sm">
          <button 
            onClick={() => switchTab('overview')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              <LayoutDashboard size={14} className="md:w-4 md:h-4" /> <span className="hidden md:inline">Overview</span>
          </button>
          <button 
            onClick={() => switchTab('trivia')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'trivia' ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              <Sparkles size={14} className="md:w-4 md:h-4" /> <span className="hidden md:inline">Trivia</span>
          </button>
          <button 
            onClick={() => switchTab('live')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'live' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-white'}`}
          >
              <Mic size={14} className="md:w-4 md:h-4" /> <span className="hidden md:inline">Live</span>
          </button>
      </div>

      {/* --- TAB CONTENT: OVERVIEW --- */}
      {activeTab === 'overview' && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
             
             {/* Row 1: Traffic Trend & Real-time */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                
                {/* Traffic Trend (Span 2) */}
                <div className="lg:col-span-2 bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl relative">
                    <div className="flex justify-between items-start mb-4 md:mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
                                <h3 className="text-base md:text-lg font-bold text-white">Score Trend</h3>
                            </div>
                            <p className="text-slate-500 text-[10px] md:text-xs">Last 7 days performance</p>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl md:text-3xl font-bold text-white">{totalScoreWeek.toLocaleString()}</div>
                            <div className="text-slate-500 text-[10px] md:text-xs uppercase font-bold tracking-wider">Total Score</div>
                        </div>
                    </div>
                    <div className="h-48 md:h-64">
                        <LineChart dataPoints={scoreTrendData} color="#3b82f6" height={200} fillArea />
                    </div>
                </div>

                {/* Real-time (Span 1) */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col">
                    <div className="flex justify-between items-center mb-4 md:mb-6">
                        <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                            <Activity className="text-orange-400" size={18} /> Real-time
                        </h3>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-green-400 uppercase">Live</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 bg-slate-900/50 rounded-xl p-4 md:p-6 border border-slate-800 flex flex-col justify-center items-center text-center relative overflow-hidden group hover:border-green-500/30 transition-colors min-h-[120px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="text-4xl md:text-5xl font-black text-white mb-2 relative z-10">{data.length}</div>
                        <div className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest relative z-10">Total Events Logged</div>
                    </div>
                </div>
             </div>

             {/* Row 2: Sources, Activity, Top Topics */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                
                {/* Traffic Sources */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                    <h3 className="text-base md:text-lg font-bold text-white mb-4 md:mb-6">Sources</h3>
                    <div className="flex flex-col items-center justify-center gap-4 md:gap-6">
                        <DonutChart />
                        <div className="w-full space-y-2 md:space-y-3">
                            {sortedTopics.slice(0, 4).map(([topic, count], i) => {
                                const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f43f5e'];
                                const percent = Math.round((count / totalTopicEvents) * 100);
                                return (
                                    <div key={topic} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i] }}></span>
                                            <span className="text-slate-300 truncate max-w-[100px]">{topic}</span>
                                        </div>
                                        <span className="text-slate-500 font-mono">{percent}%</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Daily Activity */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                    <h3 className="text-base md:text-lg font-bold text-white mb-4 md:mb-6">Daily Activity</h3>
                    <div className="h-32 md:h-40 mb-4">
                        <LineChart dataPoints={activityData} color="#8b5cf6" height={100} fillArea />
                    </div>
                    <div className="text-center">
                        <h4 className="text-2xl font-bold text-white">{data.filter(e => e.type === 'answer').length}</h4>
                        <p className="text-[10px] md:text-xs text-slate-500 uppercase font-bold">Interactions</p>
                    </div>
                </div>

                {/* Top Topics (Countries) */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                    <h3 className="text-base md:text-lg font-bold text-white mb-4 md:mb-6">Top Topics</h3>
                    <div className="space-y-4 md:space-y-5">
                        {topicAccuracy.slice(0, 5).map((item) => (
                            <div key={item.topic}>
                                <div className="flex justify-between text-xs mb-1.5">
                                    <span className="text-slate-300 font-medium truncate max-w-[120px]">{item.topic}</span>
                                    <span className="text-slate-500">{item.acc}% Acc</span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                        className="bg-emerald-500 h-full rounded-full" 
                                        style={{ width: `${item.acc}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                        {topicAccuracy.length === 0 && (
                            <div className="text-center text-slate-500 text-xs py-10">No data available</div>
                        )}
                    </div>
                </div>

             </div>

            {/* Row 3: Session History */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                    <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                        <History size={18} className="text-slate-400" />
                        Session History
                    </h3>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[300px]">
                        <thead>
                            <tr className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                                <th className="py-2 px-2">Date</th>
                                <th className="py-2 px-2">Mode</th>
                                <th className="py-2 px-2">Time</th>
                                <th className="py-2 px-2 text-right">Pts</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs md:text-sm">
                            {sessionHistory.length > 0 ? sessionHistory.map((sess) => (
                                <tr key={sess.id} className="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors">
                                    <td className="py-3 px-2 text-slate-300 font-mono text-[10px] md:text-xs whitespace-nowrap">{sess.date.split(',')[0]}</td>
                                    <td className="py-3 px-2">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                            sess.mode === 'live' 
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                            : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                                        }`}>
                                            {sess.mode === 'live' ? <Mic size={10} /> : <Sparkles size={10} />}
                                            <span className="hidden sm:inline">{sess.mode}</span>
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 text-slate-400 font-mono text-[10px] md:text-xs">{sess.duration}</td>
                                    <td className="py-3 px-2 text-right">
                                        {sess.mode === 'trivia' ? (
                                            <span className={`font-bold font-mono ${sess.score > 0 ? 'text-green-400' : sess.score < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                {sess.score > 0 ? '+' : ''}{sess.score}
                                            </span>
                                        ) : (
                                            <span className="text-slate-600">-</span>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-slate-500 text-xs uppercase tracking-widest">No sessions</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

          </div>
      )}

      {/* --- TAB CONTENT: TRIVIA --- */}
      {activeTab === 'trivia' && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              
              {/* Metrics Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <div className="bg-slate-900/50 p-4 md:p-5 rounded-2xl border border-slate-800">
                      <div className="text-slate-500 text-[10px] md:text-xs font-bold uppercase mb-1">Accuracy</div>
                      <div className="text-xl md:text-2xl font-black text-white">{triviaStats.accuracy}%</div>
                  </div>
                  <div className="bg-slate-900/50 p-4 md:p-5 rounded-2xl border border-slate-800">
                      <div className="text-slate-500 text-[10px] md:text-xs font-bold uppercase mb-1">Total Score</div>
                      <div className="text-xl md:text-2xl font-black text-emerald-400">{triviaStats.score.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-900/50 p-4 md:p-5 rounded-2xl border border-slate-800">
                      <div className="text-slate-500 text-[10px] md:text-xs font-bold uppercase mb-1">Correct</div>
                      <div className="text-xl md:text-2xl font-black text-blue-400">{triviaStats.correct}</div>
                  </div>
                   <div className="bg-slate-900/50 p-4 md:p-5 rounded-2xl border border-slate-800">
                      <div className="text-slate-500 text-[10px] md:text-xs font-bold uppercase mb-1">Wrong</div>
                      <div className="text-xl md:text-2xl font-black text-red-400">{triviaStats.incorrect}</div>
                  </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {/* Accuracy Bar */}
                  <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                      <h3 className="text-base md:text-lg font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                          <Target size={18} className="text-violet-400" />
                          Answers
                      </h3>
                      <div className="space-y-4">
                          <div className="space-y-2">
                              <div className="flex justify-between text-xs md:text-sm">
                                  <span className="text-slate-300">Correct</span>
                                  <span className="text-white font-mono">{triviaStats.correct}</span>
                              </div>
                              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div className="bg-blue-500 h-full" style={{ width: `${(triviaStats.correct / triviaStats.total) * 100}%` }}></div>
                              </div>
                          </div>
                          <div className="space-y-2">
                              <div className="flex justify-between text-xs md:text-sm">
                                  <span className="text-slate-300">Incorrect</span>
                                  <span className="text-white font-mono">{triviaStats.incorrect}</span>
                              </div>
                              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div className="bg-red-500 h-full" style={{ width: `${(triviaStats.incorrect / triviaStats.total) * 100}%` }}></div>
                              </div>
                          </div>
                           <div className="space-y-2">
                              <div className="flex justify-between text-xs md:text-sm">
                                  <span className="text-slate-300">Skipped</span>
                                  <span className="text-white font-mono">{triviaStats.skips}</span>
                              </div>
                              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div className="bg-slate-500 h-full" style={{ width: `${(triviaStats.skips / triviaStats.total) * 100}%` }}></div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Difficulty Stats */}
                  <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                      <h3 className="text-base md:text-lg font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                          <Trophy size={18} className="text-yellow-400" />
                          Difficulty
                      </h3>
                      <div className="space-y-4">
                          {['Easy', 'Medium', 'Hard'].map(level => {
                              const stat = triviaStats.byDifficulty[level];
                              const pct = stat.total ? Math.round((stat.correct / stat.total) * 100) : 0;
                              let color = 'bg-slate-500';
                              if (level === 'Easy') color = 'bg-green-500';
                              if (level === 'Medium') color = 'bg-yellow-500';
                              if (level === 'Hard') color = 'bg-red-500';

                              return (
                                  <div key={level} className="flex items-center gap-4">
                                      <div className="w-16 text-[10px] md:text-xs font-bold text-slate-400 uppercase">{level}</div>
                                      <div className="flex-1">
                                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                              <div className={`${color} h-full`} style={{ width: `${pct}%` }}></div>
                                          </div>
                                      </div>
                                      <div className="w-8 text-right text-xs font-mono text-white">{pct}%</div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- TAB CONTENT: LIVE --- */}
      {activeTab === 'live' && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
               {/* Metrics Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center">
                      <div className="p-3 bg-emerald-500/10 rounded-full mb-3 text-emerald-400 border border-emerald-500/20">
                          <Mic size={24} />
                      </div>
                      <div className="text-3xl font-black text-white">{liveStats.totalSessions}</div>
                      <div className="text-slate-500 text-xs font-bold uppercase mt-1">Total Sessions</div>
                  </div>
                  <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center">
                      <div className="p-3 bg-emerald-500/10 rounded-full mb-3 text-emerald-400 border border-emerald-500/20">
                          <Clock size={24} />
                      </div>
                      <div className="text-3xl font-black text-white">{liveStats.totalDuration}</div>
                      <div className="text-slate-500 text-xs font-bold uppercase mt-1">Total Time Spoken</div>
                  </div>
                  <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center">
                      <div className="p-3 bg-emerald-500/10 rounded-full mb-3 text-emerald-400 border border-emerald-500/20">
                          <BarChart3 size={24} />
                      </div>
                      <div className="text-3xl font-black text-white">{liveStats.avgDuration}</div>
                      <div className="text-slate-500 text-xs font-bold uppercase mt-1">Avg Session Length</div>
                  </div>
              </div>

              {/* Session History List */}
              <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
                  <h3 className="text-base md:text-lg font-bold text-white mb-4">Recent Sessions</h3>
                  <div className="space-y-2">
                      {liveStats.sessions.length > 0 ? [...liveStats.sessions].reverse().slice(0, 5).map(session => (
                          <div key={session.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/30 transition-colors">
                               <div className="flex items-center gap-3">
                                   <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                   <div>
                                       <div className="text-sm font-bold text-slate-300">Voice Chat Session</div>
                                       <div className="text-[10px] text-slate-500 font-mono">{new Date(session.timestamp).toLocaleString()}</div>
                                   </div>
                               </div>
                               <div className="text-emerald-400 font-mono font-bold text-sm">
                                   {session.duration ? `${Math.floor(session.duration / 60)}m ${session.duration % 60}s` : '0s'}
                               </div>
                          </div>
                      )) : (
                          <div className="text-center py-8 text-slate-500 text-sm">No live sessions recorded yet.</div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default AnalyticsDashboard;