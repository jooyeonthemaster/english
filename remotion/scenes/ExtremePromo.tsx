import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  spring,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  random,
  Easing,
  Img,
} from 'remotion';
import { COLORS, FONT_FAMILY } from '../utils/constants';

// --- CONFIG ---
export const EXTREME_PROMO_FPS = 30;
export const EXTREME_PROMO_W = 1080;
export const EXTREME_PROMO_H = 1920;

const PASSAGE = `The fast-growing, tremendous amount of data, collected and stored in large and numerous data repositories, has far exceeded our human ability for understanding without powerful tools. As a result, data collected in large data repositories become "data tombs"—data archives that are hardly visited. Important decisions are often made based not on the information-rich data stored in data repositories but rather on a decision maker's instinct, simply because the decision maker does not have the tools to extract the valuable knowledge hidden in the vast amounts of data. Efforts have been made to develop expert system and knowledge-based technologies, which typically rely on users or domain experts to manually input knowledge into knowledge bases. However, this procedure is likely to cause biases and errors and is extremely costly and time consuming. The growing disparity between raw data and meaningful information calls for the systematic development of tools that can turn data tombs into "golden nuggets" of knowledge.`;

const CHUNKS = [
  'The fast-growing, tremendous amount of data, collected and stored in large and numerous data repositories,',
  'has far exceeded our human ability for understanding without powerful tools.',
  'As a result, data collected in large data repositories become "data tombs"',
  '—data archives that are hardly visited.',
  'Important decisions are often made based not on the information-rich data stored in data repositories',
  "but rather on a decision maker's instinct,",
  'simply because the decision maker does not have the tools to extract the valuable knowledge hidden in the vast amounts of data.',
  'Efforts have been made to develop expert system and knowledge-based technologies,',
  'which typically rely on users or domain experts to manually input knowledge into knowledge bases.',
  'However, this procedure is likely to cause biases and errors and is extremely costly and time consuming.',
  'The growing disparity between raw data and meaningful information calls for the systematic development of tools that can turn data tombs into "golden nuggets" of knowledge.'
];

const ALPHABETS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const SHUFFLED_ORDER = [3, 1, 8, 0, 10, 4, 7, 2, 9, 5, 6];

// --- BEATS ---
// 1. Hook (Show Passage) [0 - 120] (4s)
// 2. Shatter [120 - 240] (4s)
// 3. Assign & Stack [240 - 420] (6s)
// 4. Create Question [420 - 540] (4s)
// 5. "하루면 됩니다!" [540 - 660] (4s)
// 6. "말만하세요! 바로 구현!" [660 - 810] (5s)
// 7. Outro [810 - 930] (4s)
export const EXTREME_PROMO_TOTAL = 930;

// --- UTILS ---
const shake = (f: number, amp = 10, speed = 2) => ({
  x: (Math.sin(f * speed) + Math.cos(f * speed * 1.5)) * amp,
  y: (Math.cos(f * speed) + Math.sin(f * speed * 1.2)) * amp,
});

const LogoSticker: React.FC<{ frame: number }> = ({ frame }) => {
  const s = spring({ frame, fps: 30, config: { damping: 10 } });
  return (
    <div style={{
      position: 'absolute', top: 60, left: 60,
      background: COLORS.primary, color: '#FFF',
      padding: '12px 24px', borderRadius: 999,
      fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 28,
      transform: `scale(${s}) rotate(-4deg)`,
      boxShadow: '0 8px 16px rgba(59,130,246,0.3)',
      letterSpacing: '-1px'
    }}>
      NARA AI
    </div>
  );
};

// --- SCENES ---

