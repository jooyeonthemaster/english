// 글의 순서 md 레인 테스트 **픽스처 데이터**. 실행 진입점은 scripts/_test-md-order.ts 다
// (파일 500줄 규약 — 데이터만 여기로 뺐고 검사 로직은 한 줄도 옮기지 않았다).
// 원문 순서: 주어진 글 → B → C → A (정답 순열 (B)-(C)-(A) = ③). 라벨은 제시 순서일
// 뿐 원문 순서가 아니라는 계약을 그대로 재현한다.
import { splitOrderFirstSentence } from "../src/lib/md-qgen/parser-order";

// 픽스처 — 원문 순서: 주어진 글 → B → C → A (정답 순열 (B)-(C)-(A) = ③).
// 라벨은 제시 순서일 뿐 원문 순서가 아니라는 계약을 그대로 재현한다.
export const GIVEN = "In medieval manuscripts the margin was at first a purely practical space. Scribes used it to flag copying errors and to squeeze in words they had accidentally left out.";
export const P_B = "But this narrow role soon widened. Readers began to answer the text rather than merely correct it, and their remarks filled the space that copyists had once reserved for repairs.";
export const P_C = "Later owners read those remarks and answered them in turn. Over several generations the margin therefore carried a slow conversation—each hand replying to a voice it had never met.";
export const P_A = "Modern scholars now mine that layered record for evidence about who actually read a given book. A crowded margin can reveal a whole community of readers whose names appear in no catalogue at all.";

/** 조각을 원문 순서로 이어 붙여 지문을 만든다(무손실 분할 계약의 역방향). */
export const passageOf = (given: string, ...sourceOrdered: string[]) => [given, ...sourceOrdered].join(" ");
export const tailOf = (paragraph: string) => splitOrderFirstSentence(paragraph).tail;
export const headOf = (paragraph: string) => splitOrderFirstSentence(paragraph).head;
export const restate = (paragraph: string, head: string) => `${head} ${tailOf(paragraph)}`;
export const PASSAGE = passageOf(GIVEN, P_B, P_C, P_A);

export const OPTS = ["① (A)-(C)-(B)", "② (B)-(A)-(C)", "③ (B)-(C)-(A)", "④ (C)-(A)-(B)", "⑤ (C)-(B)-(A)"];
export const WRONGS = ["① 지시 대상이 아직 등장하지 않아 첫 이음매부터 끊깁니다.", "② 마지막 단락의 인과가 받을 대상이 없어 끝 이음매가 깨집니다.", "④ 누적된 논평을 가리키는 표현이 그 논평보다 앞서 나옵니다.", "⑤ 시간 진행이 거꾸로 놓여 세대 흐름이 어긋납니다."];
export const EXPLANATION =
  "주어진 글의 오류 교정이라는 좁은 쓰임을 (B)의 첫 문장이 되받아 관행의 확장을 알립니다. (C)가 그 논평의 누적을 세대 단위로 잇고 (A)가 그 누적을 근거로 오늘날의 복원을 말하므로 순서가 하나로 확정됩니다.";

export type OrderLabel = "A" | "B" | "C";
export type Variants = Partial<Record<OrderLabel, string>>;
/** variants: 라벨별 `단락(X,변형):` 줄 — 축자 줄 바로 뒤에 붙는다. */
export interface MdCase {
  given?: string; variants?: Variants; a?: string; b?: string; c?: string;
  options?: string[]; answer?: string; explanation?: string; wrong?: string[];
}
export const LABELS = ["A", "B", "C"] as const;

export function mdOf(o: MdCase = {}): string {
  const bodies: Record<OrderLabel, string> = { A: o.a ?? P_A, B: o.b ?? P_B, C: o.c ?? P_C };
  const paragraphLines = LABELS.flatMap((l) => {
    const variant = o.variants?.[l];
    const exact = `단락(${l}): ${bodies[l]}`;
    return variant ? [exact, `단락(${l},변형): ${variant}`] : [exact];
  });
  return [
    `주어진글: ${o.given ?? GIVEN}`,
    ...paragraphLines,
    ...(o.options ?? OPTS),
    `정답: ${o.answer ?? "③"}`,
    `해설: ${o.explanation ?? EXPLANATION}`,
    ...((o.wrong ?? WRONGS).length > 0 ? ["오답:", ...(o.wrong ?? WRONGS)] : []),
  ].join("\n");
}

export const GOOD = mdOf();

