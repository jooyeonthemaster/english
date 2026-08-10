// ============================================================================
// 요지·주장(MAIN_IDEA) md 파서 · 0원 스냅.
// 견본(EXEMPLAR): parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 0원 결정형 게이트는 **gate-main-idea.ts** 로 분리했다(스펙의 "400줄에서 분할
// 검토" 조항 — vocab·combo·order 가 이미 같은 분리를 했다). 이 파일은 마크다운
// → 구조체(파싱)와 무손실 보정(스냅)까지만 책임진다. 의존 방향은
// gate-main-idea → parser-main-idea 단방향이다(여기서 게이트를 재수출하면
// 순환 import 가 된다 — 하지 마라).
//
// 이 유형은 **지문을 변형하지 않는다.** 그래서 다른 유형의 최강 게이트인
// "지문 재구성 일치"가 없다. 대신 형식이 `근거:` 줄(정답 논지가 가장 압축된
// 지문 문장의 축자 복사)을 요구하고, 게이트가 그 줄을 지문과 축자 대조한다 —
// 이 유형에서 지문과 문항을 잇는 유일한 결정형 앵커다.
//
// ⚠ 형식 설계 철칙(스펙 §1-B) 적용 기록:
//   · 정답의 진실원은 `정답:` 줄 **하나뿐**이다. 선지 줄에 "(정답)" 표시를 받는
//     칸을 두지 않는다(반의어가 그 중복 계약으로 실사용 2연속 반려됐다).
//     모델이 습관적으로 붙이는 인라인 정답 표시는 스냅이 걷어내고 기록한다.
//   · 선지 줄의 칸은 "라벨 + 본문" 하나뿐이다. 기제 이름은 `오답:` 줄 안의
//     자유 서술로 받는다(칸을 쪼개지 않는다).
//   · 줄 단위 관대 파싱 — 한 줄이 통째로 사라져 "개수 부족"으로만 보이는 은폐를
//     막는다. 무엇이 잘못됐는지는 게이트가 라벨로 지목한다.
// ============================================================================

import { normalizeWs, snapExpressionSpan } from "./parser";
import { MAIN_IDEA_MD_LABELS, type MainIdeaStemAxis } from "./prompts-main-idea";

export interface MdMainIdeaOption {
  /** "①"~"⑧" — 어댑터가 저장 축("1"~"8")으로 파생한다. */
  label: string;
  text: string;
}

export interface MdMainIdeaQuestion {
  kind: "mainIdea";
  /** 발문축 — 파싱 실패 시 "요지"(수능 실물 기본형). */
  stemAxis: MainIdeaStemAxis;
  /** 정답 논지가 가장 압축된 지문 문장(축자) — 게이트의 유일한 지문 정합 앵커 */
  evidence: string;
  options: MdMainIdeaOption[];
  /** 정답 라벨 — `정답:` 줄이 유일 진실원이다(복수 정답 설정 시 2개 이상) */
  answers: string[];
  explanation: string;
  wrong: { label: string; text: string }[];
  /**
   * 섹션 앵커를 실제로 찾았는지 — **정답 채널이 아니라 파싱 내력(provenance)** 이다.
   * 둘 다 못 찾으면 선지 구간을 자를 수 없어 오답해설 줄까지 선지로 흡수되고,
   * 게이트에는 "선지 9개" 라는 **사실과 다른 원인**으로만 보인다. 그 문구가 그대로
   * [반려 재생성] 피드백에 실려 모델을 엉뚱한 방향으로 몬다 — 철칙 3·5 의 은폐다.
   * 게이트가 이 값을 보고 원인을 지목한다.
   */
  anchors: { answer: boolean; wrong: boolean };
}

const LABEL_LIST: readonly string[] = MAIN_IDEA_MD_LABELS;
const LABEL_SET = new Set<string>(LABEL_LIST);

/** 라벨 토큰 정규화 — 원문자(계약형)와 숫자 표기(드리프트) 모두 "①"~"⑧" 로. */
export function mainIdeaLabelOf(raw: string): string {
  const token = String(raw ?? "").trim();
  if (LABEL_SET.has(token)) return token;
  const digit = token.replace(/[()[\].:]/g, "");
  const n = Number(digit);
  if (Number.isInteger(n) && n >= 1 && n <= LABEL_LIST.length) return LABEL_LIST[n - 1];
  return "";
}

