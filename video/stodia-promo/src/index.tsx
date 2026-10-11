import React from 'react';
import {AbsoluteFill, Composition, registerRoot, Sequence} from 'remotion';
import {CanvasBg, Particles} from './common';
import {S12} from './S12';
import {S3} from './S3';
import {S4} from './S4';
import {S5} from './S5';
import {S6} from './S6';

const Promo: React.FC = () => (
  <AbsoluteFill>
    <CanvasBg />
    <Sequence from={0} durationInFrames={600} style={{isolation: "isolate"}}>
      <Particles count={26} color="#38BDF8" seed={3} opacity={0.45} />
    </Sequence>
    <Sequence from={0} durationInFrames={225} style={{isolation: "isolate"}}><S12 /></Sequence>
    <Sequence from={210} durationInFrames={120} style={{isolation: "isolate"}}><S3 /></Sequence>
    <Sequence from={330} durationInFrames={260} style={{isolation: "isolate"}}><S4 /></Sequence>
    <Sequence from={562} durationInFrames={220} style={{isolation: "isolate"}}><S5 /></Sequence>
    <Sequence from={750} durationInFrames={150} style={{isolation: "isolate"}}><S6 /></Sequence>
  </AbsoluteFill>
);

registerRoot(() => <Composition id="Motion" component={Promo} durationInFrames={900} fps={30} width={1920} height={1080} />);
