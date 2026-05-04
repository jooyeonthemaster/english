import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT } from '../../../utils/constants';
import { beatOpacity } from '../../../utils/animations';
import { Background } from '../../../components/Background';
import { QuestionTypeCard } from '../components/QuestionTypeCard';

// ─── BEAT 8: Rapid montage of 4 question types ───
export const Beat8Montage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 8);
  const bf = frame - BEAT * 8;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Background variant="gradient" />
      <QuestionTypeCard type="어법 판단" layout="mc" frame={frame} fps={fps} delay={BEAT * 8} />
      <QuestionTypeCard type="순서 배열" layout="order" frame={frame} fps={fps} delay={BEAT * 8 + 22} />
      <QuestionTypeCard type="조건부 영작" layout="writing" frame={frame} fps={fps} delay={BEAT * 8 + 44} />
      <QuestionTypeCard type="문맥 속 의미" layout="vocab" frame={frame} fps={fps} delay={BEAT * 8 + 66} />
    </AbsoluteFill>
  );
};
