import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Series,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  BookOpen,
  Braces,
  Check,
  CheckCircle2,
  Download,
  FileText,
  ListOrdered,
  MessageSquare,
  PenTool,
  Plus,
  Scissors,
  Shuffle,
  Sparkles,
  Target,
  Wand2,
  Zap,
} from 'lucide-react';

const FONT =
  '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Consolas, "Courier New", monospace';

export const SMOAT_PROMO_FPS = 30;
export const SMOAT_PROMO_W = 1080;
export const SMOAT_PROMO_H = 1920;

const BEATS = [150, 210, 210, 165, 330, 210];
export const SMOAT_PROMO_TOTAL = BEATS.reduce((sum, beat) => sum + beat, 0);

const C = {
  bg: '#f8fafc',
  surface: '#ffffff',
  line: '#e2e8f0',
  text: '#0f172a',
  sub: '#64748b',
  muted: '#94a3b8',
  blue: '#2563eb',
  blue2: '#3b82f6',
  blueSoft: '#eff6ff',
  emerald: '#059669',
  emeraldSoft: '#ecfdf5',
  rose: '#e11d48',
  roseSoft: '#fff1f2',
  amber: '#d97706',
  amberSoft: '#fffbeb',
  violet: '#7c3aed',
  violetSoft: '#f5f3ff',
  cyan: '#0891b2',
  cyanSoft: '#ecfeff',
  dark: '#0f172a',
};

const pieces = [
  'The fast-growing, tremendous amount of data, collected and stored in large and numerous data repositories,',
  'has far exceeded our human ability for understanding without powerful tools.',
  'As a result, data collected in large data repositories become "data tombs"',
  'data archives that are hardly visited.',
  'Important decisions are often made based not on the information-rich data stored in data repositories',
  "but rather on a decision maker's instinct,",
  'simply because the decision maker does not have the tools to extract the valuable knowledge hidden in the vast amounts of data.',
  'Efforts have been made to develop expert system and knowledge-based technologies,',
  'which typically rely on users or domain experts to manually input knowledge into knowledge bases.',
  'However, this procedure is likely to cause biases and errors and is extremely costly and time consuming.',
  'The growing disparity between raw data and meaningful information calls for the systematic development of tools that can turn data tombs into "golden nuggets" of knowledge.',
];

const letters = 'ABCDEFGHIJK'.split('');
const shuffledIndexes = [6, 1, 9, 4, 10, 0, 7, 2, 8, 5, 3];
const shuffledPieces = shuffledIndexes.map((pieceIndex, labelIndex) => ({
  label: letters[labelIndex],
  sourceIndex: pieceIndex,
  text: pieces[pieceIndex],
}));
const correctOrder = pieces
  .map((_, sourceIndex) => shuffledPieces.find((piece) => piece.sourceIndex === sourceIndex)?.label)
  .join(' - ');

const featureGroups = [
  [
    ['문장 삽입 1-7', '연결어/지시어 단서로 삽입 위치 자동 생성', C.violet, Wand2],
    ['빈칸 추론 변형', '본문 복붙 금지, 보기까지 패러프레이징', C.rose, Target],
    ['어법/어휘 함정', '수일치, 관계사, 분사, 병렬 구조 압축', C.amber, Braces],
  ],
  [
    ['무관한 문장', '비슷한 어휘로 위장한 흐름 이탈 문장', C.cyan, Shuffle],
    ['요약문 완성', '핵심어 두 칸을 비운 서술형/객관식 변형', C.emerald, BookOpen],
    ['조건부 영작', '조건, 단어 수, 구조 변형까지 반영', C.blue, PenTool],
  ],
  [
    ['배열 영작', '단어를 섞고 정답 문장을 자동 복구', C.rose, ListOrdered],
    ['학교별 템플릿', '우리 학교 내신 스타일로 저장', C.violet, FileText],
    ['원장님 전용 기능', '구독 중 필요한 기능을 바로 추가', C.emerald, MessageSquare],
  ],
] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const progress = (
  frame: number,
  start: number,
  end: number,
  easing = Easing.out(Easing.cubic),
) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

