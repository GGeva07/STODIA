import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, caveat, easeIO, ip, Mark, MarkerLine, rnd, spr} from './common';

const ACC = [C.blue, C.sky, C.yellow];

const Tile: React.FC<{kind: number; accent: string; glow: number}> = ({kind, accent, glow}) => (
  <div
    style={{
      width: 170,
      height: 120,
      borderRadius: 20,
      background: kind === 2 ? accent : '#fff',
      border: `1.5px solid ${glow > 0.05 ? C.blue : '#DCE5F2'}`,
      boxShadow: `0 10px 26px rgba(15,23,42,.12), 0 0 ${glow * 34}px rgba(37,99,235,${glow * 0.55})`,
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {kind === 0 && (
      <>
        <div style={{position: 'absolute', left: 18, top: 18, width: 34, height: 12, borderRadius: 6, background: accent}} />
        {[0, 1, 2].map((k) => (
          <div key={k} style={{position: 'absolute', left: 18, top: 44 + k * 18, width: `${78 - k * 16}%`, height: 8, borderRadius: 4, background: '#CBD5E1'}} />
        ))}
      </>
    )}
    {kind === 1 && (
      <div style={{position: 'absolute', inset: 14, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: 'repeat(3,1fr)', gap: 5}}>
        {Array.from({length: 12}).map((_, k) => (
          <div key={k} style={{borderRadius: 4, background: k % 5 === 0 ? accent : '#E2E8F0'}} />
        ))}
      </div>
    )}
    {kind === 2 && (
      <svg viewBox="0 0 24 24" style={{position: 'absolute', left: 50, top: 28, width: 70, height: 70}} fill="none" stroke={C.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    )}
  </div>
);

const slots = Array.from({length: 24}, (_, i) => {
  const side = i < 12 ? 0 : 1;
  const j = i % 12;
  const col = j % 3;
  const row = Math.floor(j / 3);
  const x0 = side === 0 ? 262 : 1100;
  return {x: x0 + col * 194 + 85, y: 400 + row * 144 + 60, kind: i % 3, accent: ACC[(i + row) % 3], ang: rnd(i, 11) * 6.283, rot: (rnd(i, 12) - 0.5) * 220, at: 8 + Math.round(i * 1.4)};
});

export const S3: React.FC = () => {
  const f = useCurrentFrame();
  const exit = ip(f, 108, 128, 0, 1, easeIO);
  const mS = spr(f, 4, {damping: 11, stiffness: 120, mass: 0.9});
  const wave = ((f - 52) * 26) % 1500;
  const head1 = ['Tu', 'colegio,', 'organizado'];
  const head2 = ['y', 'en', 'un', 'solo', 'lugar'];
  const word = (t: string, k: number, base: number) => {
    const s = spr(f, base + k * 4, {damping: 14, stiffness: 140, mass: 0.7});
    return (
      <span key={t} style={{display: 'inline-block', transform: `translateY(${(1 - s) * 70}px) rotate(${(1 - s) * 5}deg)`, opacity: Math.min(1, s * 1.8), filter: `blur(${(1 - Math.min(1, s)) * 8}px)`}}>{t}</span>
    );
  };
  return (
    <AbsoluteFill>
      {/* radar rings */}
      {[0, 1, 2].map((k) => {
        const t = ((f + k * 40) % 120) / 120;
        const r = 120 + t * 520;
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: 960 - r,
              top: 676 - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: `3px solid rgba(56,189,248,${(1 - t) * 0.35 * ip(f, 10, 30)})`,
            }}
          />
        );
      })}

      <div style={{position: 'absolute', left: 0, right: 0, top: 50, opacity: 1 - exit, transform: `translateY(${-exit * 40}px)`}}>
        <div style={{textAlign: 'center', fontFamily: caveat, fontWeight: 700, fontSize: 138, lineHeight: 1.02, color: C.ink}}>
          <div style={{display: 'flex', justifyContent: 'center', gap: 36}}>{head1.map((w, k) => word(w, k, 6))}</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: 36}}>
            <span style={{position: 'relative', display: 'flex', gap: 36}}>
              {head2.map((w, k) => word(w, k, 22))}
              <MarkerLine p={ip(f, 52, 80)} thick={22} style={{top: '90%'}} />
            </span>
          </div>
        </div>
      </div>

      {slots.map((s, i) => {
        const p = spr(f, s.at, {damping: 13, stiffness: 120, mass: 0.8});
        if (f < s.at) return null;
        const sx = 960 + Math.cos(s.ang) * 1700;
        const sy = 540 + Math.sin(s.ang) * 1100;
        const x = s.x + (sx - s.x) * (1 - p);
        const y = s.y + (sy - s.y) * (1 - p);
        const dist = Math.hypot(s.x - 960, s.y - 676);
        const glow = f > 55 ? Math.max(0, 1 - Math.abs(dist - wave) / 140) : 0;
        const sc = (1 - exit * 0.5) * (1 + glow * 0.04);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - 85,
              top: y - 60,
              transform: `rotate(${(1 - p) * s.rot}deg) scale(${sc})`,
              opacity: (1 - exit) * Math.min(1, p * 3),
            }}
          >
            <Tile kind={s.kind} accent={s.accent} glow={glow} />
          </div>
        );
      })}

      <div style={{position: 'absolute', left: 960 - 82, top: 676 - 150, transform: `scale(${0.3 + 0.7 * mS}) rotate(${(1 - mS) * -14 + Math.sin(f / 25) * 1.5}deg) translateY(${Math.sin(f / 18) * 6}px)`, opacity: Math.min(1, mS * 2)}}>
        <Mark h={300} />
      </div>
    </AbsoluteFill>
  );
};
