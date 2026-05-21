import React from 'react';
import {
  AbsoluteFill,
  Series,
  interpolate,
  spring,
  random,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';

const FONT_FAMILY =
  '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const MONO_FAMILY =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

export const ORDER_MEME_FPS = 30;
export const ORDER_MEME_W = 1080;
export const ORDER_MEME_H = 1920;

// ─── BEAT LAYOUT ───────────────────────────────────────────────────────────
//  1 HOOK              90      3.0s
//  2 PASSAGE           150     5.0s
//  3 SHATTER           120     4.0s   (11 pieces fly out)
//  4 LABEL  A→K        180     6.0s
//  5 QUESTION CARD     180     6.0s
//  6 "하루면 됩니다"   120     4.0s
//  7 EXTREME MONTAGE   270     9.0s   (6 types × 45f)
//  8 APPEAL "SMOAT"  210     7.0s
//  9 OUTRO             120     4.0s
const BEATS = [90, 150, 120, 180, 180, 120, 270, 210, 120];
export const ORDER_MEME_TOTAL = BEATS.reduce((a, b) => a + b, 0); // 1440 = 48s

// ────────────────────────────────────────────────────────────────────────────
// PASSAGE — broken into 11 micro-chunks (P anchor + A through K)
// ────────────────────────────────────────────────────────────────────────────
type Chunk = { id: string; body: string };

const ANCHOR: Chunk = {
  id: 'P',
  body:
    'The fast-growing, tremendous amount of data, collected and stored in large and numerous data repositories,',
};

const CHUNKS: Chunk[] = [
  { id: 'A', body: 'has far exceeded our human ability for understanding without powerful tools.' },
  { id: 'B', body: 'As a result, data collected in large data repositories become "data tombs"' },
  { id: 'C', body: '— data archives that are hardly visited.' },
  { id: 'D', body: 'Important decisions are often made based not on the information-rich data stored in data repositories' },
  { id: 'E', body: "but rather on a decision maker's instinct," },
  { id: 'F', body: 'simply because the decision maker does not have the tools to extract the valuable knowledge hidden in the vast amounts of data.' },
  { id: 'G', body: 'Efforts have been made to develop expert system and knowledge-based technologies,' },
  { id: 'H', body: 'which typically rely on users or domain experts to manually input knowledge into knowledge bases.' },
  { id: 'I', body: 'However, this procedure is likely to cause biases and errors and is extremely costly and time consuming.' },
  { id: 'J', body: 'The growing disparity between raw data and meaningful information' },
  { id: 'K', body: 'calls for the systematic development of tools that can turn data tombs into "golden nuggets" of knowledge.' },
];

// fake shuffled visual order (correct sequence is A B C D E F G H I J K)
const SHUFFLED_ORDER = ['F', 'B', 'I', 'D', 'K', 'A', 'H', 'C', 'J', 'E', 'G'];

// ────────────────────────────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────────────────────────────
const easeOutBack = Easing.bezier(0.34, 1.56, 0.64, 1);

const shake = (f: number, amp = 12, seed = 'x') => ({
  x: (random(`${seed}x${Math.floor(f / 2)}`) - 0.5) * amp,
  y: (random(`${seed}y${Math.floor(f / 2)}`) - 0.5) * amp,
});

const GradientBg: React.FC<{
  a: string;
  b: string;
  c?: string;
  rotate?: number;
}> = ({ a, b, c, rotate = 0 }) => (
  <AbsoluteFill
    style={{
      background: c
        ? `linear-gradient(${rotate}deg, ${a} 0%, ${b} 55%, ${c} 100%)`
        : `linear-gradient(${rotate}deg, ${a} 0%, ${b} 100%)`,
    }}
  />
);

const GridBg: React.FC<{ color?: string; size?: number }> = ({
  color = 'rgba(255,255,255,0.07)',
  size = 60,
}) => (
  <AbsoluteFill
    style={{
      backgroundImage: `linear-gradient(${color} 1px, transparent 1px),
        linear-gradient(90deg, ${color} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
    }}
  />
);

const Noise: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const frame = useCurrentFrame();
  const dots = React.useMemo(
    () =>
      new Array(80).fill(0).map((_, i) => ({
        x: random(`n${i}`) * 1080,
        y: random(`m${i}`) * 1920,
        r: 1 + random(`r${i}`) * 2,
      })),
    [],
  );
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'screen' }}>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.x,
            top: (d.y + ((frame + i * 7) % 60) * 4) % 1920,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)',
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const Ticker: React.FC<{
  text: string;
  y: number;
  speed?: number;
  bg?: string;
  color?: string;
  rotate?: number;
}> = ({ text, y, speed = 5, bg = '#FFF200', color = '#000', rotate = -4 }) => {
  const frame = useCurrentFrame();
  const offset = (frame * speed) % 1600;
  const repeated = `${text}  ◆  `.repeat(8);
  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: -100,
        right: -100,
        height: 100,
        background: bg,
        transform: `rotate(${rotate}deg)`,
        overflow: 'hidden',
        boxShadow: '0 8px 0 rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          whiteSpace: 'nowrap',
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 52,
          color,
          transform: `translateX(${-offset}px)`,
          letterSpacing: -1,
        }}
      >
        {repeated}
      </div>
    </div>
  );
};

const Stroked: React.FC<{
  text: string;
  size: number;
  color?: string;
  stroke?: string;
  strokeW?: number;
  shadow?: boolean;
  style?: React.CSSProperties;
}> = ({
  text,
  size,
  color = '#FFF',
  stroke = '#000',
  strokeW = 8,
  shadow = true,
  style,
}) => (
  <div
    style={{
      fontFamily: FONT_FAMILY,
      fontWeight: 900,
      fontSize: size,
      color,
      WebkitTextStroke: `${strokeW}px ${stroke}`,
      letterSpacing: -1.5,
      lineHeight: 1.02,
      textShadow: shadow
        ? '0 12px 0 rgba(0,0,0,0.35), 0 24px 40px rgba(0,0,0,0.35)'
        : undefined,
      whiteSpace: 'pre-wrap',
      textAlign: 'center',
      ...style,
    }}
  >
    {text}
  </div>
);

// ────────────────────────────────────────────────────────────────────────────
// BEAT 1 — HOOK
// ────────────────────────────────────────────────────────────────────────────
const HookBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = frame < 4 || (frame > 28 && frame < 32);

  const s1 = spring({ frame, fps, config: { damping: 8, stiffness: 240 } });
  const s2 = spring({ frame: frame - 22, fps, config: { damping: 8, stiffness: 240 } });
  const s3 = spring({ frame: frame - 50, fps, config: { damping: 9, stiffness: 200 } });
  const sk = shake(frame, frame < 70 ? 7 : 2);

  return (
    <AbsoluteFill>
      <GradientBg a="#0B0F1F" b="#1A0B2E" c="#0B0F1F" rotate={140} />
      <GridBg color="rgba(255,255,255,0.05)" />
      <Noise />
      {flash && <AbsoluteFill style={{ background: '#FF1F6B', opacity: 0.85 }} />}

      <Ticker text="11조각 ◆ 어법오류개수 ◆ 영영풀이 ◆ 재진술 ◆ 한단어요약" y={140} speed={6} bg="#FFF200" rotate={-6} />
      <Ticker text="내신 ◆ 1등급 ◆ SMOAT ◆ 24시간 납품" y={1720} speed={5} bg="#22D3EE" color="#0B0F1F" rotate={4} />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate(${sk.x}px, ${sk.y}px)`,
        }}
      >
        <div
          style={{
            transform: `scale(${0.4 + s1 * 0.6}) rotate(${-6 + s1 * 6}deg)`,
            marginBottom: 30,
          }}
        >
          <div
            style={{
              padding: '20px 60px',
              background: '#FF1F6B',
              borderRadius: 999,
              border: '6px solid #000',
              boxShadow: '12px 12px 0 #000',
              fontFamily: FONT_FAMILY,
              fontWeight: 900,
              fontSize: 64,
              color: '#FFF',
              letterSpacing: -1,
              WebkitTextStroke: '2px #000',
            }}
          >
            원장님, 잠깐.
          </div>
        </div>

        <div style={{ opacity: s2, transform: `scale(${0.5 + s2 * 0.5})` }}>
          <Stroked text={'영어 지문 하나로\n시험지 한 부…'} size={130} color="#FFF200" strokeW={14} />
        </div>

        <div
          style={{
            marginTop: 40,
            opacity: s3,
            transform: `scale(${0.6 + s3 * 0.4}) rotate(${interpolate(
              frame,
              [50, 90],
              [-3, 3],
              { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' },
            )}deg)`,
            padding: '20px 48px',
            background: '#000',
            border: '6px solid #FFF',
            borderRadius: 18,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 64,
            color: '#22D3EE',
            letterSpacing: -2,
            boxShadow: '0 0 60px #22D3EE',
          }}
        >
          SMOAT가 끝장냅니다
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// BEAT 2 — PASSAGE
// ────────────────────────────────────────────────────────────────────────────
const PassageBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fullText = [ANCHOR, ...CHUNKS].map((c) => c.body).join(' ');
  const reveal = Math.floor(
    interpolate(frame, [0, 110], [0, fullText.length], {
      extrapolateRight: 'clamp',
    }),
  );

  const headerSp = spring({ frame, fps, config: { damping: 10 } });
  const tagSp = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  const sk = shake(frame, frame > 100 ? 14 : 4, 'p');

  return (
    <AbsoluteFill>
      <GradientBg a="#020617" b="#0F172A" c="#020617" rotate={45} />
      <GridBg color="rgba(34,211,238,0.10)" size={80} />

      <div
        style={{
          position: 'absolute',
          top: 40,
          right: 40,
          padding: '12px 28px',
          background: '#22D3EE',
          color: '#000',
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 32,
          transform: `rotate(8deg) scale(${tagSp})`,
          border: '4px solid #000',
          boxShadow: '6px 6px 0 #000',
        }}
      >
        ENG · UCI 데이터마이닝
      </div>

      <div
        style={{
          position: 'absolute',
          top: 130,
          left: 40,
          opacity: headerSp,
          transform: `translateX(${(1 - headerSp) * -40}px)`,
        }}
      >
        <Stroked text="이 지문 한 편이…" size={92} strokeW={10} style={{ textAlign: 'left' }} />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 320,
          left: 50,
          right: 50,
          bottom: 200,
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 24,
          padding: 50,
          fontFamily: MONO_FAMILY,
          fontSize: 30,
          lineHeight: 1.42,
          color: '#0B0F1F',
          boxShadow: '0 30px 80px rgba(34,211,238,0.35)',
          border: '4px solid #000',
          overflow: 'hidden',
          transform: `translate(${sk.x}px, ${sk.y}px)`,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: '#FF1F6B',
            color: '#FFF',
            padding: '6px 18px',
            borderRadius: 999,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 24,
            marginBottom: 22,
            border: '3px solid #000',
          }}
        >
          PASSAGE · 110+ words
        </div>
        <div>
          {fullText.slice(0, reveal)}
          <span
            style={{
              display: 'inline-block',
              width: 16,
              height: 32,
              background: '#FF1F6B',
              verticalAlign: 'middle',
              marginLeft: 4,
              opacity: Math.floor(frame / 6) % 2 === 0 ? 1 : 0,
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 14,
        }}
      >
        {['수능', '내신', '킬러', '11조각'].map((t, i) => (
          <div
            key={i}
            style={{
              padding: '14px 26px',
              background: ['#FFF200', '#22D3EE', '#FF1F6B', '#A78BFA'][i],
              color: i === 2 ? '#FFF' : '#000',
              fontFamily: FONT_FAMILY,
              fontWeight: 900,
              fontSize: 26,
              border: '4px solid #000',
              boxShadow: '6px 6px 0 #000',
              transform: `rotate(${[-3, 2, -2, 3][i]}deg)`,
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// BEAT 3 — SHATTER (11 chunks explode)
// ────────────────────────────────────────────────────────────────────────────
const ShatterBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleSp = spring({ frame, fps, config: { damping: 8 } });
  const start = 28;

  return (
    <AbsoluteFill>
      <GradientBg a="#1A0B2E" b="#0B0F1F" rotate={180} />
      <GridBg color="rgba(255,31,107,0.08)" />
      <Noise opacity={0.08} />
      {frame > start && frame < start + 4 && (
        <AbsoluteFill style={{ background: '#FFF' }} />
      )}

      <div
        style={{
          position: 'absolute',
          top: 100,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: titleSp,
          transform: `scale(${0.6 + titleSp * 0.4})`,
        }}
      >
        <Stroked text="문장 단위로 11조각" size={104} color="#FF1F6B" stroke="#FFF" strokeW={12} />
        <div
          style={{
            marginTop: 14,
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: 44,
            color: '#FFF200',
            letterSpacing: -1,
          }}
        >
          한 문장이 아니라, 절·구 단위까지
        </div>
      </div>

      {[ANCHOR, ...CHUNKS].map((c, i) => {
        const seed = `chunk${i}`;
        const dx = (random(`${seed}dx`) - 0.5) * 1500;
        const dy = (random(`${seed}dy`) - 0.5) * 1300;
        const dr = (random(`${seed}dr`) - 0.5) * 90;
        const p = Math.min(1, Math.max(0, (frame - start) / 60));
        const eased = easeOutBack(p);
        const sx = 540 + dx * eased;
        const sy = 1000 + dy * eased;
        const rot = dr * eased;
        const palette = ['#22D3EE', '#FFF200', '#FF1F6B', '#A78BFA', '#34D399', '#FB923C', '#F472B6', '#60A5FA', '#FBBF24', '#84CC16', '#EC4899', '#06B6D4'];
        const color = palette[i % palette.length];

        return (
          <div
            key={c.id}
            style={{
              position: 'absolute',
              left: sx - 200,
              top: sy - 70,
              width: 400,
              transform: `rotate(${rot}deg)`,
              padding: '12px 18px',
              background: '#FFF',
              border: '5px solid #000',
              borderRadius: 14,
              boxShadow: `8px 8px 0 ${color}`,
              fontFamily: MONO_FAMILY,
              fontSize: 16,
              color: '#0B0F1F',
              opacity: frame > start - 4 ? 1 : 0,
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: 22,
                color,
                marginBottom: 2,
                letterSpacing: -0.5,
              }}
            >
              {c.id === 'P' ? 'ANCHOR' : `PIECE ${c.id}`}
            </div>
            {c.body.slice(0, 70)}
            {c.body.length > 70 ? '…' : ''}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// BEAT 4 — LABEL A→K (compact list view)
// ────────────────────────────────────────────────────────────────────────────
const LabelBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleSp = spring({ frame, fps, config: { damping: 9 } });

  return (
    <AbsoluteFill>
      <GradientBg a="#020617" b="#1E1B4B" c="#020617" rotate={210} />
      <GridBg color="rgba(167,139,250,0.10)" />

      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: titleSp,
        }}
      >
        <Stroked text="A → B → C → … → K" size={104} color="#FFF200" strokeW={12} />
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 38,
            color: '#FFF',
            marginTop: 8,
            letterSpacing: -1,
          }}
        >
          알파벳 11개 전부 자동 할당
        </div>
      </div>

      {/* Anchor */}
      <ChunkRow
        idx={-1}
        delay={6}
        label="P"
        body={ANCHOR.body}
        labelBg="#000"
        labelColor="#FFF200"
        accent="#FFF"
        y={300}
        anchor
      />

      {SHUFFLED_ORDER.map((id, i) => {
        const ch = CHUNKS.find((c) => c.id === id)!;
        const palette = ['#22D3EE', '#FF1F6B', '#34D399', '#FB923C', '#A78BFA', '#F472B6', '#FBBF24', '#60A5FA', '#84CC16', '#06B6D4', '#EC4899'];
        return (
          <ChunkRow
            key={id}
            idx={i}
            delay={20 + i * 7}
            label={`(${'ABCDEFGHIJK'[i]})`}
            body={ch.body}
            labelBg={palette[i]}
            labelColor="#000"
            accent={palette[i]}
            y={440 + i * 120}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const ChunkRow: React.FC<{
  idx: number;
  delay: number;
  label: string;
  body: string;
  labelBg: string;
  labelColor: string;
  accent: string;
  y: number;
  anchor?: boolean;
}> = ({ idx, delay, label, body, labelBg, labelColor, accent, y, anchor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, stiffness: 200 },
  });
  const slideX = (1 - sp) * (idx % 2 === 0 ? -1200 : 1200);
  const stamp = spring({
    frame: frame - delay - 4,
    fps,
    config: { damping: 6, stiffness: 240 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        top: y,
        transform: `translateX(${slideX}px) rotate(${(1 - sp) * 4}deg)`,
        opacity: Math.min(1, sp * 2),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: '#FFF',
          border: '4px solid #000',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: `8px 8px 0 ${accent}`,
          height: anchor ? 130 : 100,
        }}
      >
        <div
          style={{
            background: labelBg,
            color: labelColor,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: anchor ? 56 : 50,
            padding: '0 24px',
            minWidth: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: '4px solid #000',
            letterSpacing: -2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            flex: 1,
            padding: '10px 18px',
            fontFamily: MONO_FAMILY,
            fontSize: anchor ? 18 : 17,
            color: '#0B0F1F',
            lineHeight: 1.32,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {anchor && (
            <div
              style={{
                position: 'absolute',
                top: 6,
                right: 10,
                background: '#000',
                color: '#FFF200',
                padding: '3px 10px',
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: 16,
                borderRadius: 4,
              }}
            >
              제시문 (고정)
            </div>
          )}
          <span>
            {body.slice(0, 130)}
            {body.length > 130 ? '…' : ''}
          </span>
        </div>
      </div>
      {!anchor && stamp > 0.4 && (
        <div
          style={{
            position: 'absolute',
            top: -16,
            right: 24,
            background: '#FFF200',
            border: '3px solid #000',
            padding: '2px 12px',
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 18,
            color: '#000',
            transform: `rotate(${-6 + idx}deg) scale(${stamp})`,
            boxShadow: '3px 3px 0 #000',
          }}
        >
          SHUFFLED
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// BEAT 5 — FULL 11-PIECE QUESTION CARD
// ────────────────────────────────────────────────────────────────────────────
const QuestionBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const paperSp = spring({ frame, fps, config: { damping: 12 } });
  const choicesStart = 70;

  const choices = [
    '① F-B-D-I-C-K-A-H-J-E-G',
    '② B-A-F-C-D-I-G-H-K-J-E',
    '③ A-B-C-D-E-F-G-H-I-J-K',
    '④ D-E-F-A-B-C-K-J-I-H-G',
    '⑤ I-K-D-E-G-A-H-C-B-J-F',
  ];
  const correctIdx = 2;
  const revealCorrect = frame > 140;

  return (
    <AbsoluteFill>
      <GradientBg a="#F8FAFC" b="#E2E8F0" rotate={180} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 70,
          background:
            'repeating-linear-gradient(45deg, #000 0 18px, #FFF200 18px 36px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 70,
          background:
            'repeating-linear-gradient(45deg, #000 0 18px, #FF1F6B 18px 36px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          top: 110,
          bottom: 110,
          background: '#FFF',
          border: '6px solid #000',
          borderRadius: 16,
          boxShadow: '14px 14px 0 #000',
          padding: 36,
          fontFamily: FONT_FAMILY,
          color: '#0B0F1F',
          transform: `translateY(${(1 - paperSp) * 80}px)`,
          opacity: paperSp,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: '#000',
              color: '#FFF200',
              padding: '6px 14px',
              fontWeight: 900,
              fontSize: 24,
              borderRadius: 6,
            }}
          >
            42.
          </div>
          <div
            style={{
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: -1,
              lineHeight: 1.2,
            }}
          >
            다음 글 (P) 다음에 이어질 11개 조각의 순서로 가장 적절한 것은?
          </div>
        </div>

        <div
          style={{
            background: '#F1F5F9',
            border: '3px solid #000',
            padding: '10px 14px',
            fontFamily: MONO_FAMILY,
            fontSize: 17,
            lineHeight: 1.35,
            marginBottom: 12,
            borderRadius: 8,
          }}
        >
          <span style={{ fontWeight: 900, fontFamily: FONT_FAMILY }}>(P) </span>
          {ANCHOR.body}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            marginBottom: 14,
            flex: 1,
          }}
        >
          {SHUFFLED_ORDER.map((id, i) => {
            const ch = CHUNKS.find((c) => c.id === id)!;
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '6px 8px',
                  background: '#FFF',
                  border: '2px solid #000',
                  borderRadius: 6,
                  fontFamily: MONO_FAMILY,
                  fontSize: 13,
                  lineHeight: 1.25,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 900,
                    fontSize: 18,
                    color: ['#0891b2', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#be185d', '#ca8a04', '#2563eb', '#65a30d', '#0891b2', '#9333ea'][i],
                    minWidth: 36,
                  }}
                >
                  ({'ABCDEFGHIJK'[i]})
                </div>
                <div style={{ flex: 1 }}>
                  {ch.body.slice(0, 70)}
                  {ch.body.length > 70 ? '…' : ''}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 'auto' }}>
          {choices.map((c, i) => {
            const cs = spring({
              frame: frame - choicesStart - i * 6,
              fps,
              config: { damping: 12 },
            });
            const highlight = revealCorrect && i === correctIdx;
            return (
              <div
                key={i}
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  padding: '6px 12px',
                  marginBottom: 3,
                  background: highlight ? '#FFF200' : 'transparent',
                  border: highlight ? '3px solid #000' : '3px solid transparent',
                  borderRadius: 6,
                  opacity: cs,
                  transform: `translateX(${(1 - cs) * -40}px)`,
                  fontFamily: MONO_FAMILY,
                  position: 'relative',
                  letterSpacing: -0.5,
                }}
              >
                {c}
                {highlight && (
                  <div
                    style={{
                      position: 'absolute',
                      right: -8,
                      top: -22,
                      background: '#FF1F6B',
                      color: '#FFF',
                      padding: '4px 14px',
                      borderRadius: 6,
                      fontWeight: 900,
                      fontSize: 20,
                      border: '3px solid #000',
                      transform: `rotate(${Math.sin(frame / 4) * 4}deg)`,
                    }}
                  >
                    정답!
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// BEAT 6 — "하루면 됩니다!"
// ────────────────────────────────────────────────────────────────────────────
const OneDayBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 6, stiffness: 200 } });
  const sk = shake(frame, 18, 'd');
  const burst = Math.floor((frame / 4) % 3);
  const bg = ['#FF1F6B', '#FFF200', '#22D3EE'][burst];

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: bg }} />
      <GridBg color="rgba(0,0,0,0.08)" />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 4000,
          height: 4000,
          marginLeft: -2000,
          marginTop: -2000,
          background:
            'repeating-conic-gradient(rgba(255,255,255,0.4) 0deg 8deg, transparent 8deg 16deg)',
          transform: `rotate(${frame * 2}deg)`,
          opacity: 0.55,
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate(${sk.x}px, ${sk.y}px)`,
        }}
      >
        <div style={{ transform: `scale(${sp})` }}>
          <Stroked text="하루면" size={300} color="#FFF" strokeW={18} />
          <Stroked
            text="됩니다."
            size={300}
            color="#000"
            stroke="#FFF200"
            strokeW={14}
            style={{ marginTop: -40 }}
          />
        </div>
        <div
          style={{
            marginTop: 30,
            padding: '20px 50px',
            background: '#000',
            border: '6px solid #FFF',
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 46,
            color: '#FFF',
            letterSpacing: -1,
            transform: `rotate(${Math.sin(frame / 5) * 3}deg)`,
            boxShadow: '0 0 60px rgba(0,0,0,0.5)',
          }}
        >
          24시간 납품 ◆ 즉시 사용
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// BEAT 7 — EXTREME MONTAGE  (6 types × 45 frames = 270f)
// ────────────────────────────────────────────────────────────────────────────
type Slide = {
  title: string;
  subtitle: string;
  tagline: string;
  bg: string;
  demo: React.ReactNode;
};

const ALL_GRAMMAR_FRAGMENT =
  'Efforts have been made to developing expert system and knowledge-based technologies, which typically relies on users or domain experts manually input knowledge into knowledge bases. However, this procedure are likely to cause biases and errors and is extremely costly and time consuming.';

const EXTREME_SLIDES: Slide[] = [
  // ── 1. 어법 오류 "개수 + 위치" 단서 ZERO
  {
    title: '어법 오류 개수',
    subtitle: 'ERROR COUNT · NO HINTS',
    tagline:
      '밑줄 없음 · 어법 틀린 부분을 본문에서 직접 찾아 개수 + 위치 + 수정형',
    bg: '#FB7185',
    demo: (
      <div
        style={{
          background: '#FFF',
          border: '5px solid #000',
          padding: 24,
          borderRadius: 16,
          fontFamily: MONO_FAMILY,
          fontSize: 22,
          lineHeight: 1.55,
          maxWidth: 960,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: '#000',
            color: '#FFF200',
            padding: '6px 12px',
            fontFamily: FONT_FAMILY,
            fontSize: 18,
            fontWeight: 900,
            marginBottom: 12,
          }}
        >
          어법상 어색한 곳을 ALL 찾아 고치시오
        </div>
        <div>
          Efforts have been made to{' '}
          <u style={{ background: '#FECACA', textDecorationColor: '#DC2626', textDecorationThickness: 3 }}>
            developing
          </u>{' '}
          expert system and knowledge-based technologies, which typically{' '}
          <u style={{ background: '#FECACA', textDecorationColor: '#DC2626', textDecorationThickness: 3 }}>
            relies
          </u>{' '}
          on users or domain experts{' '}
          <u style={{ background: '#FECACA', textDecorationColor: '#DC2626', textDecorationThickness: 3 }}>
            manually input
          </u>{' '}
          knowledge into knowledge bases. However, this procedure{' '}
          <u style={{ background: '#FECACA', textDecorationColor: '#DC2626', textDecorationThickness: 3 }}>
            are
          </u>{' '}
          likely to cause biases and errors.
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 22,
            background: '#FFF200',
            display: 'inline-block',
            padding: '6px 14px',
            border: '3px solid #000',
          }}
        >
          정답: 4곳 / develop · rely · to manually input · is
        </div>
      </div>
    ),
  },
  // ── 2. 영영풀이 7개 일괄 매칭
  {
    title: '영영풀이 일괄',
    subtitle: 'ENG-ENG MATCHING × 7',
    tagline:
      '본문 어디서도 영영풀이 그대로 노출 X · 추론해서 본문 어휘에 직접 매칭',
    bg: '#A78BFA',
    demo: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 980,
        }}
      >
        {[
          ['extremely large in amount', '→ tremendous'],
          ['to be greater than what is needed', '→ exceed'],
          ['places where things are stored', '→ repositories'],
          ['a strong feeling without thinking', '→ instinct'],
          ['favoring one side unfairly', '→ bias'],
          ['the difference between two things', '→ disparity'],
          ['a small piece of pure gold', '→ nugget'],
        ].map(([def, ans], i) => (
          <div
            key={i}
            style={{
              background: '#FFF',
              border: '3px solid #000',
              padding: '8px 14px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: MONO_FAMILY,
              fontSize: 20,
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: 20,
                minWidth: 28,
              }}
            >
              {i + 1}.
            </div>
            <div style={{ flex: 1 }}>{def}</div>
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                color: '#7C3AED',
                background: '#EDE9FE',
                padding: '2px 10px',
                border: '2px solid #7C3AED',
                borderRadius: 6,
              }}
            >
              {ans}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  // ── 3. 한 단어 요약
  {
    title: '한 단어로 요약',
    subtitle: 'ONE-WORD SUMMARY',
    tagline:
      '본문 전체를 단 한 단어로 요약 · 어형 변화 허용 · 본문 표현 그대로 쓰면 0점',
    bg: '#FFF200',
    demo: (
      <div
        style={{
          background: '#FFF',
          border: '5px solid #000',
          padding: 32,
          borderRadius: 16,
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          maxWidth: 960,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 16, fontSize: 26 }}>
          〈문제〉 윗글의 핵심을 한 단어(영어)로 쓰시오.
          <div
            style={{
              marginTop: 8,
              fontSize: 18,
              color: '#64748B',
              fontWeight: 700,
            }}
          >
            ※ 본문에 등장한 단어 그대로 사용 시 0점
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 18,
          }}
        >
          <span
            style={{
              fontFamily: MONO_FAMILY,
              fontSize: 28,
              borderBottom: '5px solid #000',
              padding: '6px 80px',
              background: '#FEF08A',
              fontWeight: 900,
              letterSpacing: 4,
            }}
          >
            automation
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              background: '#000',
              color: '#FFF',
              padding: '6px 14px',
              borderRadius: 6,
            }}
          >
            ← AI 채점 OK
          </span>
        </div>
      </div>
    ),
  },
  // ── 4. 조건 영작 (단어 묶음 + 어형변화 + 단어추가)
  {
    title: '조건 영작',
    subtitle: 'CONSTRAINED WRITING',
    tagline:
      '주어진 단어 묶음 배열 + 일부 어형 변화 + 단어 1~2개 추가 가능',
    bg: '#34D399',
    demo: (
      <div
        style={{
          background: '#FFF',
          border: '5px solid #000',
          padding: 26,
          borderRadius: 16,
          fontFamily: FONT_FAMILY,
          fontSize: 24,
          maxWidth: 960,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 24 }}>
          〈우리말〉 그 격차는 도구의 체계적인 개발을 요구한다.
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 14,
          }}
        >
          {[
            'disparity',
            'systematic',
            'call',
            'tool',
            'develop',
            'the',
            'for',
          ].map((w) => (
            <span
              key={w}
              style={{
                padding: '4px 12px',
                background: '#DCFCE7',
                border: '3px solid #000',
                borderRadius: 8,
                fontFamily: MONO_FAMILY,
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              {w}
            </span>
          ))}
        </div>
        <div
          style={{
            fontFamily: MONO_FAMILY,
            fontSize: 20,
            background: '#F1F5F9',
            border: '3px dashed #000',
            padding: 12,
            marginBottom: 10,
          }}
        >
          The disparity{' '}
          <span style={{ background: '#FFF200', padding: '0 8px', fontWeight: 900 }}>
            calls for
          </span>{' '}
          the{' '}
          <span style={{ background: '#FFF200', padding: '0 8px', fontWeight: 900 }}>
            systematic
          </span>{' '}
          <span style={{ background: '#FFF200', padding: '0 8px', fontWeight: 900 }}>
            development
          </span>{' '}
          of tools.
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            background: '#000',
            color: '#FFF200',
            display: 'inline-block',
            padding: '6px 12px',
          }}
        >
          ※ develop → development, call → calls (어형변화 강제)
        </div>
      </div>
    ),
  },
  // ── 5. 지칭 추론 일괄
  {
    title: '지칭 추론 일괄',
    subtitle: 'REFERENCE × 6',
    tagline:
      '본문 it/they/this/which/that 6개 동시 추적 · 각 지칭 대상을 영문으로 정확 기재',
    bg: '#22D3EE',
    demo: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 980,
        }}
      >
        {[
          ['ⓐ which', 'expert system & knowledge-based technologies'],
          ['ⓑ this procedure', 'manually input knowledge into bases'],
          ['ⓒ it', 'tremendous amount of data'],
          ['ⓓ that', 'data archives hardly visited'],
          ['ⓔ their', 'decision makers'],
          ['ⓕ this', 'the growing disparity'],
        ].map(([k, v], i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 12,
              background: '#FFF',
              border: '3px solid #000',
              padding: '8px 16px',
              borderRadius: 10,
              fontFamily: MONO_FAMILY,
              fontSize: 22,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: 24,
                color: '#0E7490',
                minWidth: 70,
              }}
            >
              {k}
            </div>
            <div style={{ fontWeight: 900, fontSize: 26, color: '#000' }}>→</div>
            <div
              style={{
                flex: 1,
                fontFamily: MONO_FAMILY,
                fontSize: 18,
                background: '#CFFAFE',
                padding: '4px 12px',
                border: '2px solid #0E7490',
                borderRadius: 6,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  // ── 6. 재진술 (Paraphrasing) 강제
  {
    title: '재진술 강제',
    subtitle: 'PARAPHRASE OR ZERO',
    tagline:
      '본문 표현 그대로 = 0점 · 동의어 / 구문 변환 / 태 전환 / 동명사 활용 강제',
    bg: '#FB923C',
    demo: (
      <div
        style={{
          background: '#FFF',
          border: '5px solid #000',
          padding: 22,
          borderRadius: 16,
          fontFamily: FONT_FAMILY,
          fontSize: 22,
          maxWidth: 980,
        }}
      >
        <div
          style={{
            background: '#FECACA',
            border: '3px dashed #DC2626',
            padding: 12,
            marginBottom: 10,
            fontFamily: MONO_FAMILY,
            fontSize: 18,
            textDecoration: 'line-through',
          }}
        >
          본문 그대로: “become data tombs that are hardly visited”
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>↓</div>
        <div
          style={{
            background: '#DCFCE7',
            border: '3px solid #16A34A',
            padding: 12,
            fontFamily: MONO_FAMILY,
            fontSize: 18,
            marginBottom: 12,
          }}
        >
          정답 예시: “turn into rarely-accessed graveyards of records”
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            background: '#000',
            color: '#FFF200',
            display: 'inline-block',
            padding: '6px 12px',
            marginRight: 6,
          }}
        >
          동의어 치환
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            background: '#000',
            color: '#FFF200',
            display: 'inline-block',
            padding: '6px 12px',
            marginRight: 6,
          }}
        >
          관계절 → 분사
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            background: '#000',
            color: '#FFF200',
            display: 'inline-block',
            padding: '6px 12px',
          }}
        >
          품사 전환
        </div>
      </div>
    ),
  },
];

const ExtremeSlideView: React.FC<{ slide: Slide; idx: number }> = ({
  slide,
  idx,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12 } });
  const sp2 = spring({ frame: frame - 6, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ background: slide.bg }}>
      <GridBg color="rgba(0,0,0,0.08)" size={50} />

      {/* corner number */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          right: 40,
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 230,
          color: 'rgba(0,0,0,0.10)',
          lineHeight: 1,
        }}
      >
        0{idx + 1}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 50,
          right: 50,
          transform: `translateY(${(1 - sp) * -60}px)`,
          opacity: sp,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: '#000',
            color: '#FFF',
            padding: '7px 20px',
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 26,
            letterSpacing: 4,
            marginBottom: 10,
          }}
        >
          KILLER {idx + 1} · {slide.subtitle}
        </div>
        <Stroked
          text={slide.title}
          size={170}
          color="#FFF"
          strokeW={13}
          style={{ textAlign: 'left' }}
        />
        <div
          style={{
            marginTop: 12,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 26,
            color: '#000',
            letterSpacing: -1,
            background: 'rgba(255,255,255,0.55)',
            display: 'inline-block',
            padding: '6px 14px',
            borderRadius: 6,
          }}
        >
          {slide.tagline}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 50,
          right: 50,
          top: 720,
          opacity: sp2,
          transform: `translateY(${(1 - sp2) * 40}px)`,
        }}
      >
        {slide.demo}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 50,
          left: 50,
          right: 50,
          padding: '18px 26px',
          background: '#000',
          color: '#FFF200',
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 38,
          textAlign: 'center',
          border: '5px solid #FFF',
          boxShadow: '8px 8px 0 #FFF',
          letterSpacing: -1,
        }}
      >
        설마 이런것까지?? → 됩니다.
      </div>
    </AbsoluteFill>
  );
};

const ExtremeMontage: React.FC = () => (
  <Series>
    {EXTREME_SLIDES.map((slide, i) => (
      <Series.Sequence key={i} durationInFrames={45}>
        <ExtremeSlideView slide={slide} idx={i} />
      </Series.Sequence>
    ))}
  </Series>
);

// ────────────────────────────────────────────────────────────────────────────
// BEAT 8 — APPEAL  ("묻지 마시고… SMOAT")
// ────────────────────────────────────────────────────────────────────────────
const AppealBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const punchAt = (t: number) =>
    spring({ frame: frame - t, fps, config: { damping: 7, stiffness: 240 } });

  return (
    <AbsoluteFill>
      <GradientBg a="#0B0F1F" b="#1A0B2E" c="#0B0F1F" rotate={120} />
      <GridBg color="rgba(255,242,0,0.10)" />
      <Noise opacity={0.07} />

      {/* rotating sun rays */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 2400,
          height: 2400,
          marginLeft: -1200,
          marginTop: -1200,
          background:
            'repeating-conic-gradient(rgba(255,31,107,0.25) 0deg 8deg, transparent 8deg 16deg)',
          transform: `rotate(${frame * 1.5}deg)`,
          opacity: 0.6,
        }}
      />

      {/* 1) "이것도 필요하세요?" */}
      <PunchLine
        text="이것도 필요하세요?"
        y={180}
        sp={punchAt(0)}
        color="#FFF"
        rotate={-3}
        size={92}
      />
      {/* 2) "이것도?" */}
      <PunchLine
        text="이것도?"
        y={320}
        sp={punchAt(14)}
        color="#22D3EE"
        rotate={2}
        size={120}
      />
      {/* 3) "설마 이런것까지???" */}
      <PunchLine
        text="설마 이런것까지??"
        y={490}
        sp={punchAt(30)}
        color="#FFF200"
        rotate={-2}
        size={104}
      />

      {/* 4) "묻지 마세요" big block */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 720,
          textAlign: 'center',
          opacity: punchAt(50),
          transform: `scale(${0.7 + punchAt(50) * 0.3}) rotate(${(1 - punchAt(50)) * -5}deg)`,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: '#000',
            border: '6px solid #FFF',
            padding: '14px 40px',
            borderRadius: 16,
            boxShadow: '12px 12px 0 #FF1F6B',
          }}
        >
          <Stroked text="묻지 마시고," size={120} color="#FFF" strokeW={12} />
        </div>
      </div>

      {/* 5) "구현해달라고 하세요!" */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 920,
          textAlign: 'center',
          opacity: punchAt(70),
          transform: `scale(${0.7 + punchAt(70) * 0.3}) rotate(${(1 - punchAt(70)) * 4}deg)`,
        }}
      >
        <Stroked
          text="구현해 달라 하세요!"
          size={120}
          color="#FFF200"
          strokeW={14}
        />
      </div>

      {/* 6) "바로 구현해드립니다." */}
      <div
        style={{
          position: 'absolute',
          left: 50,
          right: 50,
          top: 1090,
          textAlign: 'center',
          opacity: punchAt(95),
          transform: `scale(${0.6 + punchAt(95) * 0.4})`,
        }}
      >
        <div
          style={{
            background: '#FF1F6B',
            padding: '20px 50px',
            border: '6px solid #000',
            borderRadius: 20,
            boxShadow: '14px 14px 0 #000',
            display: 'inline-block',
          }}
        >
          <Stroked text="바로 구현해드림" size={108} color="#FFF" strokeW={12} />
        </div>
      </div>

      {/* 7) "당신만을 위한 내신 AI" */}
      <div
        style={{
          position: 'absolute',
          left: 50,
          right: 50,
          top: 1290,
          textAlign: 'center',
          opacity: punchAt(125),
          transform: `translateY(${(1 - punchAt(125)) * 60}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 44,
            color: '#FFF',
            letterSpacing: -1,
          }}
        >
          당신만을 위한 내신 대비 AI
        </div>
      </div>

      {/* 8) SMOAT BIG NAME */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 1380,
          textAlign: 'center',
          opacity: punchAt(155),
          transform: `scale(${0.5 + punchAt(155) * 0.5}) rotate(${(1 - punchAt(155)) * 8}deg)`,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: '#FFF200',
            border: '8px solid #000',
            padding: '24px 60px',
            borderRadius: 22,
            boxShadow: '16px 16px 0 #FF1F6B, 32px 32px 0 #22D3EE',
            transform: `rotate(${Math.sin(frame / 6) * 1.5}deg)`,
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 32,
              fontWeight: 900,
              color: '#000',
              letterSpacing: 8,
              marginBottom: 4,
            }}
          >
            그것이 바로
          </div>
          <Stroked
            text="SMOAT"
            size={210}
            color="#000"
            stroke="#FFF"
            strokeW={6}
            shadow={false}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PunchLine: React.FC<{
  text: string;
  y: number;
  sp: number;
  color: string;
  rotate: number;
  size: number;
}> = ({ text, y, sp, color, rotate, size }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: y,
      textAlign: 'center',
      opacity: sp,
      transform: `scale(${0.5 + sp * 0.5}) rotate(${rotate}deg)`,
    }}
  >
    <Stroked text={text} size={size} color={color} strokeW={11} />
  </div>
);

// ────────────────────────────────────────────────────────────────────────────
// BEAT 9 — OUTRO
// ────────────────────────────────────────────────────────────────────────────
const OutroBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame, fps, config: { damping: 9 } });
  const s2 = spring({ frame: frame - 20, fps, config: { damping: 10 } });
  const s3 = spring({ frame: frame - 50, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill>
      <GradientBg a="#020617" b="#1E293B" c="#020617" rotate={45} />
      <GridBg color="rgba(34,211,238,0.10)" size={70} />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '40%',
          width: 1800,
          height: 1800,
          marginLeft: -900,
          marginTop: -900,
          background:
            'radial-gradient(circle, rgba(255,242,0,0.30) 0%, transparent 65%)',
          opacity: s1,
        }}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            opacity: s1,
            transform: `scale(${0.6 + s1 * 0.4})`,
            marginBottom: 24,
          }}
        >
          <Stroked text="한 번 구현되면" size={108} strokeW={12} />
          <Stroked
            text="평생 사용."
            size={170}
            color="#FFF200"
            strokeW={14}
            style={{ marginTop: 6 }}
          />
        </div>

        <div
          style={{
            opacity: s2,
            transform: `translateY(${(1 - s2) * 30}px)`,
            background: '#FFF200',
            border: '6px solid #000',
            padding: '18px 50px',
            borderRadius: 18,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 56,
            color: '#000',
            letterSpacing: -2,
            boxShadow: '12px 12px 0 #000',
            marginTop: 16,
          }}
        >
          SMOAT
        </div>

        <div
          style={{
            marginTop: 24,
            opacity: s3,
            transform: `scale(${0.7 + s3 * 0.3})`,
            background: '#FF1F6B',
            border: '5px solid #000',
            padding: '16px 36px',
            borderRadius: 999,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 36,
            color: '#FFF',
            boxShadow: '10px 10px 0 #000',
          }}
        >
          DM 한 통 → 24시간 안에 시험지
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────
const OrderShuffleMeme: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={BEATS[0]}>
          <HookBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[1]}>
          <PassageBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[2]}>
          <ShatterBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[3]}>
          <LabelBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[4]}>
          <QuestionBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[5]}>
          <OneDayBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[6]}>
          <ExtremeMontage />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[7]}>
          <AppealBeat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={BEATS[8]}>
          <OutroBeat />
        </Series.Sequence>
      </Series>

      <ProgressDots />
    </AbsoluteFill>
  );
};

const ProgressDots: React.FC = () => {
  const frame = useCurrentFrame();
  let acc = 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: 28,
        left: 28,
        right: 28,
        height: 8,
        display: 'flex',
        gap: 6,
        zIndex: 30,
      }}
    >
      {BEATS.map((d, i) => {
        const start = acc;
        acc += d;
        const p = Math.max(0, Math.min(1, (frame - start) / d));
        return (
          <div
            key={i}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.18)',
              borderRadius: 99,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${p * 100}%`,
                background: '#FFF200',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

export default OrderShuffleMeme;
