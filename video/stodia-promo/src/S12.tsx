import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, caveat, easeIO, ip, rnd, spr, Swatch} from './common';

export const Paper: React.FC<{w: number; h: number}> = ({w, h}) => (
  <div
    style={{
      width: w,
      height: h,
      background: '#fff',
      borderRadius: 6,
      boxShadow: '0 10px 30px rgba(15,23,42,.18)',
      position: 'relative',
      border: '1px solid #E2E8F0',
      overflow: 'hidden',
    }}
  >
    <div style={{position: 'absolute', left: 22, top: 0, bottom: 0, width: 2, background: '#FCA5A5'}} />
    {Array.from({length: Math.floor(h / 22)}).map((_, k) => (
      <div key={k} style={{position: 'absolute', left: 0, right: 0, top: 34 + k * 22, height: 1.5, background: '#CBD5E1'}} />
    ))}
    {[0, 1, 2].map((k) => (
      <div
        key={k}
        style={{
          position: 'absolute',
          left: 34,
          top: 22 + k * 44,
          width: `${40 + ((k * 37) % 45)}%`,
          height: 7,
          borderRadius: 4,
          background: '#94A3B8',
          opacity: 0.7,
        }}
      />
    ))}
  </div>
);

export const Sheet: React.FC<{w: number; h: number; seed: number}> = ({w, h, seed}) => {
  const cols = 5;
  const rows = 6;
  return (
    <div
      style={{
        width: w,
        height: h,
        background: '#CBD5E1',
        borderRadius: 6,
        boxShadow: '0 10px 30px rgba(15,23,42,.18)',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols},1fr)`,
        gridTemplateRows: `repeat(${rows},1fr)`,
        gap: 1.5,
        padding: 1.5,
        overflow: 'hidden',
      }}
    >
      {Array.from({length: cols * rows}).map((_, k) => {
        const header = k < cols;
        const r = rnd(k, seed);
        return (
          <div key={k} style={{background: header ? '#DBEAFE' : '#fff', position: 'relative'}}>
            {!header && r > 0.45 && (
              <div
                style={{
                  position: 'absolute',
                  left: 4,
                  top: '38%',
                  width: `${30 + r * 50}%`,
                  height: 5,
                  borderRadius: 3,
                  background: r > 0.85 ? '#FCA5A5' : r > 0.7 ? '#FDE047' : '#94A3B8',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const Sticky: React.FC<{w: number; color: string}> = ({w, color}) => (
  <div
    style={{
      width: w,
      height: w,
      background: color,
      boxShadow: '0 12px 28px rgba(15,23,42,.22)',
      position: 'relative',
      borderRadius: 4,
    }}
  >
    {[0, 1, 2].map((k) => (
      <div
        key={k}
        style={{
          position: 'absolute',
          left: 16,
          top: 28 + k * 26,
          width: `${70 - k * 18}%`,
          height: 7,
          borderRadius: 4,
          background: 'rgba(15,23,42,.35)',
        }}
      />
    ))}
    <div
      style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 26,
        height: 26,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.12) 50%, rgba(255,255,255,0.55) 50%)',
      }}
    />
  </div>
);

export const STICKY_COLORS = ['#FDE047', '#FDBA74', '#7DD3FC', '#FCA5A5', '#86EFAC'];

const N = 34;
const items = Array.from({length: N}, (_, i) => {
  const kind = i % 3;
  const d = 0.7 + rnd(i, 5) * 0.9;
  const base = kind === 0 ? [150, 200] : kind === 1 ? [280, 190] : [150, 150];
  return {
    kind,
    w: base[0] * d,
    h: base[1] * d,
    d,
    x: 60 + rnd(i, 1) * 1800,
    y: 60 + rnd(i, 2) * 960,
    rot: (rnd(i, 3) - 0.5) * 80,
    spawn: Math.round(55 * Math.pow(i / N, 1.25)) + 1,
    z: rnd(i, 6),
    spin: (rnd(i, 7) > 0.5 ? 1 : -1) * (120 + rnd(i, 8) * 160),
    color: STICKY_COLORS[i % 5],
  };
});

const words = [
  {t: 'Notas', x: 430, y: 250, r: -7, at: 10, hl: true},
  {t: 'Pagos', x: 1480, y: 270, r: 6, at: 22, hl: false},
  {t: 'Asistencia', x: 960, y: 590, r: -4, at: 34, hl: true},
  {t: 'Comedor', x: 380, y: 840, r: 5, at: 46, hl: false},
  {t: 'Inscripción', x: 1440, y: 830, r: -5, at: 58, hl: true},
  {t: 'Becas', x: 930, y: 130, r: 3, at: 70, hl: false},
];

const Words: React.FC<{list: string[]; start: number; size: number; stagger?: number; gap?: number}> = ({
  list,
  start,
  size,
  stagger = 4,
  gap = 0.28,
}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', justifyContent: 'center', gap: size * gap, fontFamily: caveat, fontWeight: 700, fontSize: size, color: C.ink, lineHeight: 1.05}}>
      {list.map((w, k) => {
        const s = spr(f, start + k * stagger, {damping: 14, stiffness: 140, mass: 0.7});
        return (
          <span
            key={k}
            style={{
              display: 'inline-block',
              transform: `translateY(${(1 - s) * 70}px) rotate(${(1 - s) * -4}deg)`,
              opacity: Math.min(1, s * 1.6),
              filter: `blur(${(1 - s) * 10}px)`,
              textShadow: '0 0 28px rgba(248,250,252,.95), 0 0 8px rgba(248,250,252,.9)',
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

export const S12: React.FC = () => {
  const f = useCurrentFrame();
  const front = ip(f, 138, 176, -300, 2700, easeIO);
  const edge = (y: number) => front + (y - 540) * 0.25;
  const place = (x: number, y: number, w: number, i: number) => Math.max(x, edge(y) + 60 + (i % 5) * 14 + w * 0.55);
  const dim = ip(f, 92, 116, 0, 1);
  const cleared = f > 192;

  const barPts: string[] = [];
  for (let y = -120; y <= 1200; y += 40) barPts.push(`${edge(y) + (rnd(y / 40, 3) - 0.5) * 44},${y}`);
  for (let y = 1200; y >= -120; y -= 40) barPts.push(`${edge(y) - 1100},${y}`);
  const leadLine: string[] = [];
  for (let y = -120; y <= 1200; y += 40) leadLine.push(`${edge(y) + (rnd(y / 40, 3) - 0.5) * 44 - 14},${y}`);

  const exitO = ip(f, 204, 222, 1, 0, easeIO);
  const exitY = ip(f, 204, 222, 0, -40, easeIO);
  const swatch = ip(f, 166, 192);

  return (
    <AbsoluteFill>
      {!cleared && (
        <AbsoluteFill style={{opacity: 1 - dim * 0.6, filter: `blur(${dim * 3}px)`}}>
          {items.map((it, i) => {
            if (f < it.spawn) return null;
            const s = spr(f, it.spawn, {damping: 11, stiffness: 90, mass: 0.9});
            const x = place(it.x, it.y, it.w, i);
            const pushed = x - it.x;
            const dx = pushed;
            const dy = (1 - s) * (-1100 - it.y) + Math.sin(f * 0.05 + i) * 7;
            const rot = it.rot + (1 - s) * it.spin + Math.sin(f * 0.04 + i * 2) * 2 + pushed * 0.03;
            const blur = it.d > 1.35 ? 4 : it.d < 0.8 ? 1.5 : 0;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: it.x - it.w / 2,
                  top: it.y - it.h / 2,
                  width: it.w,
                  height: it.h,
                  zIndex: Math.round(it.z * 10),
                  transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)`,
                  filter: blur ? `blur(${blur}px)` : undefined,
                  opacity: Math.min(1, (f - it.spawn + 1) / 3),
                }}
              >
                {it.kind === 0 && <Paper w={it.w} h={it.h} />}
                {it.kind === 1 && <Sheet w={it.w} h={it.h} seed={i} />}
                {it.kind === 2 && <Sticky w={it.w} color={it.color} />}
              </div>
            );
          })}
          {words.map((w, i) => {
            if (f < w.at) return null;
            const s = spr(f, w.at, {damping: 10, stiffness: 160, mass: 0.7});
            const px = place(w.x, w.y, 500, i + 3) - w.x;
            return (
              <div
                key={w.t}
                style={{
                  position: 'absolute',
                  left: w.x,
                  top: w.y,
                  zIndex: 50,
                  transform: `translate(-50%,-50%) translate(${px}px,${Math.sin(f * 0.06 + i) * 6}px) rotate(${w.r + px * 0.03}deg) scale(${0.3 + 0.7 * s})`,
                  opacity: Math.min(1, s * 2),
                }}
              >
                <div
                  style={{
                    fontFamily: caveat,
                    fontWeight: 700,
                    fontSize: 150,
                    lineHeight: 1,
                    color: C.ink,
                    padding: '0 26px 6px',
                    background: w.hl ? C.yellow : '#fff',
                    borderRadius: 16,
                    boxShadow: '0 10px 30px rgba(15,23,42,.2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.t}
                </div>
              </div>
            );
          })}
        </AbsoluteFill>
      )}

      {f >= 136 && f <= 182 && (
        <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, zIndex: 5}}>
          <defs>
            <linearGradient id="bar" gradientUnits="userSpaceOnUse" x1={front - 1100} x2={front + 40} y1={0} y2={0}>
              <stop offset="0" stopColor={C.yellow} stopOpacity="0" />
              <stop offset="0.45" stopColor={C.yellow} stopOpacity="0.85" />
              <stop offset="1" stopColor={C.yellow} stopOpacity="1" />
            </linearGradient>
          </defs>
          <polygon points={barPts.join(' ')} fill="url(#bar)" />
          <polyline points={leadLine.join(' ')} fill="none" stroke={C.amber} strokeWidth={12} strokeOpacity={0.55} strokeLinejoin="round" />
        </svg>
      )}

      <AbsoluteFill style={{zIndex: 10, opacity: exitO, transform: `translateY(${exitY}px)`}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 215}}>
          <Words list={['Menos', 'papeles,']} start={94} size={160} />
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: 395}}>
          <Words list={['menos', 'hojas', 'de', 'cálculo,']} start={108} size={160} />
        </div>
        {f >= 160 && (
          <div style={{position: 'absolute', left: 0, right: 0, top: 650, display: 'flex', justifyContent: 'center'}}>
            <Swatch p={swatch}>
              <Words list={['más', 'tiempo', 'para', 'educar.']} start={166} size={185} stagger={5} />
            </Swatch>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