// ── 단락 변형 픽스처 — 첫 문장만 재진술, 2번째 문장부터는 축자 그대로 ───────────
// (B)(C) 첫 문장에는 위치 결정 단서가 박혀 있다 — 역접(But)·시간(soon)·후방참조(this) /
// 시간(Later·in turn)·후방참조(those·them). 변형본도 종류와 방향을 그대로 유지한다.
export const VAR_A_HEAD = "Present-day scholars now dig through that layered record to learn who really opened a given book.";
export const VAR_A = restate(P_A, VAR_A_HEAD);
export const VAR_B = restate(P_B, "Yet such a narrow use soon broadened.");
export const VAR_C = restate(P_C, "Later owners studied those same notes and answered them in turn.");
export const V1: Variants = { A: VAR_A };
export const V2: Variants = { A: VAR_A, B: VAR_B };
export const V3: Variants = { A: VAR_A, B: VAR_B, C: VAR_C };

export const GIVEN_3 = `${GIVEN} The margin was therefore never merely blank paper.`;
export const GIVEN_4 = `${GIVEN_3} Its emptiness was a promise rather than an absence.`;
export const SHORT_C = "Later owners read those remarks and answered them in turn.";
export const FAT_A = `${P_A} The catalogues themselves were compiled centuries later by clerks who never opened the volumes they listed, and their silence about ordinary readers is total.`;
export const CONNECTIVE_A = `However, ${P_A[0].toLowerCase()}${P_A.slice(1)}`;

// ── 적대검수 회귀 픽스처 — 소문자 라벨(fast /giu 등가) · 인용 라벨 면제(fast
// isDirectlyQuoted… 등가) · 'Yet another' 오탐 · 문장 중간 절단 ────────────────────
export const A_TAIL = tailOf(P_A);
export const A_LOWER_LABEL = `${headOf(P_A)} Group (a) shows that a crowded margin can reveal a whole community of readers whose names appear in no catalogue at all.`;
export const A_QUOTED_LABEL = `${headOf(P_A)} One hand wrote "(A)" beside the line, and a crowded margin can reveal a whole community of readers whose names appear in no catalogue at all.`;
export const A_YET_OK = `Yet another kind of reader now mines that layered record for evidence about who actually read a given book. ${A_TAIL}`;
export const A_YET_BAD = `Yet the record they left behind now guides scholars who mine it for evidence about who actually read a given book. ${A_TAIL}`;

// 문장 중간 절단 실증용 별도 지문 — 다른 게이트가 전혀 발화하지 않도록 균형을 맞췄다.
export const SEAM_G = "A city map is never a neutral picture of its streets. Every choice about what to draw begins as an argument about what matters.";
export const SEAM_B = "Early surveyors settled that argument for the merchants who paid them. Their maps swelled with wharves and toll gates. Ordinary lanes shrank to faint scratches because no one billed for them.";
export const SEAM_C = "Later reformers redrew the same ground for public health officers. Their sheets thickened every alley and open drain that the earlier charts had quietly thinned away.";
export const SEAM_A = "Historians now read the two versions against each other for evidence about power. A street that fattens in one decade and vanishes in the next records a shift in who was worth counting.";
export const SEAM_PASSAGE = passageOf(SEAM_G, SEAM_B, SEAM_C, SEAM_A);
// 같은 지문을 '접속사 because 뒤' 에서 자른 분할 — 무손실이지만 문장 한가운데다. 잘린 쪽도
// 완결 문장 2개를 유지해, 다른 게이트가 침묵한 상태에서 **절단선 게이트만이** 이것을 잡는다.
export const MID_B = "Early surveyors settled that argument for the merchants who paid them. Their maps swelled with wharves and toll gates. Ordinary lanes shrank to faint scratches because";
export const MID_C = `no one billed for them. ${SEAM_C}`;

