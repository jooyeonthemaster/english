import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, QUESTION_TYPES } from '../utils/constants';
import {
  fadeIn, fadeOut, beatOpacity, slideUp, slideLeft, slideRight,
  popScale, countUp, stagger, typewriter, progressBar, pulseGlow,
  zoomIn, hookScale, drawLine, wipeIn, getBeatInfo, crossfade,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';
import { Beat0Hook } from './ai-workbench-scene/beats/Beat0Hook';
import { Beat1Workbench } from './ai-workbench-scene/beats/Beat1Workbench';
import { Beat2Passage } from './ai-workbench-scene/beats/Beat2Passage';
import { Beat3Analysis } from './ai-workbench-scene/beats/Beat3Analysis';
import { Beat4TypeSelector } from './ai-workbench-scene/beats/Beat4TypeSelector';
import { Beat5Progress } from './ai-workbench-scene/beats/Beat5Progress';
import { Beat6Question } from './ai-workbench-scene/beats/Beat6Question';
import { Beat7Explanation } from './ai-workbench-scene/beats/Beat7Explanation';
import { Beat8Montage } from './ai-workbench-scene/beats/Beat8Montage';
import { Beat9TypeBurst } from './ai-workbench-scene/beats/Beat9TypeBurst';
import { Beat10Difficulty } from './ai-workbench-scene/beats/Beat10Difficulty';
import { Beat11BatchGen } from './ai-workbench-scene/beats/Beat11BatchGen';
import { Beat12CustomPrompt } from './ai-workbench-scene/beats/Beat12CustomPrompt';
import { Beat13ExamPreview } from './ai-workbench-scene/beats/Beat13ExamPreview';
import { Beat14Docx } from './ai-workbench-scene/beats/Beat14Docx';
import { Beat15Recap } from './ai-workbench-scene/beats/Beat15Recap';

const AIWorkbenchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── Render by beat ───
  return (
    <AbsoluteFill>
      {currentBeat === 0 && <Beat0Hook />}
      {currentBeat === 1 && <Beat1Workbench />}
      {currentBeat === 2 && <Beat2Passage />}
      {currentBeat === 3 && <Beat3Analysis />}
      {currentBeat === 4 && <Beat4TypeSelector />}
      {currentBeat === 5 && <Beat5Progress />}
      {currentBeat === 6 && <Beat6Question />}
      {currentBeat === 7 && <Beat7Explanation />}
      {currentBeat === 8 && <Beat8Montage />}
      {currentBeat === 9 && <Beat9TypeBurst />}
      {currentBeat === 10 && <Beat10Difficulty />}
      {currentBeat === 11 && <Beat11BatchGen />}
      {currentBeat === 12 && <Beat12CustomPrompt />}
      {currentBeat === 13 && <Beat13ExamPreview />}
      {currentBeat === 14 && <Beat14Docx />}
      {currentBeat === 15 && <Beat15Recap />}
    </AbsoluteFill>
  );
};

export default AIWorkbenchScene;
