import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {C, easeIO, inter, ip, Mark, spr, Swatch} from './common';

const Icon: React.FC<{k: number}> = ({k}) => {
  const p = {fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  return (
    <svg width={30} height={30} viewBox="0 0 24 24" {...p}>
      {k === 0 && (<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>)}
      {k === 1 && (<><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>)}
      {k === 2 && (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>)}
      {k === 3 && (<><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.5 2 0 0 1-2.5-1.5M12 6v2M12 16v2" /></>)}
      {k === 4 && (<><path d="M4 3v7a2 2 0 0 0 2 2v9M8 3v7M6 3v9M17 21V3c-2 1-4 4-4 8 0 2 1 3 4 3" /></>)}
      {k === 5 && (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>)}
    </svg>
  );
};

const MODS = ['Inscripción', 'Notas', 'Asistencia', 'Finanzas', 'Comedor', 'Portal de tutores'];
const ACC = [C.blue, '#0EA5E9', C.blueD, '#0EA5E9', C.blue, C.blueD];

const ModuleTile: React.FC<{i: number}> = ({i}) => (
  <div
    style={{
      width: 310,
      height: 100,
      borderRadius: 26,
      background: '#fff',
      boxShadow: '0 14px 40px rgba(15,23,42,.14), 0 0 0 1.5px rgba(37,99,235,.10)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '0 22px',
      fontFamily: inter,
      fontWeight: 600,
      fontSize: 27,
      color: C.ink,
      lineHeight: 1.1,
    }}
  >
    <div style={{width: 56, height: 56, borderRadius: 18, background: `linear-gradient(135deg,${ACC[i]},${C.blueD})`, display: 'grid', placeItems: 'center', flex: 'none'}}>
      <Icon k={i} />
    </div>
    {MODS[i]}
  </div>
);

const Phone: React.FC<{src: string; w: number}> = ({src, w}) => {
  const h = (w * 1688) / 780;
  return (
    <div
      style={{
        width: w + 28,
        height: h + 44,
        borderRadius: 54,
        background: 'linear-gradient(145deg,#1E293B,#0B1220)',
        boxShadow: '0 40px 90px rgba(15,23,42,.35), 0 0 0 2px rgba(255,255,255,.12) inset, 0 0 120px rgba(56,189,248,.25)',
        position: 'relative',
      }}
    >
      <div style={{position: 'absolute', left: 14, top: 22, width: w, height: h, borderRadius: 34, overflow: 'hidden', background: '#fff'}}>
        <Img src={staticFile(src)} style={{width: w, height: h, display: 'block'}} />
      </div>
      <div style={{position: 'absolute', left: '50%', top: 8, width: 56, height: 6, marginLeft: -28, borderRadius: 3, background: '#334155'}} />
    </div>
  );
};

const PW = 380;
const PH = (PW * 1688) / 780 + 44;

export const S4: React.FC = () => {
  const f = useCurrentFrame();

  // mark: S3 position -> orbit centre -> corner badge
  const g1 = spr(f, 0, {damping: 16, stiffness: 90, mass: 1});
  const g2 = ip(f, 68, 104, 0, 1, easeIO);
  const mcx = (960 + (100 - 960) * g2);
  const mcy = (676 + (540 - 676) * g1) + (80 - 540) * g2;
  const mh = 300 + (260 - 300) * g1 + (100 - 260) * g2;

  // camera
  const push = ip(f, 92, 150, 0, 1, easeIO);
  const pull = ip(f, 150, 182, 0, 1, easeIO);
  const slow = ip(f, 182, 260, 0, 1, (t) => t);
  const cam = 1 + 0.12 * push - 0.12 * pull + 0.05 * slow;

  // phones
  const p1in = spr(f, 88, {damping: 15, stiffness: 80, mass: 1});
  const slide = spr(f, 152, {damping: 17, stiffness: 90, mass: 1});
  const p1x = 960 + (780 - 960) * slide;
  const p2in = spr(f, 152, {damping: 16, stiffness: 70, mass: 1.1});
  const p2x = 2400 + (1260 - 2400) * p2in;

  const orbitIn = ip(f, 66, 104, 0, 1, easeIO);
  const lane = ip(f, 76, 116, 0, 1, easeIO);
  const ringP = ip(f, 4, 44, 0, 1);
  const ringFade = 1 - ip(f, 70, 98);
  const capP = ip(f, 196, 226);
  const laneDim = 1 - 0.35 * (push - pull);

  return (
    <AbsoluteFill>
      {/* marker orbit ring */}
      <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, opacity: ringFade * 0.8}}>
        <ellipse cx={960} cy={540} rx={640} ry={290} fill="none" stroke={C.yellow} strokeWidth={9} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ringP} transform="rotate(-3 960 540)" />
      </svg>

      {/* back-half tiles (behind mark) */}
      {MODS.map((_, i) => {
        const th = f * 0.024 + (i * Math.PI) / 3 + 0.3;
        const sn = Math.sin(th);
        const ox = 960 + 640 * Math.cos(th);
        const oy = 540 + 290 * sn;
        const lx = (i < 3 ? 270 : 1650) + Math.sin(f / 45 + i) * 8;
        const ly = 260 + (i % 3) * 220 + Math.sin(f / 30 + i * 1.7) * 10;
        const t = lane;
        const x = ox * (1 - t) + lx * t;
        const y = oy * (1 - t) + ly * t;
        const s0 = spr(f, 5 + i * 3, {damping: 13, stiffness: 120, mass: 0.7});
        const sc = (0.82 + 0.22 * (sn + 1) / 2) * (1 - orbitIn) + orbitIn;
        const camL = 1 + (cam - 1) * 0.35;
        // lanes live inside a parallax-scaled layer
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - 155,
              top: y - 50,
              transform: `scale(${sc * s0 * (orbitIn > 0 ? camL : 1)})`,
              zIndex: sn > 0 && t < 0.5 ? 30 : 2,
              opacity: Math.min(1, s0 * 2) * (t > 0 ? laneDim : 1),
              transformOrigin: 'center',
            }}
          >
            <ModuleTile i={i} />
          </div>
        );
      })}

      {/* mark */}
      <div style={{position: 'absolute', left: mcx - (mh * 104) / 380, top: mcy - mh / 2, zIndex: 10, transform: `translateY(${Math.sin(f / 18) * 5}px)`}}>
        <Mark h={mh} />
      </div>

      {/* camera layer: phones */}
      <AbsoluteFill style={{transform: `scale(${cam})`, transformOrigin: "960px 489px", zIndex: 20, perspective: 1800}}>
        {f >= 88 && (
          <div style={{position: 'absolute', left: p1x - (PW + 28) / 2, top: 56 + (1 - p1in) * 900 + Math.sin(f / 26) * 6, opacity: Math.min(1, p1in * 2.5), transform: `rotateY(${(1 - slide) * (-4 + Math.sin(f / 40) * 3)}deg) scale(${0.9 + 0.1 * p1in})`}}>
            <Phone src="portal-tutor.webp" w={PW} />
          </div>
        )}
        {f >= 152 && (
          <div style={{position: 'absolute', left: p2x - (PW + 28) / 2, top: 56 + Math.sin(f / 26 + 1.5) * 6, transform: `rotateY(${(1 - p2in) * 14}deg)`}}>
            <Phone src="portal-tutor-2.webp" w={PW} />
          </div>
        )}
      </AbsoluteFill>

      {/* caption */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 976, textAlign: 'center', zIndex: 40, fontFamily: inter, fontWeight: 600, fontSize: 32, color: C.ink, opacity: capP, transform: `translateY(${(1 - capP) * 20}px)`}}>
        Una plataforma para <Swatch p={ip(f, 212, 240)}>toda la comunidad escolar</Swatch>
      </div>
    </AbsoluteFill>
  );
};