// ── 표시면 회귀 전용 지문 — **머리 문장이 지배적인** 네 조각(축자는 완전 균형이라
// 축자 축의 어떤 검사도 발화하지 않는다). 첫 문장을 0.6~1.7배 안에서만 다시 써도
// 표시면 분량이 무너지는 것을 실증한다. (A)=Z 첫 문장은 연결사도 지시사도 없어
// **어휘 사슬이 유일한 자리 근거**라, 단서 0개 구간의 대체 검사도 여기서 건다.
export const LG_GIVEN = "A ledger and a diary rarely agree about the same week of work. Each book was kept for a different reader and answers a different question.";
export const LG_B = "The mill clerk who balanced those accounts each Friday wrote down only the hours that the owner had agreed to pay. Idle days simply vanished from it.";
export const LG_C = "The weaver who kept the diary counted every hour spent waiting for thread to arrive. Her tally of that idle time runs to whole afternoons that no ledger records for the working day.";
export const LG_A = "Historians now set the two records beside each other for evidence about the working day. A single mismatched entry can expose a storm of unpaid waiting that no ledger ever admits.";
export const LG_PASSAGE = passageOf(LG_GIVEN, LG_B, LG_C, LG_A);
export const LG_EXPL = "장부와 일기가 같은 주를 다르게 적었다는 도입을 (B)가 장부 쪽에서 받습니다. (C)가 빠진 시간을 일기 쪽에서 채우고 (A)가 두 기록을 나란히 놓으므로 순서가 하나로 확정됩니다.";
export const lgMd = (v: Variants = {}) => [`주어진글: ${LG_GIVEN}`, ...LABELS.flatMap((l) => { const b = { A: LG_A, B: LG_B, C: LG_C }[l]; return v[l] ? [`단락(${l}): ${b}`, `단락(${l},변형): ${v[l]}`] : [`단락(${l}): ${b}`]; }), ...OPTS, "정답: ③", `해설: ${LG_EXPL}`, "오답:", ...WRONGS].join("\n");
// 첫 문장 21단어를 0.62배(13단어)로 줄이고 15단어를 1.6배(24단어)로 늘린 조합 — 개별
// 변형은 전부 허용 범위 안인데 표시면은 40/19단어(2.1배)로 무너진다.
export const LG_VAR_A_LONG = restate(LG_A, "Present-day historians who study labour now place the mill ledger and the weaver diary side by side to weigh evidence about the working day.");
export const LG_VAR_B_SHORT = restate(LG_B, "That clerk logged only the paid hours the owner had approved each Friday.");
export const LG_VAR_A_OK = restate(LG_A, "Historians now place the two records beside each other to weigh evidence about a single shift.");
export const LG_VAR_B_OK = restate(LG_B, "That mill clerk logged only the hours which the owner had already agreed to pay for each Friday.");
/** 단서 0개 첫 문장에서 앞 조각과의 어휘 사슬을 전부 지운 재진술. 두 번째 것은 (C)와
 *  겹치는 낱말(ledger·working·day)을 남기지만 전부 **다른 조각에도 있는** 흔한 말이라
 *  자리 근거가 되지 못한다 — 우연한 한 개로 검사가 무력화되던 구멍의 회귀다. */
export const LG_VAR_A_CHAINLESS = restate(LG_A, "Historians now set the two account books beside each other to weigh evidence about a single shift.");
export const LG_VAR_A_GENERIC = restate(LG_A, "Historians now set the two ledgers beside each other for evidence about the working day.");

/** 변형 설정이 켜져도 주어진 글은 축자이며 '지문 맨 앞 1~2문장' 계약을 그대로 받는다. */
export const PASSAGE_4 = passageOf(GIVEN_4, P_B, P_C, P_A);
export const MD_LONG_GIVEN_WITH_VARIANT = mdOf({ given: GIVEN_4, variants: V1 });

// ── 변형본 전용 검사 6종의 반려 픽스처(뒷문장 편집·복사·단서 소실·정박·분량·문장수) ──
export const VAR_TAIL_EDITED = `${VAR_A_HEAD} ${A_TAIL.replace("catalogue", "register")}`;
export const VAR_COPIED = P_A;
// 【계약 완화 26-07-27 · 감독】 종전 판정은 "강한 단서(역접·인과·예시·후방참조) 중
// 하나는 **그대로** 남는가" 였는데, 단서 사전이 유한해서 사전 밖 표현으로 옮긴 정상
// 재진술을 반려했다(실사용 실측: KILLER 글의 순서가 98s 소모 후 1차·2차 같은 사유로
// 사망). 이제는 **단서가 통째로 사라진 경우**만 막는다 — 그건 순서가 정말 결정 불가다.
// 종류는 남고 방향만 뒤집힌 경우는 orderFlippedCue 가 따로 잡으므로 정답 키는 안전하다.
// 아래 두 값은 연결어·지시어·시간 표지를 **하나도** 남기지 않은 진짜 경계 사례다.
export const VAR_B_CUE_LOST = restate(P_B, "Workshops widened the application.");
export const VAR_C_CUE_LOST = restate(P_C, "Owners of the book read the notes and wrote replies.");
export const VAR_B_KEPT: Array<[string, string]> = [["역접이 빠져도 되받기", "Such a narrow use soon broadened."], ["되받기가 빠져도 역접", "Yet the role soon broadened."], ["보조 단서(시간)만 떨어져도", "Yet such a narrow use broadened."], ["사전에 없는 시간 표현('for long')이어도", "But that limited role did not stay narrow for long."]].map(([n, h]) => [n, restate(P_B, h)] as [string, string]);
export const VAR_OFFTOPIC = restate(P_A, "Bananas ripen slowly in warehouses beside the harbor gates each morning.");
export const VAR_OTHER_PARAGRAPH = restate(P_A, "Later owners of that layered record studied those same notes and answered them in turn.");
export const VAR_SOURCE_COPY = restate(P_A, headOf(P_C));
export const VAR_TOO_SHORT = restate(P_A, "Scholars mine records.");
export const VAR_THREE_SENTENCES = restate(P_A, "Scholars dig through that layered record. They ask who read it. They want the given book.");
export const VAR_KOREAN = restate(P_A, "중세 필사본의 여백은 처음에는 순전히 실용적인 공간이었습니다.");
export const VAR_BODY_LABEL = restate(P_A, `(B) ${VAR_A_HEAD}`);
export const VAR_ADDED_CONNECTIVE = restate(P_A, "However, scholars now dig through that layered record to learn who really opened a given book.");
/** 직접 인용된 라벨 토큰은 fast 등가로 면제 — 변형본 경로에도 가드가 있어야 한다. */
export const VAR_QUOTED_LABEL = restate(P_A, 'Present-day scholars now read the mark "(A)" left in that layered record by earlier readers.');

