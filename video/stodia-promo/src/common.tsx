import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {loadFont as loadCaveat} from '@remotion/google-fonts/Caveat';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';

export const caveat = loadCaveat('normal', {weights: ['700'], subsets: ['latin']}).fontFamily;
export const inter = loadInter('normal', {weights: ['400', '600'], subsets: ['latin']}).fontFamily;

export const C = {
  ink: '#0F172A',
  blue: '#2563EB',
  blueD: '#1D4ED8',
  sky: '#38BDF8',
  canvas: '#F8FAFC',
  yellow: '#FDE047',
  navy: '#0F2A6B',
  amber: '#F59E0B',
  deep: '#D97706',
};

export const rnd = (i: number, s = 0) => {
  const x = Math.sin(i * 127.1 + s * 311.7 + 13.37) * 43758.5453;
  return x - Math.floor(x);
};
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIO = Easing.bezier(0.65, 0, 0.35, 1);
export const ip = (
  f: number,
  a: number,
  b: number,
  from = 0,
  to = 1,
  e: (t: number) => number = easeOut,
) => interpolate(f, [a, b], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e});

export const spr = (
  f: number,
  start: number,
  cfg: {damping?: number; stiffness?: number; mass?: number} = {damping: 15, stiffness: 120, mass: 0.8},
) => (f < start ? 0 : spring({frame: f - start, fps: 30, config: cfg}));

export const CanvasBg: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: 'linear-gradient(135deg,#F8FAFC 0%,#EDF3FF 100%)'}}>
      <div
        style={{
          position: 'absolute',
          left: 1150 + Math.sin(f / 90) * 70,
          top: -300 + Math.cos(f / 110) * 50,
          width: 1000,
          height: 1000,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56,189,248,0.30), rgba(56,189,248,0) 65%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -300 + Math.cos(f / 100) * 60,
          top: 600 + Math.sin(f / 80) * 40,
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(253,224,71,0.30), rgba(253,224,71,0) 65%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const Particles: React.FC<{count?: number; color?: string; seed?: number; opacity?: number}> = ({
  count = 28,
  color = '#38BDF8',
  seed = 1,
  opacity = 0.5,
}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: count}, (_, i) => {
        const x0 = rnd(i, seed) * 1920;
        const y0 = rnd(i, seed + 1) * 1080;
        const sp = 0.25 + rnd(i, seed + 2) * 0.7;
        const size = 3 + rnd(i, seed + 3) * 9;
        const ph = rnd(i, seed + 4) * 6.28;
        const y = ((((y0 - f * sp * 1.6) % 1180) + 1180) % 1180) - 50;
        const x = x0 + Math.sin(f / 40 + ph) * 30;
        const tw = 0.5 + 0.5 * Math.sin(f / 20 + ph);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              opacity: opacity * (0.35 + 0.65 * tw),
              filter: size > 8 ? 'blur(2px)' : undefined,
              boxShadow: `0 0 ${size * 2}px ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const Mark: React.FC<{h: number; style?: React.CSSProperties; glow?: boolean}> = ({h, style, glow = true}) => (
  <Img
    src={staticFile('stodia-mark.svg')}
    style={{
      height: h,
      width: (h * 104) / 190,
      filter: glow ? 'drop-shadow(0 8px 24px rgba(245,158,11,0.35))' : undefined,
      ...style,
    }}
  />
);

/** Hand-drawn marker underline; p = draw progress 0..1. Width follows its container. */
export const MarkerLine: React.FC<{
  p: number;
  color?: string;
  thick?: number;
  style?: React.CSSProperties;
  d?: string;
}> = ({p, color = C.yellow, thick = 18, style, d = 'M6 22 C 120 8, 260 32, 400 14 S 560 26, 594 12'}) => (
  <svg
    viewBox="0 0 600 40"
    style={{position: 'absolute', left: 0, top: '82%', width: '100%', height: 'auto', overflow: 'visible', ...style}}
  >
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={thick}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={1 - p}
      opacity={p > 0.015 ? 1 : 0}
    />
  </svg>
);

/** Yellow highlighter swatch revealed left-to-right behind its children. */
export const Swatch: React.FC<{p: number; children: React.ReactNode; style?: React.CSSProperties; color?: string}> = ({
  p,
  children,
  style,
  color = C.yellow,
}) => (
  <span style={{position: 'relative', display: 'inline-block', ...style}}>
    <span
      style={{
        position: 'absolute',
        left: -14,
        right: -14,
        top: '14%',
        bottom: '2%',
        background: color,
        borderRadius: 10,
        transform: 'skewX(-5deg)',
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
      }}
    />
    <span style={{position: 'relative'}}>{children}</span>
  </span>
);
