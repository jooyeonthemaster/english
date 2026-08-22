import { generateQuestionText } from "@/lib/question-generation-llm";
import { resolveAnchorRangeWordBoundary } from "./passage-canvas-model";
import type { BuildAnalysisReportPromptInput } from "./prompt";
import {
  finalOnepageSectionSchema,
  reportMetaSchema,
  type AnalysisReport,
  type FinalOnepageSection,
} from "./schema";
import type { AnalysisReportUsage } from "./generate";
import { extractJson } from "./generate";
import { z } from "zod";

/**
 * 원페이지 파이널 학습지 생성 — 지문 1개 → A4 딱 1장짜리 족집게 시트.
 *
 * 스펙 정본: .tmp-final-qa/final-onepage-spec.md
 *  - F5 앵커 축자: 마크 anchor 는 그 문장 en 안에 글자 그대로 존재(관대 정규화). 실패 마크는 드롭.
 *  - F6 원문 전수: sentences[].en 을 이으면 원문과 정규화 동일해야 한다(누락·개작 = 수리 재시도).
 *  - 1페이지 보장은 렌더러(final-onepage-flow)의 축소 사다리가 담당 — 여기서는 '예산'으로
 *    콘텐츠 총량을 조여 축소가 과해지지 않게 한다(장문에서도 가독 하한 확보).
 *
 * 유형 지식: 이 프롬프트의 "유형별 출제 포인트 지식"은 우리 문제 생성 엔진 26유형 프롬프트
 * (src/lib/md-qgen/prompts-*.ts · question-prompts-*.ts)와 기출 포인트 카탈로그(blank/grammar/
 * sentence-insert/sentence-order/irrelevant-point-catalog.ts, EBSi 전수 실측)에서 증류한 정본이다.
 */

// ─── 생성 스키마 (meta + section) ────────────────────────────────────────────
const finalGenerationSchema = z.object({
  meta: reportMetaSchema,
  section: finalOnepageSectionSchema,
});

