// 구제 문항 렌더(RESCUE-SPEC §4.2 renderV2Md 최소판) — 원문 오프셋 모형 → 프로덕션 v2 출력 계약 원문
// (grammar-killer-v2.ts OUTPUT_FORMAT). 인용은 코드가 자른다: 해설 = 정답이 든 표시 문장 전체, 오답 = 밑줄을 포함한
// 연속 10단어 창(문장이 12단어 이하면 문장 전체). 렌더 결과는 **반드시** labParseAndGate(ctx.gate/assemble)로 재게이트한다.
// 분석 문장 코드 검사·템플릿은 §4.7 작가 규칙(10~160자, "다."로 끝, 영어 토큰 ⊆ 지문 ∪ {shown, fix, original}).
import { displayOf, LABELS, type ItemMark, type ItemModel } from "./item-model";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

interface WsTok {
  start: number;
  end: number;
}
function wsTokens(text: string, from: number, to: number): WsTok[] {
  const out: WsTok[] = [];
  const re = /\S+/g;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index < to) out.push({ start: m.index, end: Math.min(m.index + m[0].length, to) });
  return out;
}

/** 표시 텍스트에서 [dStart,dEnd) 가 든 문장 구간(뷰 문장 분할 기준). */
function sentenceSpan(disp: { text: string; view: { sentences: { start: number; end: number }[] } }, dStart: number): { start: number; end: number } {
  const s = disp.view.sentences.find((x) => dStart >= x.start && dStart < x.end) ?? { start: 0, end: disp.text.length };
  const raw = disp.text.slice(s.start, s.end);
  const lead = raw.length - raw.trimStart().length;
  return { start: s.start + lead, end: s.start + raw.trimEnd().length };
}

/** 오답 인용: 밑줄을 포함한 연속 10단어 창(문장 ≤12단어면 문장 전체) — 표시 텍스트의 축자 부분 문자열. */
export function cutDecoyQuote(disp: { text: string; view: { sentences: { start: number; end: number }[] } }, dStart: number, dEnd: number): string {
  const sp = sentenceSpan(disp, dStart);
  const toks = wsTokens(disp.text, sp.start, sp.end);
  if (toks.length === 0) return disp.text.slice(dStart, dEnd);
  if (toks.length <= 12) return disp.text.slice(toks[0].start, toks[toks.length - 1].end);
  const a = toks.findIndex((t) => t.end > dStart);
  let b = toks.length - 1;
  for (let i = toks.length - 1; i >= 0; i--)
    if (toks[i].start < dEnd) {
      b = i;
      break;
    }
  const span = Math.max(1, b - a + 1);
  const WIN = Math.max(10, span);
  let s = Math.max(0, a - Math.floor((WIN - span) / 2));
  let e = s + WIN - 1;
  if (e > toks.length - 1) {
    e = toks.length - 1;
    s = Math.max(0, e - WIN + 1);
  }
  return disp.text.slice(toks[s].start, toks[e].end);
}

/** 해설 인용: 정답이 든 표시 문장 전체(오형 포함, 마커 없음). */
export function cutAnswerQuote(disp: { text: string; view: { sentences: { start: number; end: number }[] } }, dStart: number): string {
  const sp = sentenceSpan(disp, dStart);
  return disp.text.slice(sp.start, sp.end);
}

/** 모형 → 프로덕션 v2 md 원문. memo 는 설계메모 한 줄(표시·파싱에서 잘린다). */
export function renderV2Md(item: ItemModel, memo: string): string {
  const disp = displayOf(item.passage, item.marks);
  const marks = disp.marks; // 원문 등장순
  let marked = "";
  let last = 0;
  marks.forEach((m, i) => {
    marked += item.passage.slice(last, m.start) + `[[${LABELS[i]}:${m.shown}]]`;
    last = m.end;
  });
  marked += item.passage.slice(last);
  const ansIdx = marks.findIndex((m) => m.role === "answer");
  const ans = marks[ansIdx];
  const lines: string[] = [];
  lines.push(`설계메모: ${oneLine(memo)}`, "", "밑줄지문:", marked, "", "원형·포인트:");
  marks.forEach((m, i) => lines.push(`(${LABELS[i]}) ${m.original} | ${m.code || "m"}`));
  lines.push(`정답: (${LABELS[ansIdx]})`, `고침: ${oneLine(item.fix)}`);
  lines.push(`해설: 원문「${cutAnswerQuote(disp, ans.dStart)}」 분석: ${oneLine(item.answerAnalysis)}`);
  lines.push("오답:");
  marks.forEach((m, i) => {
    if (i === ansIdx) return;
    lines.push(`(${LABELS[i]}) 원문「${cutDecoyQuote(disp, m.dStart, m.dEnd)}」 분석: ${oneLine(m.analysis ?? "")}`);
  });
  return lines.join("\n");
}