const useSpringIn = (delay = 0, damping = 13) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 190 } });
};

const AppShell: React.FC<{ children: React.ReactNode; label?: string }> = ({
  children,
  label = 'SMOAT',
}) => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.35) % 34;

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(37,99,235,0.12) 1px, transparent 0)',
          backgroundSize: '34px 34px',
          backgroundPosition: `${drift}px ${drift}px`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(760px 520px at 18% 0%, rgba(219,234,254,0.78), transparent 64%), radial-gradient(760px 560px at 92% 22%, rgba(236,253,245,0.72), transparent 60%), radial-gradient(760px 520px at 70% 100%, rgba(245,243,255,0.74), transparent 62%)',
        }}
      />
      <TopBar label={label} />
      {children}
    </AbsoluteFill>
  );
};

const TopBar: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      position: 'absolute',
      left: 34,
      right: 34,
      top: 30,
      height: 86,
      borderRadius: 18,
      background: 'rgba(255,255,255,0.92)',
      border: `1px solid ${C.line}`,
      boxShadow: '0 16px 42px rgba(15,23,42,0.08)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 22px',
      zIndex: 20,
    }}
  >
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: 12,
        background: C.blue,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 950,
        fontSize: 18,
        marginRight: 16,
      }}
    >
      YS
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 23, fontWeight: 950, color: C.text }}>SMOAT</div>
      <div style={{ fontSize: 14, fontWeight: 750, color: C.sub }}>영어 내신 자료 제작 전문 솔루션</div>
    </div>
    <div
      style={{
        height: 36,
        borderRadius: 10,
        padding: '0 14px',
        background: C.blueSoft,
        border: '1px solid #bfdbfe',
        color: C.blue,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontWeight: 900,
      }}
    >
      <Sparkles size={15} />
      {label}
    </div>
  </div>
);

const Panel: React.FC<{
  children: React.ReactNode;
  x: number;
  y: number;
  w: number;
  h: number;
  delay?: number;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ children, x, y, w, h, delay = 0, accent = C.blue, style }) => {
  const s = useSpringIn(delay);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 22,
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow: '0 22px 56px rgba(15,23,42,0.10)',
        overflow: 'hidden',
        opacity: s,
        transform: `translateY(${(1 - s) * 42}px) scale(${0.98 + s * 0.02})`,
        ...style,
      }}
    >
      <div style={{ height: 5, background: accent }} />
      {children}
    </div>
  );
};

const Badge: React.FC<{
  text: string;
  color?: string;
  bg?: string;
  icon?: React.ReactNode;
}> = ({ text, color = C.blue, bg = C.blueSoft, icon }) => (
  <span
    style={{
      display: 'inline-flex',
      height: 34,
      alignItems: 'center',
      gap: 7,
      padding: '0 13px',
      borderRadius: 10,
      background: bg,
      border: `1px solid ${color}28`,
      color,
      fontSize: 15,
      fontWeight: 900,
      whiteSpace: 'nowrap',
    }}
  >
    {icon}
    {text}
  </span>
);

const BigTitle: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: number;
  align?: React.CSSProperties['textAlign'];
}> = ({ children, color = C.text, size = 76, align = 'left' }) => (
  <div
    style={{
      fontSize: size,
      lineHeight: 1.08,
      fontWeight: 950,
      letterSpacing: -2,
      color,
      textAlign: align,
      wordBreak: 'keep-all',
    }}
  >
    {children}
  </div>
);

