// ============================================================================
// AI 지문 생성 — 마크다운 출력 파서 (스트리밍 레인 전용, 순수 함수)
//
// 왜 JSON 이 아니라 마크다운인가:
//   스트리밍으로 "사고 → 집필"을 보여주려면 델타 자체가 사람이 읽을 수 있는
//   텍스트여야 한다. generateObject 의 델타는 `{"passage":"A hab` 같은 조각이라
//   화면에 흘릴 수 없다. 문제 생성(빈칸·어법)이 같은 이유로 구조화 출력을 버리고
//   마크다운 원큐로 간 선례가 이 리포에 이미 있다(src/lib/md-qgen/*).
//   ⚠️ 양립시킨 것이 아니라 **한쪽을 버린** 것이다 — 이 레인은 JSON 을 쓰지 않고,
//   generateObject + authoredPassageSchema 경로는 count>=2 와 폴백이 그대로 쓴다.
//
// 이 파일의 책임은 **텍스트 → 필드**까지다. 지표·커버리지·자료 id 같은
// "서버가 세는 값"은 여기서 손대지 않는다(adapter.ts 가 metrics.ts 로 계산한다).
//
// 회귀 방지 계약
//  1) **순수 함수다.** import 0건. 그래야 tests/unit 에서 부분 수신 중간 상태·라벨
//     누락·순서 뒤바뀜을 표로 검증할 수 있다.
//  2) **섹션 머리(## 설계/지문/메타)는 장식이다.** 라벨 14종이 문서 전체에서
//     유일하므로 스캔은 문서 단위로 한 번만 돈다 — 그래서 머리가 빠져도, 순서가
//     뒤바뀌어도 같은 결과가 나온다. 머리줄은 블록의 **경계**로만 쓰고 값에 담지
//     않는다.
//  3) **절대 throw 하지 않는다.** 못 읽은 칸은 빈 문자열/빈 배열이다. 판정은
//     호출부(adapter 의 하드 게이트)가 한다 — 파서가 던지면 "본문은 멀쩡한데
//     메타 한 줄이 비어서 크레딧을 태우는" generate.ts 가 명시적으로 금지한 결말이
//     된다.
//  4) 라벨 정규식은 **알려진 라벨 14종의 alternation** 이다. `[가-힣]+:` 같은
//     느슨한 패턴으로 넓히지 말 것 — 설명(rationale) 본문 안의 "논지 문장:" 같은
//     한국어 구절이 라벨로 오인돼 그 뒤가 통째로 잘려 나간다.
//  5) **여러 줄을 먹는 라벨은 본문·설명 둘뿐이다**(MULTILINE_LABELS). 한 줄 라벨이
//     뒤따르는 줄까지 삼키면, `본문:` 이 빠진 출력에서 지문 전체가 바로 위 `제목:`
//     블록으로 빨려 들어가 통째로 사라진다(단위 테스트가 잡은 실측 버그).
//  6) 본문 정규화의 마크다운 헤딩 제거는 `[ \t]` 로만 들여쓰기를 허용한다. `\s` 로
//     쓰면 여러 줄 모드의 ^ 뒤에서 **앞 빈 줄까지 먹어** 문단 경계가 사라진다.
//     그리고 제목 에코 제거는 반드시 **문단 접기 전에** 돈다(합쳐진 뒤엔 못 잡는다).
// ============================================================================

/** 모델이 본문보다 **먼저** 적는 설계. 필드명은 authoredPassageSchema.plan 과 1:1. */
export interface AuthoredMdPlan {
  skeleton: string;
  grounding: string;
  thesis: string;
  warrantA: string;
  warrantB: string;
  turn: string;
  closingMove: string;
}

/** 파싱 결과 — authoredPassageSchema 의 마크다운 대응물(셀 수 있는 값은 없다). */
export interface AuthoredMd {
  plan: AuthoredMdPlan;
  title: string;
  passage: string;
  topicLabel: string;
  koreanSummary: string;
  rationale: string;
  usedGrammarPoints: string[];
  usedWords: string[];
}

