import React, { useEffect, useRef } from 'react';
import { FeedbackState } from '../types';

interface InteractiveBackgroundProps {
  state: FeedbackState;
  palette: string[]; // Array of 3 hex strings
}

// Types for our visual elements
interface RGB {
  r: number;
  g: number;
  b: number;
}

interface BlobEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number; // To remember original size for pulsing
  color: RGB; 
}

type ParticleType = 'victory' | 'defeat';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  decay: number;
  type: ParticleType;
}

// Helper: Hex to RGB
const hexToRgb = (hex: string): RGB => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

// Helper: Linear Interpolation
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

const InteractiveBackground: React.FC<InteractiveBackgroundProps> = ({ state, palette }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Refs to hold animation state
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef<number>(0);
  const moodRef = useRef<{ brightness: number, pulse: number }>({ brightness: 1, pulse: 0 });
  
  // Initialize blobs
  const blobsRef = useRef<BlobEntity[]>([
      { x: window.innerWidth * 0.2, y: window.innerHeight * 0.3, vx: 0.2, vy: 0.1, radius: 400, baseRadius: 400, color: hexToRgb(palette[0] || '#4338ca') },
      { x: window.innerWidth * 0.8, y: window.innerHeight * 0.7, vx: -0.2, vy: -0.1, radius: 500, baseRadius: 500, color: hexToRgb(palette[1] || '#312e81') },
      { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, vx: 0.1, vy: -0.2, radius: 300, baseRadius: 300, color: hexToRgb(palette[2] || '#1e1b4b') },
  ]);

  useEffect(() => {
    if (state === 'correct') {
      spawnParticles('victory');
      moodRef.current.pulse = 1.5; // Scale up blobs
      moodRef.current.brightness = 1.3; // Make brighter
    } else if (state === 'incorrect') {
      spawnParticles('defeat');
      moodRef.current.pulse = 0.8; // Shrink blobs
      moodRef.current.brightness = 0.5; // Dim lights
      shakeRef.current = 15; // Trigger shake
    } else {
      // Neutral
      moodRef.current.pulse = 1.0;
      moodRef.current.brightness = 1.0;
    }
  }, [state]);

  const spawnParticles = (type: ParticleType) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const count = type === 'victory' ? 120 : 60;
    
    // Victory Colors: Vibrant / Defeat Colors: Ash & Ember
    const vColors = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#ffffff'];
    const dColors = ['#57534e', '#44403c', '#7f1d1d', '#991b1b']; 

    for (let i = 0; i < count; i++) {
      const isVictory = type === 'victory';
      
      particlesRef.current.push({
        x: isVictory ? width / 2 : Math.random() * width, // Victory explodes from center, Defeat rains everywhere
        y: isVictory ? height + 20 : -20,
        
        vx: isVictory ? (Math.random() - 0.5) * 25 : (Math.random() - 0.5) * 2,
        vy: isVictory ? -(Math.random() * 15 + 12) : (Math.random() * 5 + 2), // Victory shoots up, Defeat falls down
        
        rotation: Math.random() * 360,
        rotationSpeed: isVictory ? (Math.random() - 0.5) * 10 : (Math.random() - 0.5) * 2,
        
        color: isVictory 
          ? vColors[Math.floor(Math.random() * vColors.length)] 
          : dColors[Math.floor(Math.random() * dColors.length)],
        
        size: isVictory ? Math.random() * 8 + 4 : Math.random() * 4 + 1,
        decay: isVictory ? Math.random() * 0.02 + 0.01 : Math.random() * 0.01 + 0.005,
        type
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    let mouse = { x: width / 2, y: height / 2 };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // --- Mood Recovery ---
      // Smoothly return pulse and brightness to neutral (1.0)
      moodRef.current.pulse = lerp(moodRef.current.pulse, 1.0, 0.02);
      moodRef.current.brightness = lerp(moodRef.current.brightness, 1.0, 0.02);

      // --- 1. Shake / Chromatic Aberration (For Incorrect) ---
      let offsetX = 0;
      let offsetY = 0;
      if (shakeRef.current > 0) {
        const intensity = shakeRef.current;
        offsetX = (Math.random() - 0.5) * intensity;
        offsetY = (Math.random() - 0.5) * intensity;
        shakeRef.current *= 0.9; // Decay shake
        if (shakeRef.current < 0.5) shakeRef.current = 0;
      }

      ctx.save();
      ctx.translate(offsetX, offsetY);

      // --- 2. Background Blobs ---
      const mouseOffsetX = (mouse.x - width/2) * 0.05;
      const mouseOffsetY = (mouse.y - height/2) * 0.05;

      blobsRef.current.forEach((blob, i) => {
        // Move
        blob.x += blob.vx;
        blob.y += blob.vy;

        // Bounce
        if (blob.x < -200 || blob.x > width + 200) blob.vx *= -1;
        if (blob.y < -200 || blob.y > height + 200) blob.vy *= -1;

        // Target Color Interpolation
        const targetHex = palette[i] || palette[0] || '#000000';
        const targetRGB = hexToRgb(targetHex);
        
        blob.color.r = lerp(blob.color.r, targetRGB.r, 0.02);
        blob.color.g = lerp(blob.color.g, targetRGB.g, 0.02);
        blob.color.b = lerp(blob.color.b, targetRGB.b, 0.02);

        // Apply Mood Brightness
        const br = moodRef.current.brightness;
        const r = Math.min(255, blob.color.r * br);
        const g = Math.min(255, blob.color.g * br);
        const b = Math.min(255, blob.color.b * br);

        // Apply Mood Pulse to Radius
        const currentRadius = lerp(blob.radius, blob.baseRadius * moodRef.current.pulse, 0.05);
        blob.radius = currentRadius;

        const colorString = `rgb(${r}, ${g}, ${b})`;

        const gradient = ctx.createRadialGradient(
          blob.x + mouseOffsetX, blob.y + mouseOffsetY, 0, 
          blob.x + mouseOffsetX, blob.y + mouseOffsetY, Math.max(0, blob.radius)
        );
        gradient.addColorStop(0, colorString);
        gradient.addColorStop(1, 'transparent');

        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x + mouseOffsetX, blob.y + mouseOffsetY, Math.max(0, blob.radius), 0, Math.PI * 2);
        ctx.fill();
      });
      
      ctx.globalCompositeOperation = 'source-over';

      // --- 3. Chromatic Glitch (Incorrect State) ---
      if (shakeRef.current > 1) {
        // Draw random slice with color offset
        const sliceY = Math.random() * height;
        const sliceH = Math.random() * 20 + 5;
        const offset = (Math.random() - 0.5) * 10;
        
        try {
            // Check bounds to avoid canvas errors
            if (sliceY + sliceH < height) {
                const imageData = ctx.getImageData(0, sliceY, width, sliceH);
                ctx.putImageData(imageData, offset, sliceY);
                
                // Red tint overlay on the slice
                ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
                ctx.fillRect(0, sliceY, width, sliceH);
            }
        } catch (e) {
            // Ignore boundary errors during resize
        }
      }

      // --- 4. Particles (Victory & Defeat) ---
      // Loop backwards to allow safe removal of array elements
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        
        // Physics
        p.x += p.vx;
        p.y += p.vy;
        
        if (p.type === 'victory') {
           p.vy += 0.5; // Strong Gravity
           p.vx *= 0.98; // Air resistance
           p.rotation += p.rotationSpeed;
        } else {
           // Defeat (Ash/Dust)
           p.vy *= 1.01; // Terminal velocity accel?
           if (p.vy > 2) p.vy = 2; // Cap speed
           p.x += Math.sin(p.y * 0.05) * 0.5; // Wobble
        }
        
        p.size -= p.decay;

        // Remove dead particles BEFORE drawing to prevent negative radius errors
        if (p.size <= 0 || p.y > height + 50 || p.y < -50) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        
        if (p.type === 'victory') {
          ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        } else {
          // Draw irregular circle for ash
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [palette]);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-0 bg-slate-950 transition-colors duration-1000"
    />
  );
};

export default InteractiveBackground;