export type GenerateFinalOnepageResult =
  | { ok: true; report: AnalysisReport; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

// ─── 예산 (1페이지 지면 계약 — 프롬프트와 결정론 슬라이스가 공유) ────────────
function budgetsFor(wordCount: number) {
  return {
    marksTotal: Math.min(22, Math.max(10, Math.ceil(wordCount / 18))),
    tagsTotal: 8,
    flowNotes: 5,
    trapsMin: 4,
    trapsMax: 7,
    mustKnow: 8,
  };
}

const TAG_TYPES = [
  "빈칸대비", "어법함정", "어휘함정", "서술형대비", "순서단서", "삽입단서",
  "지칭대비", "요약대비", "주제·제목", "함축대비", "내용일치", "무관문장",
] as const;

/** 26유형 출제 지식 다이제스트 — 문제 생성 엔진 프롬프트·기출 카탈로그에서 증류(정본 유지). */
const TYPE_KNOWLEDGE = `
[유형별 출제 포인트 지식 — 우리 문제 생성 엔진 26유형의 실제 출제 규칙. 이 지문에 실제로 걸리는 것만 골라 짚어라]
· 빈칸추론: 논지가 수렴하는 자리(역접 뒤·인과 귀결·결론). 정답은 원문 표현의 재진술(패러프레이즈)이며, 최강 오답은 "앞부분 핵심어를 그대로 싣고 방향만 뒤집은" 선지다. 기출 축: 인과·기제 23.7% / 추상 개념 명명 20.1% / 재진술·정의 16.8% / 대조 전환 14.4%.
· 어법(밑줄·네모): 13코드 — (a)정동사vs준동사 (b)관계사 (c)분사 능/수동 (d)수일치 (e)태 (f)형/부 (g)대명사 수일치 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs접속사 (m)비교. 시험은 "밑줄에서 멀리 떨어진 단서"(수식어구 너머의 진짜 주어, 선행사, and 병렬의 시작점)를 추적해야 하는 자리를 판다. 삽입구·관계절·병렬이 겹친 문장이 1순위.
· 어휘 적절성: 오용어는 그 문장 안에서는 완벽히 자연스럽고, 다음 문장의 결과·수치·논리로만 어긋남이 드러난다. 극성 반전(방향 동사·평가어)이 최다 함정.
· 글의 순서: 이음매의 응집장치 — 시간·서사 42.9% / 지시어·참조 해소 24% / 대조 전환 15.5%. this/these/such+명사, 정관사 구정보, However/Thus 의 방향이 단서.
· 문장 삽입: 정답 자리는 "앞 고리(지시어·구정보)와 뒤 고리(되받음)가 동시에 닫히는 유일한 자리". 참조 해소가 기출의 49.3%. 어휘가 가장 많이 겹치는 자리가 오히려 오답이다.
· 무관한 문장: 소재어는 공유하되 논리 기능만 어긋난 문장(주제 침입 63%·범위 이탈 20.3%). 관점 역전·범위 이동 자리가 표적.
· 주제/제목/요지: however·but·in fact 전환 이후의 귀결이 정답 자리. 최강 오답 = 방향반대(핵심어 동일, 판단만 뒤집힘)와 도입부 소재 함정(역접 이전 통념).
· 함축의미: 결론부의 비유·압축 표현(6단어 이내)이 표적. 최강 오답 = 표면 직역. "이 글의 요지는 ___" 에 넣어 요지로 환원되는 것이 정답.
· 지칭추론: 최근접 명사가 문법상 완벽히 가능한데 논리로만 불가능한 자리. 주-목 전환 대명사가 1순위 표적.
· 내용일치: 조건·시점 탈락(전제를 떼어 무조건 참으로), 인과 뒤집기, 범위 확대, 주체 바꿔치기 — 왜곡은 늘 "한 지점"에서만 일어난다.
· 요약문 완성: (A)(B)는 하나의 논리축(원인-결과·문제-해결·대조)으로 묶인다. 반쪽 정답(한 칸만 맞음)이 표준 함정.
· 서술형(영작·전환·문법수정·핵심빈칸): 조건부 영작은 원문 핵심 연결어를 금지어로 봉쇄해 베껴쓰기를 끊는다. 문장 전환은 태·절압축·가정법·도치가 축이고 hedge(seem/may) 탈락이 감점 포인트. 문법 오류 수정은 넓은 밑줄 안에서 스스로 오류를 찾게 한다. 핵심 표현 빈칸은 "문맥이 한 가지로 좁히는 + 지문 다른 곳에 축자로 없는" 표현만 표적.
· 어휘 3종(문맥 의미·동의어·반의어): 다의어의 "사전 대표 뜻" 함정이 최매력 오답. 문맥 의미축이 같은 정확한 짝만 정답.`;

// ─── 프롬프트 ────────────────────────────────────────────────────────────────
export function buildFinalOnepagePrompt(input: BuildAnalysisReportPromptInput): string {
  const level =
    input.schoolType === "MIDDLE" ? "중학교" : "고등학교";
  const grade = input.grade ? ` ${input.grade}학년` : "";
  const wordCount = input.passageContent.trim().split(/\s+/).length;
  const B = budgetsFor(wordCount);
  const extra = input.customPrompt?.trim()
    ? `\n[강사 추가 지시]\n${input.customPrompt.trim()}\n`
    : "";

  return `당신은 수능 영어 일타강사다. 내일이 시험이다. 학생에게 줄 수 있는 것은 딱 A4 한 장 —
이 지문에 대해 "이 한 장 보고 가면 끝"인 파이널 원페이지 족집게 시트를 만든다.
대상: ${level}${grade}. 실제 선생님이 원문 위에 손으로 필기한 자료처럼, 짧고 정확하게 급소만 짚는다.

# 절대 원칙
- **원문 문장 전수 포함**: 지문의 모든 문장을 순서대로, 한 글자도 바꾸지 말고 sentences[].en 에 넣는다. 문장 누락·병합·개작 = 실패.
- **anchor 축자**: marks[].anchor 는 그 문장 en 안에 글자 그대로 존재하는 연속 구절(≤6단어)이어야 한다. 없는 표현이면 실패.
- **모든 필기는 이 지문 구체 근거**: 일반론·교과서 정의 금지. "④ 뒤 역접이라 빈칸 1순위" 처럼 이 지문의 그 자리를 짚는다.
- **어법 라벨은 문법 사실과 정확히 일치**: label·note 가 그 표현의 실제 형태를 틀리게 기술하면 실패다(예: 능동 had dismissed 를 "수동"이라 쓰기, 시제·품사 오기). 출력 전에 어법 라벨만 한 번 더 검산하라 — 학원 자료의 신뢰가 여기서 갈린다.
- **짧게**: label ≤18자, note ≤55자, tag.text ≤80자, trap 각 필드 ≤65자, flowNote.text ≤80자. 지면은 A4 한 장뿐이다.
${TYPE_KNOWLEDGE}

# 색 의미론 (marks[].color — 반드시 이 규칙대로)
red=어법 함정·오답 포인트 / blue=구조·연결사·순서/삽입 단서 / pink=빈칸·핵심 개념어 / purple=서술형·요약 표적 / green=어휘·지칭.

# 스타일 사용법 (marks[].style)
underline=핵심 서술, circle=단어·구 하나(어법 자리·대명사·연결사), box=빈칸/서술형 표적 구간, highlight=주제문·결론, wavy=함정·헷갈림 주의.

# 1페이지 지면 예산 (초과분은 서버가 잘라낸다 — 예산 안에서 가장 시험에 나올 것만)
- marks 총합 ≤ ${B.marksTotal} (문장당 ≤ 3 권장, 최대 6)
- tags 총합 ≤ ${B.tagsTotal} · 문장당 ≤ 2 — tag.type 은 다음 중에서만: ${TAG_TYPES.join(" / ")}
- flowNotes ≤ ${B.flowNotes} (문단 전환·논리 전개 해설만)
- traps ${B.trapsMin}~${B.trapsMax}개 (이 지문에서 실제 출제될 유형만, 유형명은 한글로)
- mustKnow ≤ ${B.mustKnow} (모르면 해석이 막히는 어휘만 — 쉬운 단어 금지)
- note 가 있는 문장은 전체의 절반 이하

# 출력 (JSON 객체 하나만 — 코드펜스·설명 금지)
{
  "meta": {
    "eyebrow": "FINAL ONE-PAGE · 시험 직전 족집게",
    "titleKo": "지문 핵심 한국어 제목", "titleEn": "영어 부제",
    "category": "분류", "theme": "소재", "difficulty": 1~5, "difficultyNote": "(수능 N점)",
    "solveTime": "권장 풀이시간", "examTypes": "이 지문 핵심 출제유형 (예: '빈칸추론·어법·순서')"
  },
  "section": {
    "kind": "final-onepage",
    "topic": "소재 한 줄 (예: '필즈 메달과 Stephen Smale에 대한 관심을 불러일으킨 사건')",
    "oneLiner": "이 지문 한 줄 정리 — 시험장 직전 마지막 암기 문장(한국어)",
    "sentences": [
      { "n": 1, "en": "원문 문장 그대로",
        "marks": [ { "anchor": "원문 축자 구절", "style": "circle", "color": "red", "label": "수일치 함정" } ],
        "note": "이 문장 아래 손필기 한 줄 (필요한 문장에만)",
        "tags": [ { "type": "빈칸대비", "text": "왜 이 자리가 빈칸으로 나오는지 + 오답이 무엇으로 나올지" } ] }
    ],
    "flowNotes": [ { "afterSentence": 3, "label": "흐름", "text": "여기서 통념→반박 전환. 순서 문제면 이 경계가 절단선" } ],
    "traps": [ { "type": "빈칸추론", "point": "⑥ 결론 'not A but B' 의 B 자리", "trap": "앞부분 핵심어 재사용 + 방향반대 선지" } ],
    "mustKnow": [ { "term": "subpoena", "meaning": "(법원의) 소환장" } ],
    "koFull": "전문 해석 — 자연스러운 한국어, 한 문단으로",
    "finalTip": "마지막 한 줄 — 선생님이 어깨 잡고 해 주는 말 (예: '빈칸은 ⑥, 어법은 ③ which. 이 둘만은 절대 놓치지 마.')"
  }
}
- traps[].type 은 다음 한글 유형명 중에서만: 빈칸추론 / 어법 / 네모어법 / 어휘 / 순서 / 문장삽입 / 무관문장 / 주제 / 제목 / 요지 / 함축의미 / 지칭 / 내용일치 / 요약문 / 서술형 / 영작.
- traps[].point 에는 반드시 문장 번호(①~)를 포함해 위치를 특정하라.
- meta.examTypes 와 traps 의 유형 구성은 일치해야 한다.
${extra}
# 분석할 지문
"""
${input.passageContent}
"""

위 명세대로 JSON 하나만 출력하라.`;
}

// ─── 결정론 정규화·게이트 ────────────────────────────────────────────────────
const ALLOWED_TRAP_TYPES = new Set([
  "빈칸추론", "어법", "네모어법", "어휘", "순서", "문장삽입", "무관문장",
  "주제", "제목", "요지", "함축의미", "지칭", "내용일치", "요약문", "서술형", "영작",
]);

function canonicalTrapType(t: string): string {
  const s = (t ?? "").replace(/\s+/g, "");
  if (ALLOWED_TRAP_TYPES.has(s)) return s;
  if (/빈칸/.test(s)) return "빈칸추론";
  if (/네모/.test(s)) return "네모어법";
  if (/어법|문법/.test(s)) return "어법";
  if (/어휘|단어/.test(s)) return "어휘";
  if (/순서|배열/.test(s)) return "순서";
  if (/삽입/.test(s)) return "문장삽입";
  if (/무관/.test(s)) return "무관문장";
  if (/제목/.test(s)) return "제목";
  if (/요지|주장/.test(s)) return "요지";
  if (/주제/.test(s)) return "주제";
  if (/함축|함의/.test(s)) return "함축의미";
  if (/지칭|지시/.test(s)) return "지칭";
  if (/일치/.test(s)) return "내용일치";
  if (/요약/.test(s)) return "요약문";
  if (/영작|서술/.test(s)) return "서술형";
  return "출제포인트";
}

/** 비교용 정규화 — 공백 접기 + 따옴표/대시 통일 + 소문자. */
function normalizeForCoverage(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * F6 원문 전수 게이트 — sentences[].en 연결이 원문을 (정규화 기준) 97% 이상 담고
 * 순서를 보존하는지. LCS 같은 무거운 비교 대신 "원문에서 각 문장을 순서대로 소비"하는
 * 커서 매칭으로 판정한다(문장 경계 분할 차이에 관대, 개작·누락에는 민감).
 */
function passageCoverageIssue(section: FinalOnepageSection, passageContent: string): string | null {
  const src = normalizeForCoverage(passageContent);
  let cursor = 0;
  let matchedChars = 0;
  for (const snt of section.sentences) {
    const needle = normalizeForCoverage(snt.en);
    if (!needle) continue;
    const idx = src.indexOf(needle, cursor);
    if (idx < 0) {
      // 커서 뒤에서 못 찾으면 전체에서 재탐색(문장 분할 순서 흔들림 관대) — 그래도 없으면 개작.
      const anywhere = src.indexOf(needle);
      if (anywhere < 0) {
        return `문장 ${snt.n} 이 원문에 축자로 존재하지 않습니다(개작 금지): "${snt.en.slice(0, 60)}..."`;
      }
      matchedChars += needle.length;
      continue;
    }
    cursor = idx + needle.length;
    matchedChars += needle.length;
  }
  const coverage = src.length > 0 ? matchedChars / src.length : 0;
  if (coverage < 0.97) {
    return `원문 커버리지 ${(coverage * 100).toFixed(1)}% < 97% — 누락된 문장이 있습니다. 지문의 모든 문장을 순서대로 포함하세요.`;
  }
  return null;
}

/** F5 앵커 게이트 + 예산 슬라이스 — 섹션을 제자리 정규화하고 남은 이슈를 반환. */
function normalizeFinalSection(section: FinalOnepageSection, passageContent: string): string[] {
  const issues: string[] = [];
  const wordCount = passageContent.trim().split(/\s+/).length;
  const B = budgetsFor(wordCount);

  // 앵커 축자 검증 — 실패 마크 드롭
  let totalMarks = 0;
  let droppedMarks = 0;
  for (const snt of section.sentences) {
    const kept = snt.marks.filter((m) => {
      totalMarks += 1;
      const ok = resolveAnchorRangeWordBoundary(snt.en, m.anchor) !== null;
      if (!ok) droppedMarks += 1;
      return ok;
    });
    snt.marks = kept.slice(0, 6);
    if (snt.tags.length > 3) snt.tags = snt.tags.slice(0, 3);
    for (const tag of snt.tags) {
      if (!(TAG_TYPES as readonly string[]).includes(tag.type)) {
        tag.type = canonicalTrapType(tag.type) === "출제포인트" ? "출제포인트" : tag.type;
      }
    }
  }
  if (totalMarks > 0 && droppedMarks / totalMarks > 0.4) {
    issues.push(
      `marks 앵커의 ${droppedMarks}/${totalMarks} 가 원문에 축자로 존재하지 않습니다. anchor 는 그 문장 en 안의 연속 구절을 글자 그대로 복사하세요.`,
    );
  }

  // 전역 marks 예산 — 초과분은 뒤 문장부터 잘라낸다(앞 = 도입·주제부 필기 우선 보존).
  let marksBudget = B.marksTotal;
  for (const snt of section.sentences) {
    if (marksBudget <= 0) {
      snt.marks = [];
      continue;
    }
    if (snt.marks.length > marksBudget) snt.marks = snt.marks.slice(0, marksBudget);
    marksBudget -= snt.marks.length;
  }
  // 태그 전역 예산
  let tagsBudget = B.tagsTotal;
  for (const snt of section.sentences) {
    if (tagsBudget <= 0) {
      snt.tags = [];
      continue;
    }
    if (snt.tags.length > tagsBudget) snt.tags = snt.tags.slice(0, tagsBudget);
    tagsBudget -= snt.tags.length;
  }

  if (section.flowNotes.length > B.flowNotes) section.flowNotes = section.flowNotes.slice(0, B.flowNotes);
  // flowNotes.afterSentence 가 실재 문장 번호가 아니면 렌더에서 조용히 사라진다 —
  // 가장 가까운 이전 문장 번호로 재매핑(없으면 첫 문장). 결정론·무손실.
  const sentenceNos = section.sentences.map((s) => s.n);
  const noSet = new Set(sentenceNos);
  for (const note of section.flowNotes) {
    if (noSet.has(note.afterSentence)) continue;
    const prior = sentenceNos.filter((n) => n < note.afterSentence);
    note.afterSentence = prior.length > 0 ? Math.max(...prior) : sentenceNos[0];
  }
  if (section.mustKnow.length > B.mustKnow) section.mustKnow = section.mustKnow.slice(0, B.mustKnow);

  section.traps = section.traps.slice(0, B.trapsMax).map((t) => ({ ...t, type: canonicalTrapType(t.type) }));
  if (section.traps.length < 3) {
    issues.push(`traps 가 ${section.traps.length}개 — 최소 4개(빈칸·어법 등 이 지문의 실제 출제 유형)로 채우세요.`);
  }

  return issues;
}

// ─── 생성기 ──────────────────────────────────────────────────────────────────

// 기본 모델 — 26-08-12 A/B 실측(.tmp-final-qa/model-ab-luna-vs-g36.md)으로 luna 채택:
// 게이트 1차 통과 동률에서 품질 우세(함정표·태그 예산 상한까지 충전, 유형 지식 소화
// 정확)·비용 5~8배 저렴($0.01 vs $0.06~0.10/장). 대가는 속도(102~130s vs 42~69s)라
// 호출측 데드라인을 함께 늘렸다(fast 270s·워커 540s). 롤백/핀은 env 로:
//   FINAL_ONEPAGE_MODEL=google/gemini-3.6-flash 로 되돌릴 땐 xhigh 가 gemini 에서
//   유효하지 않으므로 FINAL_ONEPAGE_REASONING_EFFORT=high 도 반드시 함께 지정.
const FINAL_ONEPAGE_MODEL =
  process.env.FINAL_ONEPAGE_MODEL?.trim() || "openai/gpt-5.6-luna";
const FINAL_ONEPAGE_REASONING_EFFORT =
  process.env.FINAL_ONEPAGE_REASONING_EFFORT?.trim() || "xhigh";

export async function generateFinalOnepageReport(
  input: BuildAnalysisReportPromptInput & { brand?: string; docNo?: string },
  opts?: {
    deadlineAt?: number;
    /** 모델 실험용 오버라이드(스모크 하네스 전용) — 미지정 시 STANDARD 플랜 매핑 그대로. */
    modelId?: string;
    reasoningEffort?: string;
    maxTokens?: number;
    timeoutMs?: number;
  },
): Promise<GenerateFinalOnepageResult> {
  const basePrompt = buildFinalOnepagePrompt(input);
  let lastFailure = "";
  let lastRaw = "";
  let lastParsed: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && opts?.deadlineAt && Date.now() >= opts.deadlineAt) break;
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n# 재생성 지시\n직전 출력은 아래 기준을 통과하지 못했습니다.\n${lastFailure}\n\n이번에는 누락 없이 수정해서 JSON 객체 하나만 다시 생성하세요.`;

    // luna 실측 상위 130s + xhigh 꼬리 여유 — 콜 1회 상한. 데드라인이 더 이르면 그쪽이 이긴다.
    const baseTimeoutMs = opts?.timeoutMs ?? 200_000;
    const timeoutMs = opts?.deadlineAt
      ? Math.max(1_000, Math.min(baseTimeoutMs, opts.deadlineAt - Date.now()))
      : baseTimeoutMs;
    const result = await generateQuestionText({
      prompt,
      generationPlan: "STANDARD",
      modelId: opts?.modelId ?? FINAL_ONEPAGE_MODEL,
      logPrefix: attempt === 0 ? "FINAL_ONEPAGE" : "FINAL_ONEPAGE_REPAIR",
      maxRetries: 0,
      // xhigh 사고 토큰(실측 12k~17k)이 completion 몫에서 빠지므로 넉넉히 잡는다.
      maxTokens: opts?.maxTokens ?? 60_000,
      omitMaxTokens: false,
      responseFormat: "json_object",
      isRecoverableJsonText: (raw: string) => {
        try {
          JSON.parse(extractJson(raw));
          return true;
        } catch {
          return false;
        }
      },
      thinkingBudget: 0,
      timeoutMs,
      temperature: 0.15,
      reasoningEffort: opts?.reasoningEffort ?? FINAL_ONEPAGE_REASONING_EFFORT,
      applyReasoningEffortToGemini: true,
    }).catch((error: unknown) => {
      lastFailure = `모델 호출 실패: ${error instanceof Error ? error.message : String(error)}`;
      return null;
    });
    if (!result) continue;

    const raw = result.text;
    lastRaw = raw;
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (e) {
      lastFailure = `JSON 파싱 실패: ${String(e)}`;
      continue;
    }
    if (parsed && typeof parsed === "object") {
      const p = parsed as { section?: { kind?: string } };
      if (p.section && typeof p.section === "object") p.section.kind = "final-onepage";
    }
    lastParsed = parsed;

    const validation = finalGenerationSchema.safeParse(parsed);
    if (!validation.success) {
      lastFailure = `스키마 검증 실패: ${validation.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" | ")}`;
      continue;
    }

    const section = validation.data.section;
    const coverageIssue = passageCoverageIssue(section, input.passageContent);
    const normIssues = normalizeFinalSection(section, input.passageContent);
    const issues = [...(coverageIssue ? [coverageIssue] : []), ...normIssues];
    if (issues.length > 0) {
      lastFailure = `품질 검증 실패: ${issues.slice(0, 6).join(" | ")}`;
      lastParsed = validation.data;
      continue;
    }

    const report: AnalysisReport = {
      schemaVersion: 1,
      brand: input.brand ?? "ENGLISH READING LAB",
      docNo: input.docNo,
      themeId: "black-white",
      meta: validation.data.meta,
      sections: [section],
    };

    return {
      ok: true,
      report,
      raw,
      usage: {
        usage: result.usage,
        provider: result.provider ?? "",
        modelId: result.modelId ?? "",
        durationMs: result.durationMs,
      },
    };
  }

  return { ok: false, error: lastFailure || "원페이지 파이널 생성 실패", raw: lastRaw, parsed: lastParsed };
}