// ── 적대검수 재수리 회귀 픽스처 — 전부 종전 구현에서 CLEAN 통과하던 입력이다 ────
// (1) 방향 뒤집기(종류만 보면 통과·표시면이 정답과 반대 순서 지시) (2) 지시 대상 이동
// ('those remarks'→(B) 를 'those copying errors'→주어진 글 로 2단어 교체 = 복수정답)
// (3) that-되받기 소멸(단서 0개로 보여 무검사이던 구간) (4) 필러 접두·구 덧붙임(암기 대상
// 첫 문장이 바이트 그대로 생존) (5) 변형 줄 순서 번호(축자 줄이면 즉시 반려) (6) 한·영 혼용
// (7) 종결부호 누락(표시면에서 뒷문장과 융합) (8) 축자는 'However' 인데 변형본이 자립화한
// **정상** 입력 — 축자는 고칠 수 없으므로 #10 이 여기서 반려하면 탈출 불가 루프였다.
export const VAR_C_FLIPPED = restate(P_C, "Earlier owners had read those remarks and answered them in turn.");
export const VAR_C_RELOCATED = restate(P_C, "Later owners read those copying errors and answered them in turn.");
export const VAR_A_CHAIN_LOST = restate(P_A, "Scholars today study crowded margins in old books to learn who really opened a given volume.");
export const VAR_A_FILLER = `The evidence has a second life. ${P_A}`;
export const VAR_A_WRAPPED = restate(P_A, `In short, ${headOf(P_A)}`);
export const [VAR_A_NUMBERED, VAR_A_CIRCLED] = [`1. ${VAR_A}`, `② ${VAR_A}`];
export const VAR_A_MIXED = restate(P_A, "Present-day scholars now dig through that layered record 를 통해 who really opened a given book 를 밝혀낸다.");
export const VAR_A_NO_STOP = `${VAR_A_HEAD.slice(0, -1)} ${A_TAIL}`;
export const VAR_A_DECONNECTED = restate(CONNECTIVE_A, VAR_A_HEAD);
// ── 재검증 잔여 결함 회귀(독립 프로브 실증) — #6-b 소문자 고유명사 오탐 · 약어 마침표
// 우회 · 주어진 글 라벨 가드 · #12 정답 미확정 입력의 거짓 동반 진단 ─────────────────
// bOpener: (B) 의 첫 문장만 갈아 끼운 변주 — 지문도 같이 재조립해 무손실 분할을 유지한다.
export const bOpener = (head: string) => `${head} ${P_B.split(". ")[1]}`;
export const LOWER_OPENERS = ["von Neumann's circle behaved no differently.", "de Broglie owned one such volume.", "mRNA studies borrow the same metaphor today."];
export const ABBREV_B = `${SEAM_B} The commission itself had been signed by Prof.`;
export const ABBREV_C = SEAM_C.replace(/^Later reformers/, "Alden Reeve and later reformers");
export const ABBREV_OK_B = `${ABBREV_B} Alden Reeve.`;
export const US_C = `${SEAM_C} Its oldest sheet was drawn for a merchant who had just emigrated to the U.S.`;
export const QUOTE_B = `${SEAM_B} One of them once asked "Who pays for the ink?"`;
export const QUOTE_C = `and then waited for an answer that never came. ${SEAM_C}`;
export const QUOTED_GIVEN = 'A single scribe once wrote "(A)" in the margin of a psalter. That stray token has puzzled cataloguers ever since.';
export const ADJACENT_GIVEN = "Every catalogue entry records a shelfmark such as f(A) beside the title. Cataloguers read that string as an address rather than a description.";

export const DUP_WRONGS = [WRONGS[0], WRONGS[1], "② 같은 번호를 두 번 적은 드리프트입니다.", WRONGS[3]];