const SplitFirstScene: React.FC = () => {
  const frame = useCurrentFrame();
  const explode = progress(frame, 6, 72, Easing.out(Easing.back(1.12)));
  const headline = useSpringIn(4, 10);

  return (
    <AppShell label="A-K 순서배열">
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 152,
          opacity: headline,
          transform: `translateY(${(1 - headline) * 24}px)`,
        }}
      >
        <Badge text="첫 장면부터 바로 문제" icon={<Zap size={15} />} />
        <div style={{ height: 18 }} />
        <BigTitle size={72}>
          긴 영어 지문이
          <br />
          <span style={{ color: C.blue }}>11개 조각</span>으로 쪼개집니다.
        </BigTitle>
      </div>

      <div style={{ position: 'absolute', inset: 0 }}>
        {pieces.map((piece, index) => {
          const seed = `split-card-${index}`;
          const col = index % 2;
          const row = Math.floor(index / 2);
          const startX = 305 + (random(`${seed}-sx`) - 0.5) * 90;
          const startY = 640 + (random(`${seed}-sy`) - 0.5) * 160;
          const endX = 54 + col * 500 + (random(`${seed}-x`) - 0.5) * 20;
          const endY = 382 + row * 145 + (random(`${seed}-y`) - 0.5) * 14;
          const x = interpolate(explode, [0, 1], [startX, endX]);
          const y = interpolate(explode, [0, 1], [startY, endY]);
          const rot = interpolate(
            explode,
            [0, 1],
            [0, (random(`${seed}-r`) - 0.5) * 4],
          );
          const active = progress(frame, 8 + index * 2, 22 + index * 2);
          const color = [C.blue, C.rose, C.emerald, C.violet, C.amber, C.cyan][index % 6];

          return (
            <div
              key={piece}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 470,
                height: 128,
                borderRadius: 18,
                background: 'white',
                border: `1px solid ${C.line}`,
                boxShadow: `0 14px 34px rgba(15,23,42,0.11), inset 5px 0 0 ${color}`,
                padding: '16px 18px 16px 22px',
                opacity: active,
                transform: `rotate(${rot}deg) scale(${0.82 + explode * 0.18})`,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 950,
                  color,
                  marginBottom: 5,
                  letterSpacing: 0.4,
                }}
              >
                PIECE {String(index + 1).padStart(2, '0')}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1.35, color: C.text, fontWeight: 750 }}>
                {piece.slice(0, 96)}
                {piece.length > 96 ? '...' : ''}
              </div>
            </div>
          );
        })}
      </div>

      <Panel x={54} y={1408} w={972} h={258} delay={74} accent={C.rose}>
        <div style={{ padding: 28, display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: 22,
              background: C.roseSoft,
              color: C.rose,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Scissors size={40} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 950, color: C.sub, marginBottom: 8 }}>
              문장 단위가 아니라
            </div>
            <BigTitle size={48} color={C.rose}>
              의미 덩어리까지 잘게 분해
            </BigTitle>
          </div>
        </div>
      </Panel>
      <ProgressRail />
    </AppShell>
  );
};

const ShuffleQuestionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = useSpringIn(4, 10);

  return (
    <AppShell label="순서배열 문제 생성">
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 148,
          opacity: title,
          transform: `translateY(${(1 - title) * 20}px)`,
        }}
      >
        <Badge text="촤촤촤 섞기 완료" icon={<Shuffle size={15} />} color={C.rose} bg={C.roseSoft} />
        <div style={{ height: 16 }} />
        <BigTitle size={70}>
          섞인 조각에
          <br />
          <span style={{ color: C.blue }}>A부터 K까지</span> 자동 할당
        </BigTitle>
      </div>

      <Panel x={54} y={384} w={972} h={1010} delay={18} accent={C.blue}>
        <div style={{ padding: 22 }}>
          <div
            style={{
              height: 86,
              borderRadius: 18,
              background: C.blueSoft,
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              padding: '0 22px',
              marginBottom: 18,
            }}
          >
            <ListOrdered size={28} color={C.blue} />
            <div style={{ marginLeft: 14, flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 950, color: C.text }}>
                다음 글을 A부터 K까지 순서대로 배열하시오.
              </div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: C.sub }}>
                정답 흐름, 오답 흐름, 해설 근거까지 함께 생성
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {shuffledPieces.map((piece, index) => {
              const inP = progress(frame, 38 + index * 7, 58 + index * 7);
              const color = [C.blue, C.rose, C.violet, C.amber, C.emerald, C.cyan][index % 6];
              return (
                <div
                  key={piece.label}
                  style={{
                    height: 64,
                    borderRadius: 14,
                    background: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                    border: `1px solid ${C.line}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '0 14px',
                    opacity: inP,
                    transform: `translateX(${(1 - inP) * (index % 2 ? 70 : -70)}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 13,
                      background: `${color}18`,
                      color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 950,
                      flexShrink: 0,
                    }}
                  >
                    {piece.label}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 14,
                      lineHeight: 1.22,
                      color: C.text,
                      fontWeight: 750,
                    }}
                  >
                    {piece.text.slice(0, 104)}
                    {piece.text.length > 104 ? '...' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel x={54} y={1434} w={972} h={250} delay={108} accent={C.emerald}>
        <div style={{ padding: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
            <CheckCircle2 size={24} color={C.emerald} />
            <div style={{ fontSize: 23, fontWeight: 950, color: C.text }}>정답 순서 자동 계산</div>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 30,
              lineHeight: 1.4,
              color: C.emerald,
              fontWeight: 950,
              wordBreak: 'keep-all',
            }}
          >
            {correctOrder}
          </div>
        </div>
      </Panel>
      <ProgressRail />
    </AppShell>
  );
};

const ExamPreviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sheet = useSpringIn(10, 12);

  return (
    <AppShell label="시험지 미리보기">
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 150,
          opacity: useSpringIn(2),
        }}
      >
        <Badge text="실전 시험지 미리보기" icon={<FileText size={15} />} />
        <div style={{ height: 14 }} />
        <BigTitle size={62}>
          A-K 순서배열 문항
          <br />
          <span style={{ color: C.blue }}>크게 바로 완성</span>
        </BigTitle>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 332,
          height: 1260,
          borderRadius: 30,
          background: 'white',
          border: `1px solid ${C.line}`,
          boxShadow: '0 30px 70px rgba(15,23,42,0.16)',
          padding: 30,
          opacity: sheet,
          transform: `translateY(${(1 - sheet) * 52}px) scale(${0.98 + sheet * 0.02})`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottom: `2px solid ${C.dark}`,
            paddingBottom: 18,
            marginBottom: 22,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 4, color: C.blue }}>
              SMOAT
            </div>
            <div style={{ marginTop: 9, fontSize: 36, fontWeight: 950, color: C.text }}>
              고2 영어 내신 킬러 테스트
            </div>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.8, fontWeight: 850, color: C.text }}>
            학교
            <br />
            반
            <br />
            이름
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Badge text="문제 17" color={C.rose} bg={C.roseSoft} />
          <Badge text="난이도 최상" color={C.amber} bg={C.amberSoft} />
          <Badge text="A-K 11조각" color={C.blue} bg={C.blueSoft} />
        </div>

        <div style={{ fontSize: 34, lineHeight: 1.25, fontWeight: 950, color: C.text, marginBottom: 22 }}>
          다음 글의 흐름에 맞게 A부터 K까지 문단을 순서대로 배열하시오.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {shuffledPieces.map((piece, index) => {
            const appear = progress(frame, 48 + index * 5, 66 + index * 5);
            return (
              <div
                key={piece.label}
                style={{
                  minHeight: 90,
                  borderRadius: 12,
                  background: index % 2 ? '#ffffff' : '#f8fafc',
                  border: `1px solid ${C.line}`,
                  padding: '12px 12px',
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 14}px)`,
                }}
              >
                <span style={{ fontSize: 22, fontWeight: 950, color: C.blue }}>
                  ({piece.label}){' '}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 14, lineHeight: 1.34, fontWeight: 760, color: C.text }}>
                  {piece.text.slice(0, 74)}
                  {piece.text.length > 74 ? '...' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 24,
            borderRadius: 16,
            border: `1.5px dashed ${C.rose}`,
            background: C.roseSoft,
            padding: '20px 22px',
            fontFamily: MONO,
            fontSize: 23,
            lineHeight: 1.5,
            fontWeight: 950,
            color: C.text,
          }}
        >
          1. {correctOrder}
          <br />
          2. B - F - H - K - D - J - A - G - I - C - E
          <br />
          3. F - B - K - H - D - A - J - G - C - I - E
          <br />
          4. A - B - C - D - E - F - G - H - I - J - K
          <br />
          5. K - J - I - H - G - F - E - D - C - B - A
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          bottom: 54,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
        }}
      >
        {[
          ['PDF 출력', C.blue, Download],
          ['DOCX 편집', C.emerald, FileText],
          ['정답/해설 포함', C.violet, CheckCircle2],
        ].map(([label, color, Icon], index) => {
          const s = progress(frame, 124 + index * 8, 142 + index * 8);
          const TypedIcon = Icon as typeof FileText;
          return (
            <div
              key={label as string}
              style={{
                height: 80,
                borderRadius: 18,
                background: `${color}14`,
                border: `1px solid ${color}33`,
                color: color as string,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: 20,
                fontWeight: 950,
                opacity: s,
                transform: `translateY(${(1 - s) * 22}px)`,
              }}
            >
              <TypedIcon size={22} />
              {label as string}
            </div>
          );
        })}
      </div>
      <ProgressRail />
    </AppShell>
  );
};

const OneDayScene: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = useSpringIn(8, 7);
  const button = useSpringIn(76, 10);

  return (
    <AppShell label="바로 구현">
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 54 }}>
        <div style={{ transform: `scale(${0.72 + pop * 0.28})`, textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 950, color: C.sub, marginBottom: 18 }}>
            이런 순서배열 테스트지가 필요하다구요?
          </div>
          <div style={{ fontSize: 104, lineHeight: 1.04, fontWeight: 950, color: C.text, letterSpacing: -3 }}>
            하루면
            <br />
            됩니다.
          </div>
        </div>

        <div
          style={{
            marginTop: 58,
            width: '100%',
            height: 112,
            borderRadius: 24,
            background: C.blue,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            fontSize: 34,
            fontWeight: 950,
            boxShadow: '0 24px 48px rgba(37,99,235,0.28)',
            opacity: button,
            transform: `translateY(${(1 - button) * 38}px)`,
          }}
        >
          <Wand2 size={34} />
          말만 하세요. 바로 붙입니다.
        </div>
      </AbsoluteFill>
      <ProgressRail />
    </AppShell>
  );
};

const FeatureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const groupIndex = Math.min(2, Math.floor(frame / 110));
  const local = frame - groupIndex * 110;
  const group = featureGroups[groupIndex];

  return (
    <AppShell label="기능 추가">
      <div style={{ position: 'absolute', left: 54, right: 54, top: 150 }}>
        <Badge text="기능 카드 크게 보기" icon={<Plus size={15} />} color={C.emerald} bg={C.emeraldSoft} />
        <div style={{ height: 14 }} />
        <BigTitle size={66}>
          설마 이런 것까지?
          <br />
          <span style={{ color: C.emerald }}>네. 붙여드립니다.</span>
        </BigTitle>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 388,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {group.map(([title, desc, color, Icon], index) => {
          const s = spring({
            frame: local - index * 12,
            fps: SMOAT_PROMO_FPS,
            config: { damping: 11, stiffness: 190 },
          });
          const TypedIcon = Icon as typeof FileText;
          return (
            <div
              key={title}
              style={{
                minHeight: 250,
                borderRadius: 26,
                background: 'white',
                border: `1px solid ${C.line}`,
                boxShadow: '0 22px 56px rgba(15,23,42,0.10)',
                padding: 28,
                display: 'grid',
                gridTemplateColumns: '94px 1fr',
                gap: 22,
                opacity: s,
                transform: `translateY(${(1 - s) * 44}px) scale(${0.98 + s * 0.02})`,
              }}
            >
              <div
                style={{
                  width: 94,
                  height: 94,
                  borderRadius: 24,
                  background: `${color}16`,
                  color: color as string,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TypedIcon size={46} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 20, fontWeight: 950, color: color as string }}>
                    FEATURE {groupIndex * 3 + index + 1}
                  </div>
                  <Badge text="구현 가능" color={C.emerald} bg={C.emeraldSoft} icon={<Check size={14} />} />
                </div>
                <div style={{ fontSize: 42, lineHeight: 1.15, fontWeight: 950, color: C.text, marginBottom: 12 }}>
                  {title}
                </div>
                <div style={{ fontSize: 23, lineHeight: 1.34, fontWeight: 800, color: C.sub, wordBreak: 'keep-all' }}>
                  {desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Panel x={54} y={1512} w={972} h={184} delay={18} accent={C.rose}>
        <div style={{ padding: 26, display: 'flex', alignItems: 'center', gap: 20 }}>
          <MessageSquare size={36} color={C.rose} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 950, color: C.text }}>구독 기간 중 필요한 기능이 생기면</div>
            <div style={{ marginTop: 8, fontSize: 40, lineHeight: 1.12, fontWeight: 950, color: C.rose }}>
              원장님 전용 워크플로우로 구현
            </div>
          </div>
        </div>
      </Panel>
      <ProgressRail />
    </AppShell>
  );
};

const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpringIn(8, 8);
  const cards = progress(frame, 74, 122);

  return (
    <AppShell label="SMOAT">
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 54 }}>
        <div style={{ textAlign: 'center', transform: `translateY(-52px) scale(${0.78 + logo * 0.22})`, opacity: logo }}>
          <div style={{ fontSize: 30, fontWeight: 950, color: C.sub, marginBottom: 18 }}>
            당신만을 위한 내신 대비 AI 프로그램
          </div>
          <div style={{ fontSize: 132, lineHeight: 1, fontWeight: 950, color: C.blue, letterSpacing: -3 }}>
            SMOAT
          </div>
          <div style={{ marginTop: 28, fontSize: 52, lineHeight: 1.2, fontWeight: 950, color: C.text, wordBreak: 'keep-all' }}>
            극악 문제 유형도
            <br />
            말하면 바로 구현.
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14, opacity: cards }}>
          {[
            ['한 번 만들면 계속 사용', C.emerald],
            ['시험지 PDF/DOCX까지 연결', C.rose],
            ['원장님 요청 기능 추가 가능', C.blue],
          ].map(([text, color], index) => (
            <div
              key={text}
              style={{
                height: 78,
                borderRadius: 19,
                background: 'white',
                border: `1px solid ${C.line}`,
                boxShadow: '0 14px 36px rgba(15,23,42,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                fontSize: 25,
                fontWeight: 950,
                color: color as string,
                transform: `translateY(${(1 - cards) * (22 + index * 8)}px)`,
              }}
            >
              <CheckCircle2 size={25} />
              {text}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            width: '100%',
            height: 104,
            borderRadius: 24,
            background: C.blue,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            fontSize: 30,
            fontWeight: 950,
            boxShadow: '0 24px 48px rgba(37,99,235,0.28)',
            opacity: progress(frame, 116, 150),
          }}
        >
          <Sparkles size={30} />
          원장님, 구현해달라고 하세요.
        </div>
      </AbsoluteFill>
      <ProgressRail />
    </AppShell>
  );
};

const ProgressRail: React.FC = () => {
  const frame = useCurrentFrame();
  let start = 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 34,
        right: 34,
        bottom: 28,
        height: 8,
        display: 'flex',
        gap: 7,
        zIndex: 80,
      }}
    >
      {BEATS.map((duration, index) => {
        const localStart = start;
        start += duration;
        const p = clamp((frame - localStart) / duration);
        return (
          <div key={index} style={{ flex: 1, borderRadius: 999, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${p * 100}%`,
                height: '100%',
                background: index % 2 === 0 ? C.blue : C.emerald,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

const SmoatNaeshinPromo: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Series>
      <Series.Sequence durationInFrames={BEATS[0]}>
        <SplitFirstScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={BEATS[1]}>
        <ShuffleQuestionScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={BEATS[2]}>
        <ExamPreviewScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={BEATS[3]}>
        <OneDayScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={BEATS[4]}>
        <FeatureScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={BEATS[5]}>
        <FinalScene />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export default SmoatNaeshinPromo;