// ── 키워드 줄 관용 (silent-drop 방지) ────────────────────────────────────────
// 전 유형 웨이브의 지배적 결함 계통: 선지·데이터 줄은 관대하게 파싱해 놓고
// `정답:`·`해설:` 같은 **키워드 줄만 무관용 정규식**으로 잡으면, 모델이 헤더를
// 굵게(`**정답:**`)·헤딩(`### 정답`)·전각콜론(`정답：`)·불릿(`- 정답:`)으로 쓰는
// 순간 그 필드가 통째로 사라진다. 실측(프로브): `**정답:**`+`**오답:**` 하나로
// 선지 구간 절단이 실패해 선지 9개가 되고 게이트가 `선지 9개 (5개 필요)` 만 뱉었다.
// 모델은 선지를 5개 썼는데 "선지가 9개다"라는 거짓 피드백을 받아 재생성도 같은 실패.
// → 모든 키워드 줄(발문형·근거·정답·해설·오답)에 같은 관용을 준다.
const KEYWORD_WORDS = ["발문형", "근거", "정답", "해설", "오답"] as const;

/**
 * 키워드 줄 머리의 정규식 소스. 흡수 대상:
 * 인용(`>`)·헤딩(`#`~`######`)·불릿(`-`/`*`/`+`/`•`)·굵게·기울임·앞뒤 공백·전각 콜론,
 * 그리고 콜론이 아예 없는 헤딩형(`### 정답` 다음 줄에 값). 캡처 그룹 없음 —
 * String.split 에 그대로 쓰이므로 캡처를 만들면 분할 결과에 끼어든다.
 */
function keywordHead(word: string): string {
  const h = "[ \\t]*";
  const em = "(?:\\*\\*|__|\\*|_)?";
  return (
    `^${h}(?:>${h})*(?:#{1,6}${h})?(?:[-*+•][ \\t]+)?${em}${h}` +
    word +
    `${h}${em}${h}(?:[:：]${h}${em}${h}|(?=${h}$))`
  );
}

const keywordLine = (word: string, tail = "", flags = "m"): RegExp =>
  new RegExp(keywordHead(word) + tail, flags);

/** 값이 붙는 키워드 줄 — 값의 첫 글자가 공백이 아니어야 한다(빈 헤딩형은 다음 줄로 흘림). */
const VALUE_TAIL = "(\\S[^\\r\\n]*)$";

const RE_STEM = keywordLine("발문형", VALUE_TAIL);
const RE_EVIDENCE = keywordLine("근거", VALUE_TAIL);
const ANCHOR_ANSWER = keywordLine("정답");
const ANCHOR_WRONG = keywordLine("오답");
const RE_EXPLANATION_TO_WRONG = keywordLine(
  "해설",
  `([\\s\\S]*?)(?=${keywordHead("오답")})`,
);
const RE_EXPLANATION = keywordLine("해설", "([\\s\\S]+)$");
/** 한 줄이 키워드 줄인지 — 선지 이어짐 처리에서 구조 줄을 삼키지 않게 하는 가드. */
const ANY_KEYWORD_LINE = new RegExp(
  KEYWORD_WORDS.map((w) => `(?:${keywordHead(w)})`).join("|"),
);

/** 값 양끝의 굵게·기울임 표기를 벗긴다(`근거: **문장**` 의 잔재가 축자 대조를 깬다). */
function stripEmphasis(text: string): string {
  return text
    .replace(/^\s*(?:\*\*|__|\*|_)\s*/, "")
    .replace(/\s*(?:\*\*|__|\*|_)\s*$/, "")
    .trim();
}

/** 섹션 앵커 뒤 첫 값 줄 — `### 정답` 헤딩형처럼 값이 다음 줄로 내려간 드리프트 흡수. */
function firstValueLine(section: string): string {
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    return ANY_KEYWORD_LINE.test(line) ? "" : line;
  }
  return "";
}

// 줄 머리 장식(표 파이프·불릿·굵게)을 걷어낸다 — 모델이 목록을 꾸미는 실측 드리프트.
function stripLineDecoration(line: string): string {
  return line
    .trim()
    .replace(/^\|+\s*/, "")
    .replace(/\s*\|+$/, "")
    .replace(/^(?:[-*•]\s+)+/, "")
    .trim();
}

// 라벨 뒤 본문 정리 — 잔여 구분자(파이프·콜론·마침표)와 굵게 표기를 흡수한다.
function cleanOptionText(raw: string): string {
  return raw
    .replace(/^[|:：.)\]]+\s*/, "")
    .replace(/\s*\|+.*$/, "")
    .replace(/^\*\*\s*/, "")
    .replace(/\s*\*\*$/, "")
    .trim();
}

