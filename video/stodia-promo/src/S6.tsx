import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {C, caveat, easeIO, inter, ip, MarkerLine, Particles, spr} from './common';

export const S6: React.FC = () => {
  const f = useCurrentFrame();
  const reveal = ip(f, 0, 24, 0, 1700, easeIO);
  const drift = Math.sin(f / 50) * 8;

  const wm = spr(f, 8, {damping: 13, stiffness: 100, mass: 0.9});
  const line = ip(f, 30, 66, 0, 1, (t) => t * (2 - t));
  const btn = spr(f, 56, {damping: 11, stiffness: 140, mass: 0.7});
  const url = ip(f, 76, 100);

  // cursor + press
  const curT = ip(f, 84, 104, 0, 1, easeIO);
  const press = f >= 104 && f < 112 ? 0.94 : 1;
  const ripple = ip(f, 104, 134);
  const shine1 = ip(f, 66, 90, -0.4, 1.4, easeIO);
  const shine2 = ip(f, 122, 146, -0.4, 1.4, easeIO);
  const shine = f < 110 ? shine1 : shine2;
  const bobY = Math.sin(f / 28) * 6;

  return (
    <AbsoluteFill style={{clipPath: `circle(${reveal}px at 960px 540px)`, background: 'linear-gradient(135deg,#F8FAFC 0%,#EAF2FF 100%)'}}>
      <div style={{position: 'absolute', left: 1200 + Math.sin(f / 70) * 60, top: -250, width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.30), rgba(56,189,248,0) 65%)'}} />
      <div style={{position: 'absolute', left: -250 + Math.cos(f / 60) * 50, top: 560, width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,224,71,0.35), rgba(253,224,71,0) 65%)'}} />
      <Particles color="#38BDF8" count={26} seed={21} opacity={0.5} />
      <Particles color="#F59E0B" count={12} seed={33} opacity={0.5} />

      <AbsoluteFill style={{transform: `translateY(${drift}px)`}}>
        {/* wordmark */}
        <div style={{position: 'absolute', left: 960 - 330, top: 120 + bobY, width: 660, transform: `scale(${0.7 + 0.3 * wm})`, opacity: Math.min(1, wm * 2), filter: 'drop-shadow(0 12px 30px rgba(15,42,107,.18))'}}>
          <Img src={staticFile('stodia-wordmark.svg')} style={{width: 660, display: 'block'}} />
        </div>

        {/* tagline */}
        <div style={{position: 'absolute', left: 0, right: 0, top: 380, textAlign: 'center'}}>
          <div style={{position: 'relative', display: 'inline-block', fontFamily: caveat, fontWeight: 700, fontSize: 124, color: C.ink, lineHeight: 1.05}}>
            <span style={{display: 'inline-block', clipPath: `inset(-20px ${(1 - line) * 100}% -20px -20px)`}}>Libera el potencial de tu colegio</span>
            <MarkerLine p={ip(f, 62, 86)} thick={8} style={{top: '88%'}} />
            <div style={{position: 'absolute', left: `${line * 100}%`, top: 10, width: 6, height: 100, marginLeft: 4, borderRadius: 3, background: C.blue, opacity: line < 1 ? 0.9 : 0}} />
          </div>
        </div>

        {/* button */}
        <div style={{position: 'absolute', left: 960 - 230, top: 640, width: 460, height: 124, transform: `translateY(${(1 - btn) * 60}px) scale(${(0.6 + 0.4 * btn) * press})`, opacity: Math.min(1, btn * 2)}}>
          <div style={{position: 'absolute', inset: 0, borderRadius: 62, background: `linear-gradient(135deg,${C.blue},${C.blueD})`, boxShadow: '0 22px 50px rgba(37,99,235,.40), 0 0 0 1px rgba(255,255,255,.2) inset', overflow: 'hidden', display: 'grid', placeItems: 'center'}}>
            <div style={{fontFamily: inter, fontWeight: 600, fontSize: 48, color: '#fff', position: 'relative'}}>Solicitar demo</div>
            <div style={{position: 'absolute', top: -20, bottom: -20, width: 110, left: `${shine * 100}%`, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.55), rgba(255,255,255,0))', transform: 'skewX(-20deg)'}} />
          </div>
          {ripple > 0 && ripple < 1 && (
            <div style={{position: 'absolute', left: 230 - 40 - ripple * 330, top: 62 - 40 - ripple * 200, width: 80 + ripple * 660, height: 80 + ripple * 400, borderRadius: '50%', border: `4px solid rgba(37,99,235,${0.5 * (1 - ripple)})`}} />
          )}
        </div>

        {/* cursor */}
        {f >= 84 && (
          <svg width={54} height={54} viewBox="0 0 24 24" style={{position: 'absolute', left: 1340 + (1000 - 1340) * curT, top: 900 + (700 - 900) * curT, opacity: ip(f, 84, 92) * (1 - ip(f, 138, 148)), filter: 'drop-shadow(0 4px 6px rgba(15,23,42,.35))'}}>
            <path d="M3 2 L3 20 L8 15.5 L11.5 22 L14 21 L10.6 14.6 L17 14 Z" fill={C.ink} stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
          </svg>
        )}

        {/* url */}
        <div style={{position: 'absolute', left: 0, right: 0, top: 830, textAlign: 'center', fontFamily: inter, fontWeight: 600, fontSize: 42, color: C.blueD, opacity: url, transform: `translateY(${(1 - url) * 20}px)`, letterSpacing: 1}}>
          stodia.vercel.app
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
