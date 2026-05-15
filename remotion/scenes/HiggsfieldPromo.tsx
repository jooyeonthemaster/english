import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const FONT_FAMILY =
  '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

export const HIGGSFIELD_PROMO_FPS = 30;
export const HIGGSFIELD_PROMO_WIDTH = 1080;
export const HIGGSFIELD_PROMO_HEIGHT = 1920;
export const HIGGSFIELD_CUT_FRAMES = 5 * HIGGSFIELD_PROMO_FPS; // 150
export const HIGGSFIELD_PROMO_TOTAL = HIGGSFIELD_CUT_FRAMES * 8; // 1200 = 40s

type CutDef = {
  label: string;
  badge: string;
  badgeBg: string;
  text: string;
  video: string;
};

const CUTS: CutDef[] = [
  {
    label: '후킹',
    badge: '#FFFFFF',
    badgeBg: '#EF4444',
    text: '쏠북, 너른터, 이그잼포유\n한 곳에 정착 못하는 원장님 주목!',
    video: 'promo/clips/01_hook.mp4',
  },
  {
    label: '무료 독점 이벤트',
    badge: '#FFFFFF',
    badgeBg: '#3B82F6',
    text: '없는 기능이 없는 AI 시험 문제 생성!\n선착순 구별 1팀 무료 독점 진행',
    video: 'promo/clips/02_event.mp4',
  },
  {
    label: '모든 기능',
    badge: '#FFFFFF',
    badgeBg: '#EF4444',
    text: '어떻게 모든 기능이 다 있냐구요?',
    video: 'promo/clips/03_features.mp4',
  },
  {
    label: '커스터마이징',
    badge: '#FFFFFF',
    badgeBg: '#3B82F6',
    text: '학원마다 원하시는 기능을\n커스터마이징 해드리기 때문입니다',
    video: 'promo/clips/04_meeting.mp4',
  },
  {
    label: '고난도 생성',
    badge: '#FFFFFF',
    badgeBg: '#EF4444',
    text: '단어별로 다 찢어서\n어렵게 시험문제를 만들고 싶어요',
    video: 'promo/clips/05_highlighter.mp4',
  },
  {
    label: '어휘 변형',
    badge: '#FFFFFF',
    badgeBg: '#EF4444',
    text: '지문의 어휘를 바꿔서 출제!\n모든 구현·커스터마이징 가능',
    video: 'promo/clips/06_vocab.mp4',
  },
  {
    label: '디자인/로고',
    badge: '#FFFFFF',
    badgeBg: '#10B981',
    text: '한 학원만을 위한 커스터마이징 시험지\n학원 로고까지 박아드립니다',
    video: 'promo/clips/07_design.mp4',
  },
  {
    label: '독점 신청',
    badge: '#FFFFFF',
    badgeBg: '#A855F7',
    text: '구별로 한 학원만\n선착순 독점 신청 받습니다',
    video: 'promo/clips/08_apply.mp4',
  },
];

const SubtitleCard: React.FC<{ cut: CutDef }> = ({ cut }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 9], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [HIGGSFIELD_CUT_FRAMES - 12, HIGGSFIELD_CUT_FRAMES - 2],
    [1, 0],
    { extrapolateLeft: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);
  const lift = interpolate(frame, [0, 12], [40, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 180,
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          width: '88%',
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(20px)',
          borderRadius: 32,
          padding: '36px 40px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: cut.badgeBg,
            color: cut.badge,
            fontSize: 30,
            fontWeight: 800,
            padding: '8px 22px',
            borderRadius: 999,
            marginBottom: 20,
            letterSpacing: '-0.02em',
          }}
        >
          {cut.label}
        </div>
        <div
          style={{
            color: '#FFFFFF',
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: '-0.03em',
            whiteSpace: 'pre-line',
          }}
        >
          {cut.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const BrandWatermark: React.FC = () => (
  <AbsoluteFill
    style={{
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      padding: '60px 56px',
    }}
  >
    <div
      style={{
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        padding: '14px 24px',
        borderRadius: 16,
        fontFamily: FONT_FAMILY,
        fontSize: 28,
        fontWeight: 800,
        color: '#0F172A',
        letterSpacing: '-0.02em',
      }}
    >
      나라<span style={{ color: '#3B82F6' }}>AI</span>
    </div>
  </AbsoluteFill>
);

const CutScene: React.FC<{ cut: CutDef }> = ({ cut }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <OffthreadVideo
        src={staticFile(cut.video)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      <BrandWatermark />
      <SubtitleCard cut={cut} />
    </AbsoluteFill>
  );
};

const HiggsfieldPromo: React.FC = () => {
  return (
    <Series>
      {CUTS.map((cut, i) => (
        <Series.Sequence key={i} durationInFrames={HIGGSFIELD_CUT_FRAMES}>
          <CutScene cut={cut} />
        </Series.Sequence>
      ))}
    </Series>
  );
};

export default HiggsfieldPromo;
