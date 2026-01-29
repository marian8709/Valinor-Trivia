// Audio encoding and decoding utilities for Raw PCM usage with Gemini Live API

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function createPCM16Blob(float32Data: Float32Array): { data: string; mimeType: string } {
  const l = float32Data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp values
    const s = Math.max(-1, Math.min(1, float32Data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- Procedural Intro Sounds ---

export type ThemeSound = 'glitch' | 'level-up' | 'foghorn' | 'mysterious' | 'notification' | 'magic' | 'epic' | 'ui-click' | 'correct' | 'incorrect';

const playTone = (ctx: AudioContext, freq: number, type: OscillatorType, startTime: number, duration: number, vol: number = 0.1) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
};

export const playThemeSound = (sound: ThemeSound) => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const now = ctx.currentTime;

  // Helper to close context after sound finishes to prevent hitting context limits
  const cleanup = (delaySeconds: number) => {
    setTimeout(() => {
      if (ctx.state !== 'closed') {
        ctx.close().catch(console.error);
      }
    }, delaySeconds * 1000);
  };

  switch (sound) {
    case 'glitch': {
      // Sarcastic: Soft "Deadpan" Bloop (Sine wave pitch drop)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.3); // "Womp" sound
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.3);
      cleanup(0.5);
      break;
    }
    case 'level-up': {
      // Excited: Soft Chimes (Sine waves) - Volume Reduced
      playTone(ctx, 523.25, 'sine', now, 0.15, 0.05); // C5
      playTone(ctx, 659.25, 'sine', now + 0.1, 0.15, 0.05); // E5
      playTone(ctx, 783.99, 'sine', now + 0.2, 0.15, 0.05); // G5
      playTone(ctx, 1046.50, 'sine', now + 0.3, 0.4, 0.05); // C6
      cleanup(1.0);
      break;
    }
    case 'foghorn': {
      // Pirate: Distant Ship Horn/Woodwind (Triangle Wave) - Volume Reduced
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      osc.type = 'triangle'; // Softer shape
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      
      osc.frequency.setValueAtTime(110, now); // Low A
      osc.frequency.linearRampToValueAtTime(105, now + 1.2); // Slight pitch drift
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.3); // Reduced max gain
      gain.gain.linearRampToValueAtTime(0, now + 1.5); // Long release
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 1.5);
      cleanup(2.0);
      break;
    }
    case 'mysterious': {
      // Eerie: Dissonant Sine Waves
      playTone(ctx, 440, 'sine', now, 1.5, 0.05);
      playTone(ctx, 452, 'sine', now, 1.5, 0.05); // Tritone-ish dissonance
      playTone(ctx, 880, 'sine', now + 0.5, 1.0, 0.02); // High echo
      cleanup(2.0);
      break;
    }
    case 'notification': {
      // Academic: Crisp, polite double beep
      playTone(ctx, 880, 'sine', now, 0.1, 0.08);
      playTone(ctx, 1760, 'sine', now + 0.1, 0.2, 0.05);
      cleanup(1.0);
      break;
    }
    case 'magic': {
      // Magic: Celesta-like high tinkles with randomized timing
      playTone(ctx, 987.77, 'sine', now, 0.5, 0.05); // B5
      playTone(ctx, 1318.51, 'sine', now + 0.15, 0.5, 0.05); // E6
      playTone(ctx, 1174.66, 'sine', now + 0.3, 0.8, 0.05); // D6
      playTone(ctx, 1975.53, 'sine', now + 0.45, 0.4, 0.03); // B6
      cleanup(1.0);
      break;
    }
    case 'epic': {
      // Lord of the Rings: Ethereal Choir Pad (Sine waves) - Volume Reduced
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      osc1.frequency.setValueAtTime(220, now); // A3
      osc2.frequency.setValueAtTime(329.63, now); // E4 (5th)
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.8); // Reduced swell volume
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0); // Long tail
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 3.0);
      osc2.stop(now + 3.0);
      cleanup(3.5);
      break;
    }
    case 'ui-click': {
      // Subtle interface click (Sine chirp)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
      
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.1);
      cleanup(0.2);
      break;
    }
    case 'correct': {
      // Soft Positive Chime (F Major: F5 -> A5 -> C6)
      // Very soft attack, pure sine waves
      playTone(ctx, 698.46, 'sine', now, 0.3, 0.08); // F5
      playTone(ctx, 880.00, 'sine', now + 0.08, 0.3, 0.08); // A5
      playTone(ctx, 1046.50, 'sine', now + 0.16, 0.6, 0.06); // C6
      cleanup(1.0);
      break;
    }
    case 'incorrect': {
      // Soft Negative Thud (Descending Pitch)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine'; // Sine for softness
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.3); // Slight pitch drop
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05); // Soft attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); // Quick decay
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.35);
      cleanup(0.5);
      break;
    }
  }
};