/** 라벨 14종. 값 자체가 프롬프트(prompt.ts)와 공유되는 계약 문자열이다. */
export const MD_LABELS = {
  skeleton: "골격",
  grounding: "접지",
  thesis: "논지",
  warrantA: "근거1",
  warrantB: "근거2",
  turn: "전환",
  closingMove: "마무리",
  title: "제목",
  passage: "본문",
  topicLabel: "소재",
  koreanSummary: "요약",
  rationale: "설명",
  grammarPoints: "어법",
  words: "단어",
} as const;

/** 섹션 머리 3종. 파싱에는 안 쓰고 경계로만 쓴다(계약 2). */
export const MD_SECTIONS = ["설계", "지문", "메타"] as const;

type LabelKey = keyof typeof MD_LABELS;

/**
 * 라벨 줄. `근거 1` / `**본문**:` / `- 소재:` / 전각 콜론까지 관용한다.
 * 알려진 라벨만 잡는다(계약 4).
 */
const LABEL_LINE_RE =
  /^\s{0,3}(?:[-*>]\s*)?(?:\*\*)?\s*(골격|접지|논지|근거\s*1|근거\s*2|전환|마무리|제목|본문|소재|요약|설명|어법|단어)\s*(?:\*\*)?\s*[:：]\s?(.*)$/;

/** 섹션 머리줄. `## 지문` · `**지문**` · `지문` 모두 같은 경계로 본다. */
const SECTION_LINE_RE = /^\s{0,3}#{0,6}\s*(?:\*\*)?\s*(설계|지문|메타)\s*(?:\*\*)?\s*[:：]?\s*$/;

const LABEL_BY_TOKEN: ReadonlyMap<string, LabelKey> = new Map(
  (Object.entries(MD_LABELS) as Array<[LabelKey, string]>).map(
    ([key, token]) => [token, key],
  ),
);

/**
 * 여러 줄을 먹는 라벨은 **이 둘뿐**이다.
 *
 * ⚠️ 처음엔 모든 라벨이 뒤따르는 줄을 삼키게 짰다가 단위 테스트가 잡았다:
 * `본문:` 라벨이 빠진 출력에서 지문 전체가 바로 위 `제목:` 블록으로 빨려 들어가
 * 본문이 통째로 사라졌다(제목은 120자로 잘리므로 지문도 함께 소멸). 한 줄 라벨은
 * 값을 읽는 즉시 블록을 닫아야 그 뒤의 지문이 고아 묶음으로 남아 구제된다.
 */
const MULTILINE_LABELS: ReadonlySet<LabelKey> = new Set(["passage", "rationale"]);

/** `근거 1` 처럼 사이에 공백을 넣는 드리프트를 계약 토큰으로 되돌린다. */
function normalizeLabelToken(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** 코드펜스로 통째로 감싸 보내는 사고를 되돌린다(본문만이 아니라 응답 전체). */
function stripOuterFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  return fence ? fence[1] : trimmed;
}

