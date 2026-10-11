import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, caveat, easeIO, easeOut, inter, ip, Mark, MarkerLine, Particles, rnd, spr} from './common';

const Beat: React.FC<{a: number; b: number; exit?: 'up' | 'left' | 'scale' | 'none'; children: (g: number) => React.ReactNode}> = ({a, b, exit = 'up', children}) => {
  const f = useCurrentFrame();
  if (f < a || f > b + 8) return null;
  const e = ip(f, b, b + 7, 0, 1, easeIO);
  const tf = exit === 'up' ? `translateY(${-e * 90}px)` : exit === 'left' ? `translateX(${-e * 300}px)` : exit === 'scale' ? `scale(${1 + e * 0.07})` : '';
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: 1 - e, transform: tf, filter: `blur(${e * 8}px)`}}>
      {children(f - a)}
    </AbsoluteFill>
  );
};

const Person: React.FC = () => (
  <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </svg>
);

export const S5: React.FC = () => {
  const f = useCurrentFrame();
  const reveal = ip(f, 0, 22, 0, 1700, easeIO);
  const head = 'Tus datos son tuyos'.split(' ');

  return (
    <AbsoluteFill style={{clipPath: `circle(${reveal}px at 960px 540px)`, background: 'linear-gradient(160deg,#173A8E 0%,#0F2A6B 45%,#0A1D4D 100%)'}}>
      <div style={{position: 'absolute', left: 1100 + Math.sin(f / 70) * 80, top: -200 + Math.cos(f / 90) * 50, width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.30), rgba(56,189,248,0) 65%)'}} />
      <div style={{position: 'absolute', left: -300 + Math.cos(f / 80) * 70, top: 500, width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.45), rgba(37,99,235,0) 65%)'}} />
      <Particles color="#BAE6FD" count={34} seed={9} opacity={0.6} />
      <div style={{position: 'absolute', left: 60, top: 40, opacity: ip(f, 6, 20)}}>
        <Mark h={96} />
      </div>

      {/* 1. 6 roles */}
      <Beat a={6} b={46} exit="scale">
        {(g) => {
          const n = Math.round(ip(g, 4, 26, 0, 6, easeOut));
          const sc = spr(g, 2, {damping: 9, stiffness: 150, mass: 0.8});
          return (
            <>
              {Array.from({length: 6}).map((_, i) => {
                const ang = (i * 60 + g * 1.4) * (Math.PI / 180);
                const s = spr(g, 12 + i * 3, {damping: 10, stiffness: 160, mass: 0.6});
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: 960 + Math.cos(ang) * 760 - 36,
                      top: 540 + Math.sin(ang) * 390 - 36,
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg,${C.sky},${C.blue})`,
                      display: 'grid',
                      placeItems: 'center',
                      transform: `scale(${s})`,
                      boxShadow: '0 0 40px rgba(56,189,248,.55)',
                    }}
                  >
                    <Person />
                  </div>
                );
              })}
              <div style={{display: 'flex', alignItems: 'baseline', position: 'relative'}}>
                <div style={{fontFamily: caveat, fontWeight: 700, fontSize: 560, lineHeight: 0.8, color: C.yellow, transform: `scale(${0.5 + 0.5 * sc})`, textShadow: '0 10px 70px rgba(253,224,71,.35)', minWidth: 260, textAlign: 'center'}}>{n}</div>
                <div style={{fontFamily: inter, fontWeight: 600, fontSize: 150, color: '#fff', marginLeft: 36, opacity: ip(g, 16, 30), transform: `translateX(${(1 - ip(g, 16, 34)) * 80}px)`}}>roles</div>
                <MarkerLine p={ip(g, 22, 42)} thick={10} style={{top: '98%'}} />
              </div>
            </>
          );
        }}
      </Beat>

      {/* 2. Web · Android · Windows */}
      <Beat a={50} b={88} exit="up">
        {(g) => {
          const w = ['Web', 'Android', 'Windows'];
          return (
            <div style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 44, fontFamily: inter, fontWeight: 600, fontSize: 124, color: '#fff'}}>
              {w.map((t, k) => {
                const s = spr(g, k * 8, {damping: 14, stiffness: 150, mass: 0.7});
                const dot = spr(g, k * 8 + 6, {damping: 9, stiffness: 200, mass: 0.5});
                return (
                  <React.Fragment key={t}>
                    <span style={{display: 'inline-block', overflow: 'hidden', padding: '0 4px 12px'}}>
                      <span style={{display: 'inline-block', transform: `translateY(${(1 - s) * 120}%) rotateX(${(1 - s) * -60}deg)`, transformOrigin: 'bottom'}}>{t}</span>
                    </span>
                    {k < 2 && <span style={{color: C.yellow, transform: `scale(${dot})`, display: 'inline-block'}}>·</span>}
                  </React.Fragment>
                );
              })}
              <MarkerLine p={ip(g, 14, 32)} thick={7} style={{top: '88%'}} />
            </div>
          );
        }}
      </Beat>

      {/* 3. Tu servidor o el nuestro (typewriter) */}
      <Beat a={92} b={122} exit="left">
        {(g) => {
          const txt = 'Tu servidor o el nuestro';
          const n = Math.floor(ip(g, 2, 24, 0, txt.length, (t) => t));
          return (
            <div style={{fontFamily: caveat, fontWeight: 700, fontSize: 190, color: '#fff', whiteSpace: 'nowrap', position: 'relative'}}>
              {txt.split('').map((ch, k) => (
                <React.Fragment key={k}>
                  {k === n && <span style={{display: 'inline-block', width: 8, height: 150, margin: '0 -4px', background: C.yellow, verticalAlign: 'middle', opacity: Math.floor(g / 5) % 2 === 0 ? 1 : 0.15}} />}
                  <span style={{color: k >= 16 ? C.yellow : '#fff', opacity: k < n ? 1 : 0, whiteSpace: 'pre'}}>{ch}</span>
                </React.Fragment>
              ))}
              {n >= txt.length && <span style={{display: 'inline-block', width: 8, height: 150, marginLeft: 6, background: C.yellow, verticalAlign: 'middle', opacity: Math.floor(g / 5) % 2 === 0 ? 1 : 0.15}} />}
            </div>
          );
        }}
      </Beat>

      {/* 4. Tus datos son tuyos (letter drop) */}
      <Beat a={126} b={156} exit="scale">
        {(g) => (
          <div style={{display: 'flex', gap: 46, fontFamily: caveat, fontWeight: 700, fontSize: 205, color: '#fff'}}>
            {head.map((word, wi) => (
              <span key={wi} style={{position: 'relative', display: 'inline-flex', color: wi === 3 ? C.yellow : '#fff'}}>
                {word.split('').map((ch, k) => {
                  const idx = head.slice(0, wi).join(' ').length + (wi ? 1 : 0) + k;
                  const s = spr(g, idx * 1.1, {damping: 9, stiffness: 170, mass: 0.6});
                  return (
                    <span key={k} style={{display: 'inline-block', transform: `translateY(${(1 - s) * -220}px) rotate(${(1 - s) * (rnd(idx, 4) - 0.5) * 50}deg)`, opacity: Math.min(1, s * 2), filter: `blur(${(1 - Math.min(1, s)) * 8}px)`}}>
                      {ch}
                    </span>
                  );
                })}
                {wi === 3 && <MarkerLine p={ip(g, 24, 38)} thick={20} style={{top: '84%'}} />}
              </span>
            ))}
          </div>
        )}
      </Beat>

      {/* 5. Pensado para República Dominicana */}
      <Beat a={160} b={400} exit="none">
        {(g) => {
          const e = ip(g, 0, 30);
          return (
            <div style={{position: 'relative', fontFamily: inter, fontWeight: 600, fontSize: 88, color: '#fff', letterSpacing: `${(1 - e) * 6}px`, opacity: e, filter: `blur(${(1 - e) * 14}px)`, transform: `translateY(${(1 - e) * 40}px)`, whiteSpace: 'nowrap'}}>
              Pensado para <span style={{color: C.yellow}}>República Dominicana</span>
              <MarkerLine p={ip(g, 22, 44)} thick={5} style={{top: '96%'}} />
            </div>
          );
        }}
      </Beat>
    </AbsoluteFill>
  );
};