// ── 분석 문장 코드 검사·템플릿(§4.7 작가 규칙) ─────────────────────────────────────────

/** 코드별 템플릿(§4.7 축자) — 옳은 밑줄(오답 분석). */
export const DECOY_TEMPLATE: Readonly<Record<string, string>> = {
  a: "이 자리는 문장 구조상 필요한 동사 형태로 옳게 쓰였습니다.",
  b: "뒤따르는 절의 구조에 맞는 관계사·접속사로 옳게 쓰였습니다.",
  c: "의미상 주어와의 능동·수동 관계에 맞는 분사 형태로 옳게 쓰였습니다.",
  d: "주어의 수에 일치하는 동사 형태로 옳게 쓰였습니다.",
  e: "주어와 동사의 능동·수동 관계에 맞는 태로 옳게 쓰였습니다.",
  f: "수식·보어 역할에 맞는 형용사/부사 형태로 옳게 쓰였습니다.",
  g: "가리키는 대상의 수·격에 맞는 대명사로 옳게 쓰였습니다.",
  h: "동사의 목적격보어 자리에 맞는 형태로 옳게 쓰였습니다.",
  i: "병렬 구조의 앞 항과 같은 형태로 옳게 쓰였습니다.",
  k: "앞의 동사·구조가 요구하는 to부정사/동명사 형태로 옳게 쓰였습니다.",
};
/** 스펙 표에 없는 코드(l 접속사·전치사, m 기타)의 보충 템플릿. */
const DECOY_TEMPLATE_FALLBACK = "이 자리는 문맥과 문장 구조에 맞는 형태로 옳게 쓰였습니다.";
export const decoyTemplate = (code: string): string => DECOY_TEMPLATE[code] ?? DECOY_TEMPLATE_FALLBACK;
/** 정답 해설 템플릿(스펙 미정 — 고침만 짚는 최소 문장). */
export const answerTemplate = (fix: string): string => `이 자리는 문장 구조상 '${oneLine(fix)}'(으)로 고쳐야 어법상 옳습니다.`;

// 한국어 문법 표기 속 영어 조각(-ing·-ed) — 지문 단어가 아니어도 허위 인용이 아니다.
const NOTATION = new Set(["ing", "ed"]);

/** §4.7 코드 검사 — 통과하면 정리된 문장, 실패하면 null(호출측이 템플릿). */
export function checkAnalysis(
  text: string | null | undefined,
  o: { passage: string; forms: string[]; maxChars?: number },
): string | null {
  if (!text) return null;
  const t = oneLine(text);
  if (t.length < 10 || t.length > (o.maxChars ?? 160)) return null;
  if (!t.endsWith("다.")) return null;
  const allowed = new Set<string>([...NOTATION]);
  const addWords = (s: string) => {
    for (const w of s.toLowerCase().match(/[a-z]+/g) ?? []) allowed.add(w);
  };
  addWords(o.passage);
  for (const f of o.forms) addWords(f);
  for (const w of t.toLowerCase().match(/[a-z]+/g) ?? []) if (w.length >= 2 && !allowed.has(w)) return null;
  return t;
}

/** 밑줄 1개의 분석을 검사하고 실패하면 템플릿으로(반환: 쓴 문장·템플릿 여부). */
export function vetDecoyAnalysis(passage: string, m: Pick<ItemMark, "shown" | "original" | "code">, text: string | null | undefined): { text: string; templated: boolean } {
  const ok = checkAnalysis(text, { passage, forms: [m.shown, m.original] });
  return ok ? { text: ok, templated: false } : { text: decoyTemplate(m.code), templated: true };
}
