import React, { useEffect, useRef } from 'react';

interface StarParticle {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  speed: number;
  driftY: number;
  color: string;
}

const STAR_COLORS = [
  '241, 245, 249', // Soft starlight white
  '165, 243, 252', // Crystalline cyan
  '253, 230, 138', // Warm stellar amber
  '199, 210, 254', // Distant blue-white
];

export const StarfieldCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const starCount = Math.min(110, Math.max(55, Math.floor((width * height) / 16000)));
    const stars: StarParticle[] = Array.from({ length: starCount }, (_, i) => {
      const seed = (i * 9301 + 49297) % 233280;
      const rand = (offset: number) => ((seed + offset * 1777) % 1000) / 1000;
      return {
        x: rand(1) * width,
        y: rand(2) * height,
        radius: 0.6 + rand(3) * 1.4,
        baseAlpha: 0.25 + rand(4) * 0.55,
        phase: rand(5) * Math.PI * 2,
        speed: 0.015 + rand(6) * 0.035,
        driftY: 0.04 + rand(7) * 0.08,
        color: STAR_COLORS[i % STAR_COLORS.length],
      };
    });

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    let lastDraw = 0;
    const render = (timestamp: number) => {
      // Throttle to ~24 fps so background twinkling is silky smooth with minimal CPU overhead
      if (timestamp - lastDraw >= 42) {
        lastDraw = timestamp;
        ctx.clearRect(0, 0, width, height);

        for (const s of stars) {
          s.phase += s.speed;
          s.y -= s.driftY;
          if (s.y < 0) {
            s.y = height;
          }

          const twinkle = 0.5 + 0.5 * Math.sin(s.phase);
          const alpha = Math.max(0.08, Math.min(0.95, s.baseAlpha * (0.45 + 0.7 * twinkle)));

          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${s.color}, ${alpha.toFixed(3)})`;
          ctx.fill();

          // Subtle cross-glint on brighter stars
          if (s.radius > 1.55 && twinkle > 0.78) {
            ctx.strokeStyle = `rgba(${s.color}, ${(alpha * 0.45).toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(s.x - s.radius * 2.4, s.y);
            ctx.lineTo(s.x + s.radius * 2.4, s.y);
            ctx.moveTo(s.x, s.y - s.radius * 2.4);
            ctx.lineTo(s.x, s.y + s.radius * 2.4);
            ctx.stroke();
          }
        }
      }
      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="starfield-canvas"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
};