/** 값 한 줄 — 따옴표·굵게 잔재를 벗기고 공백을 접는다. */
function cleanInline(raw: string): string {
  let out = raw.trim().replace(/\s+/g, " ");
  out = out.replace(/^\*\*(.*)\*\*$/, "$1").trim();
  if (
    (out.startsWith('"') && out.endsWith('"') && out.length > 1) ||
    (out.startsWith("“") && out.endsWith("”") && out.length > 1) ||
    (out.startsWith("'") && out.endsWith("'") && out.length > 1)
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

/** plan 한 줄 상한 — generate.ts PLAN_LINE_LIMIT 과 같은 값(카드가 같은 폭을 쓴다). */
const PLAN_LINE_LIMIT = 300;

const planLine = (raw: string): string => cleanInline(raw).slice(0, PLAN_LINE_LIMIT);

interface ScanResult {
  blocks: Map<LabelKey, string[]>;
  /** 어떤 라벨에도 속하지 않은 연속 줄 묶음 — 본문 라벨 누락 시의 구제책. */
  orphanRuns: string[][];
}

/**
 * 문서 전체를 한 번 훑어 라벨 블록과 고아 묶음을 만든다.
 *
 * 같은 라벨이 두 번 나오면 **첫 번째만** 채택하고 이후 줄은 어디에도 담지 않는다.
 * (모델이 출력을 다시 시작하는 드리프트에서 두 벌이 이어 붙어 본문이 두 배가 되는
 *  것보다, 첫 벌만 온전히 쓰는 편이 언제나 낫다 — 분량 게이트가 그 차이를 본다.)
 */
function scanBlocks(text: string): ScanResult {
  const blocks = new Map<LabelKey, string[]>();
  const orphanRuns: string[][] = [];
  const consumed = new Set<LabelKey>();
  let current: LabelKey | null = null;
  let orphan: string[] = [];

  const flushOrphan = () => {
    if (orphan.length > 0) orphanRuns.push(orphan);
    orphan = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (SECTION_LINE_RE.test(line)) {
      current = null;
      flushOrphan();
      continue;
    }

    const labelMatch = line.match(LABEL_LINE_RE);
    if (labelMatch) {
      flushOrphan();
      const key = LABEL_BY_TOKEN.get(normalizeLabelToken(labelMatch[1]));
      if (!key || consumed.has(key)) {
        // 미지의 라벨은 정규식상 올 수 없고, 중복 라벨은 통째로 버린다.
        current = null;
        continue;
      }
      consumed.add(key);
      blocks.set(key, [labelMatch[2] ?? ""]);
      // 한 줄 라벨은 여기서 블록을 닫는다(위 MULTILINE_LABELS 주석의 실패 모드).
      current = MULTILINE_LABELS.has(key) ? key : null;
      continue;
    }

    if (current) {
      blocks.get(current)?.push(line);
      continue;
    }
    if (line.trim()) orphan.push(line);
    else flushOrphan();
  }
  flushOrphan();

  return { blocks, orphanRuns };
}

/** 블록 → 원문 유지 텍스트(앞뒤 빈 줄만 제거). */
function blockText(lines: string[] | undefined): string {
  if (!lines || lines.length === 0) return "";
  const out = [...lines];
  while (out.length > 0 && !out[0].trim()) out.shift();
  while (out.length > 0 && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

/** 라틴 문자가 한글보다 많고 실질 길이가 있는가 — 본문 후보 판정. */
function looksLikeEnglishBody(text: string): boolean {
  const ascii = (text.match(/[A-Za-z]/g) || []).length;
  const hangul = (text.match(/[가-힣]/g) || []).length;
  return ascii >= 40 && ascii > hangul;
}

/**
 * 본문 정규화. 절대규칙 2(ONE unbroken paragraph, plain text)를 결정론적으로
 * 강제한다 — 마크다운 잔재를 벗기고, **빈 줄은 문단 경계로 보존**하되 문단 안의
 * 줄바꿈(모델이 폭에 맞춰 접은 것)은 공백으로 편다.
 * 빈 줄까지 지우면 실용문(편지·공지)의 블록 배치가 무너지고, 반대로 손대지 않으면
 * metrics.paragraphs 가 접힌 줄 수만큼 부풀어 봉투 검사가 오작동한다.
 */
export function normalizeAuthoredPassage(raw: string): string {
  const body = stripOuterFence(raw)
    .replace(/\r\n?/g, "\n")
    // ⚠️ 들여쓰기 부분은 반드시 [ \t] 다 — `\s` 로 쓰면 여러 줄 모드의 ^ 뒤에서
    // **앞 빈 줄까지 먹어** 문단 경계가 사라진다(단위 테스트가 잡은 실측 버그:
    // "…here.\n\n# Second" → "…here.\nSecond" 로 접혔다).
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/\*\*([^*\n]{1,200})\*\*/g, "$1");
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
  return cleanQuotedBody(blocks.join("\n\n"));
}

/** 본문을 통째로 따옴표로 감싸 보내는 사고만 되돌린다(문장 안 인용은 건드리지 않음). */
function cleanQuotedBody(text: string): string {
  const out = text.trim();
  if (out.length < 2) return out;
  const first = out[0];
  const last = out[out.length - 1];
  if (
    (first === '"' && last === '"') ||
    (first === "“" && last === "”") ||
    (first === "'" && last === "'")
  ) {
    return out.slice(1, -1).trim();
  }
  return out;
}

/**
 * 첫 줄이 제목 반복이면 떼어낸다(제목 라벨이 이미 있으므로 본문에 다시 올 이유가 없다).
 *
 * ⚠️ **문단 접기(normalizeAuthoredPassage) 전에** 불러야 한다. 뒤에 부르면 제목 줄이
 * 이미 다음 줄과 한 문단으로 합쳐져 있어 어떤 비교로도 걸리지 않는다(단위 테스트가
 * 잡은 순서 버그).
 */
function stripEchoedTitle(passage: string, title: string): string {
  if (!title.trim()) return passage;
  const lines = passage.split("\n");
  if (lines.length < 2) return passage;
  const head = lines[0]
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(head) === norm(title)) return lines.slice(1).join("\n").trim();
  return passage;
}

/** 라벨 목록 값(어법·단어)을 배열로. "없음"/"-"/"none" 은 빈 배열이다. */
const LIST_EMPTY_TOKENS: ReadonlySet<string> = new Set([
  "없음",
  "-",
  "—",
  "none",
  "n/a",
  "na",
  "(없음)",
]);

const LIST_ITEM_LIMIT = 24;
const LIST_ITEM_CHARS = 60;

export function parseLabelList(raw: string): string[] {
  const flat = raw.replace(/\n/g, ",");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of flat.split(/[,;，、·・]/)) {
    const value = cleanInline(piece)
      .replace(/^[-*\d.)\s]+/, "")
      .trim()
      .slice(0, LIST_ITEM_CHARS);
    if (!value) continue;
    if (LIST_EMPTY_TOKENS.has(value.toLowerCase())) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= LIST_ITEM_LIMIT) break;
  }
  return out;
}

