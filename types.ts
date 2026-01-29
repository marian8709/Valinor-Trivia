export interface TriviaQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  topic: string;
  hint: string;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface AnalyticsEvent {
  id: string;
  timestamp: number;
  type: 'answer' | 'skip' | 'session_start' | 'session_end';
  topic?: string;
  result?: 'correct' | 'incorrect' | 'skipped' | 'completed';
  scoreDelta?: number;
  difficulty?: Difficulty;
  mode?: 'trivia' | 'live';
  duration?: number;
}

export interface AppState {
  screen: 'setup' | 'menu' | 'trivia' | 'live' | 'stats';
  personality: string;
  topic: string;
  difficulty: Difficulty;
  score: number;
  history: string[]; // Track question texts to prevent duplicates
  analytics: AnalyticsEvent[];
}

export type FeedbackState = 'neutral' | 'correct' | 'incorrect';

export enum HostPersonality {
  SARCASTIC = "A sarcastic, witty robot who loves to make dry jokes.",
  EXCITED = "An overly energetic game show host from the 90s.",
  PIRATE = "A sea captain who loves trivia and gold.",
  MYSTERIOUS = "A cryptic entity who speaks in riddles but gives clear answers.",
  PROFESSOR = "A highly academic and strict professor.",
  HARRY_POTTER = "A courageous wizard student from Hogwarts ready to test your magical knowledge.",
  LORD_OF_THE_RINGS = "A wise wizard from Middle-earth who speaks of ancient lore and rings."
}