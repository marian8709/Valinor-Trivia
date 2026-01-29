import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  color?: string;
  className?: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive, color = "#a855f7", className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
        if (containerRef.current) {
            // Use logical pixel scaling for sharpness on high DPI screens
            const dpr = window.devicePixelRatio || 1;
            const rect = containerRef.current.getBoundingClientRect();
            
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            
            // Normalize coordinate system
            ctx.scale(dpr, dpr);
            
            // Store logical size for calculations
            (canvas as any).logicalWidth = rect.width;
            (canvas as any).logicalHeight = rect.height;
        }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      const width = (canvas as any).logicalWidth || canvas.width;
      const height = (canvas as any).logicalHeight || canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
          // Optional: Draw a flat line or subtle breathe when inactive
          return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Styling
      ctx.fillStyle = color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      
      // We want to draw symmetrically: Low frequencies in center, high at edges.
      // We'll use about half the FFT size for the visual width to avoid the high-freq empty tail.
      const barsToShow = Math.floor(bufferLength * 0.75); 
      
      // Calculate bar dimensions
      // We need room for 'barsToShow' bars on LEFT and 'barsToShow' bars on RIGHT? 
      // No, we mirror the same data.
      // Total slots = barsToShow * 2 (mirrored) - 1 (center shared)
      
      const totalVisualBars = 40; // Fixed number of bars for cleaner look, regardless of FFT size
      const barWidth = (width / totalVisualBars) * 0.6; // Bar width relative to screen
      const gap = (width / totalVisualBars) * 0.4;
      
      const centerX = width / 2;
      const centerY = height / 2;

      // Draw Center Bar (Index 0)
      const centerVal = dataArray[0] / 255;
      const centerH = Math.max(4, centerVal * height * 0.8);
      
      // Helper to draw rounded rect
      const drawBar = (x: number, h: number) => {
          const w = barWidth;
          const y = centerY - h / 2;
          const radius = w / 2;
          
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, radius);
          ctx.fill();
      };

      // Draw center
      drawBar(centerX - barWidth/2, centerH);

      // Draw Pairs outwards
      for (let i = 1; i < totalVisualBars / 2; i++) {
        // Map visual index 'i' to frequency index
        // We want to cover the vocal range (mostly lower indices)
        // Linear mapping might miss highs, but for voice, log or skewed is better.
        // Let's just grab indices linearly from the start for now as they contain most voice energy.
        const dataIndex = Math.floor(i * (barsToShow / (totalVisualBars / 2)));
        
        // Smooth falloff for high indices to prevent abrupt cut
        const falloff = 1 - (i / (totalVisualBars / 2));
        
        let val = (dataArray[dataIndex] || 0) / 255;
        val = val * falloff; // Apply fade out at edges

        const h = Math.max(4, val * height * 0.8);
        const xOffset = i * (barWidth + gap);

        // Right
        drawBar(centerX + xOffset - barWidth/2, h);
        // Left
        drawBar(centerX - xOffset - barWidth/2, h);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [analyser, isActive, color]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`}>
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block"
          style={{ width: '100%', height: '100%' }}
        />
    </div>
  );
};

export default Visualizer;