const CIRCLED_HEAD = /^(?:\*\*)?\s*([①②③④⑤⑥⑦⑧])(?:\*\*)?\s*(.*)$/;
const DIGIT_HEAD = /^(?:\*\*)?\s*[([]?([1-8])[)\].]?(?:\*\*)?\s+(.*)$/;

/** 구분선·표 구분행 — 이어짐으로 흡수하면 선지 본문이 오염된다. */
const RULE_LINE = /^[-=_~|#>*+.\s]+$/;

/**
 * 라벨 줄을 줄 단위로 관대하게 수집한다. 계약형(원문자)이 하나라도 있으면 그것만
 * 쓰고, 하나도 없을 때만 숫자 표기 드리프트로 폴백한다 — 산문 속 번호 목록을
 * 선지로 오인해 개수가 부풀지 않게 하는 2단 전략이다.
 *
 * **이어짐 관용**: 라벨·키워드·구분선 어느 것도 아닌 줄은 직전 선지의 접힌 뒷줄로
 * 보고 공백으로 이어 붙인다. 실측(프로브)에서 KILLER 장문 선지가 두 줄로 접히자
 * 둘째 줄이 통째로 버려져 `…것일 뿐이며,` 로 **쉼표에서 잘린 정답 선지**가 게이트
 * 완전 클린으로 저장됐다(정답 없는 문항 출하). 버리지 말고 이어 붙이고, 그래도
 * 잘린 흔적이 남으면 게이트가 라벨로 지목한다 — 철칙 3.
 */
function collectLabeledLines(section: string): { label: string; text: string }[] {
  const gather = (head: RegExp) => {
    const rows: { label: string; text: string }[] = [];
    for (const rawLine of section.split(/\r?\n/)) {
      const line = stripLineDecoration(rawLine);
      if (!line) continue;
      const m = line.match(head);
      const label = m ? mainIdeaLabelOf(m[1]) : "";
      if (label) {
        rows.push({ label, text: cleanOptionText(m?.[2] ?? "") });
        continue;
      }
      const last = rows[rows.length - 1];
      if (!last) continue;
      if (CIRCLED_HEAD.test(line) || DIGIT_HEAD.test(line)) continue;
      if (ANY_KEYWORD_LINE.test(line) || RULE_LINE.test(line)) continue;
      last.text = `${last.text} ${cleanOptionText(line)}`.trim();
    }
    return rows;
  };
  const circled = gather(CIRCLED_HEAD);
  return circled.length > 0 ? circled : gather(DIGIT_HEAD);
}

/** `정답:` 줄에서 라벨 선행 런을 뽑는다("① — 나머지는 ..." 의 사족을 흘린다). */
function parseAnswerRun(line: string): string[] {
  const answers: string[] = [];
  for (const part of line.split(/[,、·/]/)) {
    const m = stripLineDecoration(part).match(/^(?:\*\*)?\s*[([]?([①②③④⑤⑥⑦⑧]|[1-8])[)\].]?/);
    const label = m ? mainIdeaLabelOf(m[1]) : "";
    if (!label) break;
    if (!answers.includes(label)) answers.push(label);
  }
  return answers;
}

/** 인용부호로 감싼 근거 문장을 벗긴다(모델이 큰따옴표로 옮기는 실측 드리프트). */
function unquote(text: string): string {
  const s = text.trim();
  const m = s.match(/^["'“”‘’]([\s\S]+)["'“”‘’]$/);
  return (m ? m[1] : s).trim();
}

/**
 * 요지·주장 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·숫자·괄호·굵게·표 행), 콜론 전각, 오답 목록에 정답 줄을
 * 끼워 넣는 실측 패턴, 근거 문장 인용부호.
 */
export function parseMdMainIdea(text: string): MdMainIdeaQuestion {
  const stemLine = stripEmphasis(text.match(RE_STEM)?.[1] ?? "");
  const stemAxis: MainIdeaStemAxis =
    /주장/.test(stemLine) && !/요지/.test(stemLine) ? "주장" : "요지";

  const evidence = unquote(stripEmphasis(text.match(RE_EVIDENCE)?.[1] ?? ""));

  // 선지는 `정답:` 앞 구간에서만 읽는다 — 오답 목록의 같은 라벨과 섞이지 않게.
  // 정답 줄 자체가 없으면 `오답:` 앞까지로 자른다(선지 개수가 부풀어 "정답 누락"이라는
  // 진짜 원인이 "선지 10개" 로 은폐되는 것을 막는다 — 철칙 3).
  const answerSplit = text.split(ANCHOR_ANSWER);
  const wrongSplit = text.split(ANCHOR_WRONG);
  const anchors = { answer: answerSplit.length > 1, wrong: wrongSplit.length > 1 };
  const beforeAnswer = anchors.answer ? answerSplit[0] : (wrongSplit[0] ?? text);
  const options = collectLabeledLines(beforeAnswer);

  // 정답 값은 앵커 **뒤 첫 값 줄**에서 읽는다 — `### 정답` 처럼 값이 다음 줄로
  // 내려간 헤딩형까지 같은 경로로 흡수된다(같은 줄 형식은 그대로 첫 줄이 된다).
  const answers = parseAnswerRun(anchors.answer ? firstValueLine(answerSplit[1] ?? "") : "");

  const wrongSection = anchors.wrong ? (wrongSplit[1] ?? "") : "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 조용한 버림이 아니다: 게이트 #9 가 남은 라벨 집합을 선지·정답 집합과 대조하므로
  // 이 필터로 생긴 결손·중복은 전부 게이트에 드러난다.
  const wrong = collectLabeledLines(wrongSection).filter((w) => !answers.includes(w.label));

  const explanation = stripEmphasis(
    text.match(RE_EXPLANATION_TO_WRONG)?.[1]?.trim() ??
      text.match(RE_EXPLANATION)?.[1]?.trim() ??
      "",
  );

  return { kind: "mainIdea", stemAxis, evidence, options, answers, explanation, wrong, anchors };
}

// 인라인 정답 표시("① ... (정답)") — `정답:` 줄과 중복된 계약이라 형식에서 뺐지만
// 모델이 습관적으로 붙인다. 선지 본문에 남으면 학생 표면에 정답이 노출된다.
//
// ⚠ 종전에는 줄 끝(`$` 앵커)에만 걸려 있었다. 실측(프로브): `① (정답) …`(앞머리),
//   `① … ← 정답`(화살표), `① ✅ …`(체크 이모지)가 스냅·게이트·검증기를 전부
//   클린으로 통과해 **정답이 표시된 선지가 그대로 저장**됐다(critical). 이제 위치
//   무관 전역 치환이고, 스냅이 못 걷어낸 잔재는 게이트 #3 이 라벨로 지목한다.
//   체크 이모지 뒤 `️` 는 이형자 선택자다(`✔️` = `✔` + VS 2코드포인트) — 함께 걷어낸다.
const INLINE_ANSWER_MARK =
  /\s*(?:\*\*|__)?\s*(?:[([【]\s*(?:정답|오답|answer|correct)\s*(?:선지)?\s*[)\]】]|(?:←|⇐|⬅|<-|<=|→|⇒|➡|->|=>)\s*(?:정답|answer|correct)\s*(?:선지)?|[✅✔✓☑🟢🔴👉👈]️?)\s*(?:\*\*|__)?\s*/gi;

/**
 * 0원 자동 보정.
 *  (1) 선지 본문의 인라인 정답 표시 제거 — 정답의 진실원은 `정답:` 줄뿐이다.
 *  (2) `근거:` 줄을 지문 축자로 스냅 — 모델이 구두점·잔단어를 흘린 실측 드리프트를
 *      정본 snapExpressionSpan(머리·꼬리 축자 + 유일 구간 + 자카드 0.66) 가드로만
 *      교정한다. 애매하면 손대지 않고 게이트가 반려하게 둔다(정본 보수 가드).
 */
export function autoSnapMainIdea(
  q: MdMainIdeaQuestion,
  passage: string,
): { question: MdMainIdeaQuestion; corrections: string[] } {
  const corrections: string[] = [];

  const options = q.options.map((o) => {
    // 위치 무관 제거 후 공백 정돈 — 표시가 문장 중간에 박혀도 단어가 붙지 않게.
    const stripped = o.text.replace(INLINE_ANSWER_MARK, " ").replace(/\s{2,}/g, " ").trim();
    if (stripped === o.text || !stripped) return o;
    corrections.push(`${o.label} 선지의 인라인 정답 표시 제거`);
    return { ...o, text: stripped };
  });

  let evidence = q.evidence;
  if (evidence && !normalizeWs(passage).includes(normalizeWs(evidence))) {
    const snapped = snapExpressionSpan(passage, evidence);
    if (snapped) {
      corrections.push(
        `근거 문장을 지문 축자로 스냅: '${evidence.slice(0, 60)}' → '${snapped.slice(0, 60)}'`,
      );
      evidence = snapped;
    }
  }

  return {
    question: corrections.length > 0 ? { ...q, options, evidence } : q,
    corrections,
  };
}