/**
 * 마크다운 응답 → 필드. **부분 수신 상태에서도 안전하다** — 아직 도착하지 않은
 * 칸은 빈 값이고, 그 판정은 호출부가 한다.
 */
export function parseAuthoredMd(text: string): AuthoredMd {
  const source = stripOuterFence(String(text ?? ""));
  const { blocks, orphanRuns } = scanBlocks(source);

  const read = (key: LabelKey): string => blockText(blocks.get(key));

  const title = cleanInline(read("title")).slice(0, 120);

  // 본문 라벨이 없거나 비면 고아 묶음 중 "가장 긴 영어 덩어리"를 본문으로 구제한다.
  // (모델이 `본문:` 을 빠뜨리고 지문만 흘리는 드리프트 — 라벨 하나 때문에 크레딧을
  //  태우지 않는다.)
  let passageRaw = read("passage");
  if (!looksLikeEnglishBody(passageRaw)) {
    let best = "";
    for (const run of orphanRuns) {
      const candidate = run.join("\n");
      if (!looksLikeEnglishBody(candidate)) continue;
      if (candidate.length > best.length) best = candidate;
    }
    if (best.length > passageRaw.length) passageRaw = best;
  }
  const passage = normalizeAuthoredPassage(stripEchoedTitle(passageRaw, title));

  return {
    plan: {
      skeleton: planLine(read("skeleton")),
      grounding: planLine(read("grounding")),
      thesis: planLine(read("thesis")),
      warrantA: planLine(read("warrantA")),
      warrantB: planLine(read("warrantB")),
      turn: planLine(read("turn")),
      closingMove: planLine(read("closingMove")),
    },
    title,
    passage,
    topicLabel: cleanInline(read("topicLabel")).slice(0, 40),
    koreanSummary: cleanInline(read("koreanSummary")).slice(0, 200),
    // 설명은 ①②③ 세 문장이라 줄바꿈을 살린 채 공백만 정리한다.
    rationale: blockText(blocks.get("rationale"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 600),
    usedGrammarPoints: parseLabelList(read("grammarPoints")),
    usedWords: parseLabelList(read("words")),
  };
}