const Beat1_Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame: frame - 15, fps, config: { damping: 12 } });
  const docSlide = spring({ frame: frame - 30, fps, config: { damping: 14 } });
  const reveal = Math.floor(interpolate(frame, [45, 100], [0, PASSAGE.length], { extrapolateRight: 'clamp' }));

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <LogoSticker frame={frame} />
      
      <div style={{
        position: 'absolute', top: 200, left: 60, right: 60,
        opacity: titleScale, transform: `scale(${0.8 + titleScale * 0.2})`
      }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 80, color: COLORS.textPrimary, lineHeight: 1.1, letterSpacing: '-3px' }}>
          이 정도 지문이 있고,
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 44, color: COLORS.primary, marginTop: 12, letterSpacing: '-1px' }}>
          난이도 극악의 테스트가 필요하다구요?
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 440, left: 60, right: 60, bottom: 100,
        background: '#FFF', borderRadius: 32,
        padding: 50, boxShadow: '0 20px 40px rgba(0,0,0,0.06)',
        border: `2px solid ${COLORS.border}`,
        transform: `translateY(${(1 - docSlide) * 200}px)`,
        opacity: docSlide,
        overflow: 'hidden'
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: 28, lineHeight: 1.6, color: COLORS.textSecondary }}>
          {PASSAGE.slice(0, reveal)}
          {frame % 10 < 5 ? <span style={{ background: COLORS.primary, width: 14, height: 28, display: 'inline-block', verticalAlign: 'middle' }} /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Beat2_Shatter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSp = spring({ frame: frame - 10, fps, config: { damping: 10 } });
  const shatterT = spring({ frame: frame - 30, fps, config: { damping: 14, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ background: COLORS.dark }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: `radial-gradient(circle at center, rgba(59,130,246,0.2) 0%, transparent 70%)`,
      }} />

      <div style={{
        position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center',
        opacity: titleSp, transform: `translateY(${(1 - titleSp) * 50}px)`
      }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 80, color: '#FFF', letterSpacing: '-2px' }}>
          이 문장을 전부 쪼개서
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 40, color: COLORS.emerald, marginTop: 12 }}>
          문장, 절, 구 단위로 완벽하게 분해
        </div>
      </div>

      {CHUNKS.map((c, i) => {
        const dx = (random(`x${i}`) - 0.5) * 1600;
        const dy = (random(`y${i}`) - 0.5) * 1600;
        const dr = (random(`r${i}`) - 0.5) * 120;
        
        const x = interpolate(shatterT, [0, 1], [0, dx]);
        const y = interpolate(shatterT, [0, 1], [0, dy]);
        const r = interpolate(shatterT, [0, 1], [0, dr]);
        const op = interpolate(frame, [30, 40], [0, 1], { extrapolateLeft: 'clamp' });

        return (
          <div key={i} style={{
            position: 'absolute', left: 540 - 300, top: 1000 - 80,
            width: 600, padding: 24,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            border: `2px solid ${COLORS.primary}`,
            fontFamily: 'monospace', fontSize: 20, color: COLORS.dark,
            transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${shatterT * 0.9 + 0.1})`,
            opacity: op
          }}>
            {c}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Beat3_Assign: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSp = spring({ frame: frame - 10, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <div style={{
        position: 'absolute', top: 100, left: 0, right: 0, textAlign: 'center',
        opacity: titleSp, transform: `translateY(${(1 - titleSp) * 50}px)`
      }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 72, color: COLORS.textPrimary, letterSpacing: '-2px' }}>
          순서가 섞인 지문들에
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 64, color: COLORS.primary, marginTop: 12 }}>
          알파벳 자동 할당
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'absolute', top: 350, left: 40, right: 40 }}>
        {SHUFFLED_ORDER.map((originalIdx, i) => {
          const delay = 30 + i * 8;
          const slide = spring({ frame: frame - delay, fps, config: { damping: 12 } });
          const alphaPop = spring({ frame: frame - delay - 10, fps, config: { damping: 10 } });
          
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              background: '#FFF', borderRadius: 16, border: `1px solid ${COLORS.border}`,
              padding: '16px 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
              transform: `translateX(${(1 - slide) * (i % 2 === 0 ? -800 : 800)}px)`,
              opacity: slide
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: 12, background: COLORS.primaryBg, color: COLORS.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 32, flexShrink: 0,
                transform: `scale(${alphaPop})`
              }}>
                {ALPHABETS[i]}
              </div>
              <div style={{ marginLeft: 20, fontFamily: 'monospace', fontSize: 18, color: COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {CHUNKS[originalIdx]}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Beat4_Question: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardSp = spring({ frame: frame - 15, fps, config: { damping: 12 } });
  const textSp = spring({ frame: frame - 30, fps, config: { damping: 10 } });
  const s = shake(frame, frame > 60 ? 4 : 0);

  return (
    <AbsoluteFill style={{ background: COLORS.dark }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 900, height: 1200,
        background: '#FFF', borderRadius: 32,
        transform: `translate(-50%, -50%) scale(${cardSp}) translate(${s.x}px, ${s.y}px)`,
        boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
        padding: 60, display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 36, color: COLORS.primary, marginBottom: 30 }}>
          [문제 12] 극악 난이도 순서 배열
        </div>
        
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 52, color: COLORS.textPrimary, lineHeight: 1.3, marginBottom: 50, opacity: textSp }}>
          다음 지문을 <span style={{ color: COLORS.rose }}>A</span>부터 <span style={{ color: COLORS.rose }}>K</span>까지 문맥에 맞게 올바른 순서대로 배열하시오.
        </div>

        <div style={{ background: COLORS.bg, borderRadius: 20, padding: 30, flex: 1 }}>
          {ALPHABETS.map((a, i) => (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: 18, color: COLORS.textSecondary, marginBottom: 12, opacity: textSp }}>
              <strong style={{ color: COLORS.dark, fontSize: 24, marginRight: 10 }}>({a})</strong> 
              {CHUNKS[SHUFFLED_ORDER[i]].slice(0, 40)}...
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 700, color: COLORS.textPrimary, opacity: textSp }}>
          ① A-B-C-D-E-F-G-H-I-J-K<br/>
          ② D-F-A-C-B-J-I-H-G-E-K<br/>
          ③ C-H-I-E-D-F-K-A-B-J-G<br/>
          ④ B-A-D-C-F-E-H-G-J-I-K<br/>
          ⑤ K-J-I-H-G-F-E-D-C-B-A
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Beat5_Fast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame: frame - 10, fps, config: { damping: 8, stiffness: 200 } });
  const flash = frame % 15 < 3;

  return (
    <AbsoluteFill style={{ background: COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {flash && <AbsoluteFill style={{ background: '#FFF', opacity: 0.2 }} />}
      <div style={{
        fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 140, color: '#FFF',
        textAlign: 'center', lineHeight: 1.1,
        transform: `scale(${pop})`, textShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        하루면<br/>충분합니다!
      </div>
      <div style={{
        position: 'absolute', bottom: 200,
        fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 48, color: COLORS.primaryLight,
        transform: `scale(${pop})`
      }}>
        버튼 클릭 한 번으로 모든 유형 생성
      </div>
    </AbsoluteFill>
  );
};

const Beat6_AnyRequest: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSp = spring({ frame: frame - 10, fps, config: { damping: 10 } });
  
  const requests = [
    "어법상 틀린 것 5개 찾기",
    "영영풀이 매칭 문제",
    "재진술(Paraphrasing) 문제",
    "지문 30% 변형 후 빈칸",
    "서술형 조건부 영작"
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <div style={{
        position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center',
        opacity: titleSp, transform: `translateY(${(1 - titleSp) * 50}px)`
      }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 64, color: COLORS.textPrimary }}>
          이런 것도 필요하시다구요?
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 72, color: COLORS.emerald, marginTop: 16 }}>
          말만 하세요! 바로 구현!
        </div>
      </div>

      <div style={{ position: 'absolute', top: 380, left: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {requests.map((r, i) => {
          const s = spring({ frame: frame - 40 - i * 10, fps, config: { damping: 12 } });
          return (
            <div key={i} style={{
              background: '#FFF', borderRadius: 24, padding: '24px 32px',
              fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 42, color: COLORS.dark,
              border: `2px solid ${COLORS.border}`, boxShadow: '0 10px 20px rgba(0,0,0,0.05)',
              transform: `scale(${s}) translateY(${(1 - s) * 100}px)`,
              opacity: s, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <span>{r}</span>
              <span style={{ color: COLORS.emerald, fontSize: 32 }}>✓ 구현 완료</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Beat7_Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSp = spring({ frame: frame - 15, fps, config: { damping: 10 } });
  const logoSp = spring({ frame: frame - 40, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill style={{ background: COLORS.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 64, color: '#FFF',
        textAlign: 'center', opacity: titleSp, transform: `translateY(${(1 - titleSp) * 50}px)`,
        marginBottom: 80
      }}>
        한번 구현해드리면<br/>
        <span style={{ color: COLORS.emerald }}>계속 사용 가능합니다!</span>
      </div>

      <div style={{
        background: COLORS.primary, borderRadius: 40, padding: '30px 80px',
        fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 80, color: '#FFF',
        transform: `scale(${logoSp})`, boxShadow: '0 20px 60px rgba(59,130,246,0.5)'
      }}>
        NARA AI
      </div>
    </AbsoluteFill>
  );
};

export default function ExtremePromo() {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={120}><Beat1_Hook /></Sequence>
      <Sequence from={120} durationInFrames={120}><Beat2_Shatter /></Sequence>
      <Sequence from={240} durationInFrames={180}><Beat3_Assign /></Sequence>
      <Sequence from={420} durationInFrames={120}><Beat4_Question /></Sequence>
      <Sequence from={540} durationInFrames={120}><Beat5_Fast /></Sequence>
      <Sequence from={660} durationInFrames={150}><Beat6_AnyRequest /></Sequence>
      <Sequence from={810} durationInFrames={120}><Beat7_Outro /></Sequence>
    </AbsoluteFill>
  );
}
