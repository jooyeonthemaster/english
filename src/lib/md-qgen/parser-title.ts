// ============================================================================
// 제목 추론(TITLE) md 파서 · 0원 스냅 · 0원 게이트.
// 견본: parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형은 지문을 **변형하지 않는다.** 따라서 다른 유형의 최강 게이트인
// "지문 재구성 일치"가 아예 없다 — 대신 게이트의 무게중심은 선지 형상(개수·라벨
// 축·중복·언어·길이 균형)과 정답·오답해설 축 정합에 실린다.
//
// ⚠ 후처리가 없다(PASSTHROUGH_TYPES, question-postprocess/types.ts:73).
//   게이트가 못 잡으면 그대로 출하된다.
// ============================================================================

import { normalizeWs } from "./parser";
import { TITLE_MD_CIRCLED } from "./prompts-title";

export interface MdTitleOption {
  /** "①"~"⑧" — 학생 표면 라벨 축(어댑터에서 "1"~"8" 숫자 축으로 변환한다) */
  label: string;
  text: string;
}

export interface MdTitleQuestion {
  kind: "title";
  options: MdTitleOption[];
  /** 정답 라벨 — `정답:` 줄이 유일 진실원(선지 줄은 정답 여부를 말하지 않는다) */
  answers: string[];
  explanation: string;
  wrong: { label: string; text: string }[];
}

const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;

// ── 키워드 줄(`정답:`·`해설:`·`오답:`) 장식 관용 ────────────────────────────
// 선지 줄만 관대하고 키워드 줄은 무관용이면, 모델이 헤더를 굵게(`**정답:**`) 쓰는
// 순간 그 필드가 통째로 사라지고 게이트가 "정답 누락"·"오답해설 누락: ①" 처럼
// **사실과 다른 원인**을 지목한다. 그 문구가 그대로 [반려 재생성] 피드백에 실려
// 모델을 정답 누출 방향으로 민다(규범 §1-B 철칙 3·5 — 조용한 버림 금지, 자리 지목).
// 흡수 대상(실측 드리프트): 앞 공백 · 불릿(`- 정답:`) · 헤딩(`### 오답:`) ·
// 인용(`> 해설:`) · 굵게(`**정답:**` / `**정답**:`) · 전각 콜론(`정답：`).
const HSPACE = "[^\\S\\r\\n]";
const KEY_PREFIX = `${HSPACE}*(?:>${HSPACE}*)?(?:[-*•]${HSPACE}+)?(?:#{1,6}${HSPACE}*)?(?:\\*{1,3}|__)?${HSPACE}*`;
const KEY_SUFFIX = `${HSPACE}*(?:\\*{1,3}|__)?${HSPACE}*[:：]`;

/** 키워드 줄 헤더 매처 — 구역 분할(split)용. 캡처 그룹을 두지 않는다(split 오염 방지). */
function keywordHeadRe(word: string): RegExp {
  return new RegExp(`^${KEY_PREFIX}${word}${KEY_SUFFIX}`, "m");
}

const ANSWER_HEAD_RE = keywordHeadRe("정답");
const EXPLANATION_HEAD_RE = keywordHeadRe("해설");
const WRONG_HEAD_RE = keywordHeadRe("오답");

const ANSWER_LINE_RE = new RegExp(
  `^${KEY_PREFIX}정답${KEY_SUFFIX}${HSPACE}*(.*)$`,
  "m",
);
const EXPLANATION_RE = new RegExp(
  `^${KEY_PREFIX}해설${KEY_SUFFIX}${HSPACE}*([\\s\\S]*?)(?=^${KEY_PREFIX}오답${KEY_SUFFIX})`,
  "m",
);
const EXPLANATION_TAIL_RE = new RegExp(
  `^${KEY_PREFIX}해설${KEY_SUFFIX}${HSPACE}*([\\s\\S]+)$`,
  "m",
);

// ── 한국어 해설 산문 오염 검사 ──────────────────────────────────────────────
// question-quality/validators/explanation-foreign-text.ts 의 등가 이식.
// 그 검증기는 md 레인에서 **차단력이 0** 이다 — 라우트가 qualityIssues 를 기록만
// 하므로(md-stream/route.ts) 한자 혼입·영단어 짜깁기가 그대로 저장·출하된다.
// 하필 그 검증기의 도입 근거가 구형 flash TITLE 문항의 일본어 가나 혼입 실적발이라,
// 이 유형이야말로 0원 게이트로 닫아야 한다.
// ※ 문자 클래스는 **전부 \uXXXX 이스케이프**로 적는다. 소스에 CJK 문자를 직접 쓰면
//   도구체인 NFC 정규화가 호환한자 U+F900(豈)을 U+8C48 로 접어 `F900-FAFF` 범위가
//   `8C48-FAFF` 로 벌어지고, 그 안에 한글 음절(AC00-D7A3)이 통째로 들어와 **정상
//   한국어 해설이 전건 반려**된다. 이 파일 작성 중 실제로 그 오염이 재현됐다.
// 범위: 히라가나 3041-3096 · 가타카나 30A1-30FA · CJK확장A 3400-4DBF ·
//       CJK통합한자 4E00-9FFF · 호환한자 F900-FAFF · 중문 구두점 3001·3002.
//       한글 음절(AC00-D7A3)은 당연히 미포함.
const HANJA_CLASS = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
const FOREIGN_CJK_RE = new RegExp(
  `[\\u3041-\\u3096\\u30A1-\\u30FA${HANJA_CLASS}\\u3001\\u3002]`,
);
// 공백/한글/여는 인용부호 뒤의 소문자 라틴 어절(2자+)에 종결어미 "다"(U+B2E4)가
// 직접 붙는 짜깁기. 정상 한국어는 자음 말음 외래어에 "이다"를 쓴다("system이다").
const LATIN_JAM_RE = new RegExp(
  "(?:^|[\\s\\uAC00-\\uD7A3(\"'\\u2018\\u201C])([a-z]{2,})\\uB2E4" +
    "(?=[\\s.,\\u00B7)!?\"'\\u2019\\u201D]|$)",
);
// 한글 직후 괄호 한자 병기("공(功)이")는 정당한 표기 관례라 검사 전 제거한다.
// 가나는 병기 관례가 없으므로 이 클래스에서 의도적으로 제외한다(정본 동형).
const HANJA_ANNOTATION_RE = new RegExp(
  `([\\uAC00-\\uD7A3])\\(([${HANJA_CLASS}]{1,8})\\)`,
  "g",
);

/** 한국어 산문 필드 오염 검사 — `where` 는 자리를 지목하는 접두사다(철칙 5). */
function koreanProseIssues(where: string, text: string): string[] {
  const cleaned = text.replace(HANJA_ANNOTATION_RE, "$1");
  const out: string[] = [];
  const cjk = FOREIGN_CJK_RE.exec(cleaned);
  if (cjk) {
    out.push(`${where}에 한국어 산문에 올 수 없는 외국 문자('${cjk[0]}')가 섞임`);
  }
  const jam = LATIN_JAM_RE.exec(cleaned);
  if (jam) {
    out.push(`${where}에 영단어와 종결어미가 직접 접합된 짜깁기('${jam[1]}다')가 있음`);
  }
  return out;
}

/** 라벨 표기 정규화 — 원문자·"(3)"·"3." 어느 표기로 와도 원문자 축으로 접는다. */
export function titleMdLabel(raw: unknown): string {
  const token = String(raw ?? "")
    .trim()
    .replace(/[()[\]（）.,:：]/g, "");
  if (!token) return "";
  if (TITLE_MD_CIRCLED.includes(token)) return token;
  const n = Number(token);
  return Number.isInteger(n) && n >= 1 && n <= TITLE_MD_CIRCLED.length
    ? TITLE_MD_CIRCLED[n - 1]
    : "";
}

// 줄 선두 장식 제거 — 모델이 목록을 꾸미는 실측 드리프트(표 행 파이프·불릿·굵게·
// 헤딩·인용). 키워드 줄과 같은 수준의 관용을 유지한다.
function stripLineDecoration(line: string): string {
  return line
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*\s*/, "");
}

// 키워드 줄 payload 의 강조 장식 제거. 굵게 마커는 위치를 가리지 않고 전부 걷어낸다 —
// 한국어 해설에 `**`/`__` 가 리터럴로 올 일이 없고, 짝이 어긋난 잔재를 남기면 저장
// 문자열에 그대로 실려 학생 표면에 노출된다(cleanOptionText 와 동일 근거).
function cleanExplanationText(raw: string): string {
  return raw
    .replace(/\*\*|__/g, "")
    .replace(/^[\s*_]+/, "")
    .replace(/[\s*_]+$/, "")
    .trim();
}

// 라벨 뒤 본문 정리 — 잔여 파이프(표 셀)·굵게 마커·라벨 직후 구분자를 흡수한다.
// 굵게 마커는 위치를 가리지 않고 전부 걷어낸다: 제목에도 오답 해설에도 `**` 가
// 리터럴로 올 일이 없고, 짝이 어긋난 잔재(`② **방향반대** — ...`)를 남기면 저장
// 문자열에 그대로 실려 학생 표면에 노출된다.
function cleanOptionText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/^[-–—:：)]\s+/, "")
    .replace(/\s*\|\s*$/, "")
    .trim();
}

// 원문자는 구분자 없이도 라벨이지만, 맨몸 아라비아 숫자는 반드시 구분자를
// 요구한다 — 그렇지 않으면 "5 titles below" 같은 산문 줄을 선지로 오인한다.
const OPTION_LINE_HEAD =
  /^(?:([①-⑧])|[（(]\s*(\d)\s*[）)]|(\d)\s*[.)])\s*(.*)$/;

function parseOptionLines(section: string): MdTitleOption[] {
  const out: MdTitleOption[] = [];
  for (const rawLine of section.split(/\r?\n/)) {
    const head = stripLineDecoration(rawLine).match(OPTION_LINE_HEAD);
    if (!head) continue;
    const label = titleMdLabel(head[1] ?? head[2] ?? head[3] ?? "");
    if (!label) continue;
    out.push({ label, text: cleanOptionText(head[4] ?? "") });
  }
  return out;
}

// `정답:` 줄의 **선행 라벨 런**만 취한다 — "정답: ② — ④는 매력적 오답" 처럼
// 부가 설명에 섞인 라벨을 정답으로 오인하지 않기 위함(정본 어법 규약 계승).
function parseAnswerRun(line: string): string[] {
  const labels: string[] = [];
  const token = /^(?:([①-⑧])|[（(]\s*(\d)\s*[）)]|(\d))\s*[.)]?/;
  let rest = line.trim();
  for (;;) {
    const match = rest.match(token);
    if (!match) break;
    const label = titleMdLabel(match[1] ?? match[2] ?? match[3] ?? "");
    if (!label) break;
    if (!labels.includes(label)) labels.push(label);
    rest = rest.slice(match[0].length);
    // 구분자: 쉼표·가운뎃점·한국어 접속(과/와/및/그리고), 또는 원문자끼리의 직접 인접("②③").
    // 접속어를 흡수해도 안전한 이유: 뒤에 라벨 토큰이 안 오면 그 자리에서 멈추므로
    // "정답: ① 과연 …" 같은 산문에서 없는 정답을 만들어 내지 않는다.
    const separator =
      rest.match(/^\s*(?:[,、·]|및|과|와|그리고|and)\s*/i) ?? rest.match(/^(?=[①-⑧])/);
    if (!separator) break;
    rest = rest.slice(separator[0].length);
  }
  return labels;
}

/**
 * 제목 추론 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·괄호숫자·점표기), 전각 콜론, 불릿·굵게·표 행 장식,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdTitle(text: string): MdTitleQuestion {
  // 선지 구역은 `정답:`/`해설:`/`오답:` 이전까지다 — 해설 본문의 번호 나열을
  // 선지로 오인하지 않게 구역을 먼저 자른다(철칙 3: 조용히 버리지도, 줍지도 않는다).
  const beforeWrong = text.split(WRONG_HEAD_RE)[0] ?? text;
  const beforeAnswer = beforeWrong.split(ANSWER_HEAD_RE)[0] ?? beforeWrong;
  const optionRegion = beforeAnswer.split(EXPLANATION_HEAD_RE)[0] ?? beforeAnswer;

  // 정답 줄 payload 의 `*`·`_` 는 전부 제거한다 — 라벨·구분자 어디에도 리터럴로 올
  // 일이 없고, 남겨 두면 `정답: **①**, **②**` 에서 두 번째 라벨이 조용히 유실된다.
  const answers = parseAnswerRun(
    (text.match(ANSWER_LINE_RE)?.[1] ?? "").replace(/[*_]/g, ""),
  );
  const answerSet = new Set(answers);

  const wrongSection = text.split(WRONG_HEAD_RE)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 조용한 버림이 아니다: 게이트가 오답 라벨 **집합**을 비정답 집합과 대조하므로
  // 이 필터로 생긴 결손·중복은 전부 게이트 문구에 드러난다.
  const wrong = parseOptionLines(wrongSection)
    .map((row) => ({ label: row.label, text: row.text }))
    .filter((row) => !answerSet.has(row.label));

  return {
    kind: "title",
    options: parseOptionLines(optionRegion),
    answers,
    explanation: cleanExplanationText(
      text.match(EXPLANATION_RE)?.[1] ?? text.match(EXPLANATION_TAIL_RE)?.[1] ?? "",
    ),
    wrong,
  };
}

/**
 * 0원 자동 보정. 반려 주계통 두 가지를 흡수한다.
 *  (1) 선지 제시 순서 뒤바뀜 → 라벨 기준 정렬(위치의 진실원은 라벨이다).
 *  (2) 선지 본문에 자기 라벨이 한 번 더 박힌 드리프트("② ② The Hidden Cost").
 * 보수 가드: 라벨 집합이 온전한 순열일 때만 정렬한다. 라벨이 중복·결손이면
 * 손대지 않고 게이트가 원인을 직접 말하게 둔다(정본 규약).
 */
export function autoSnapTitleOptions(q: MdTitleQuestion): {
  question: MdTitleQuestion;
  corrections: string[];
} {
  const corrections: string[] = [];
  const rank = (label: string) => TITLE_MD_CIRCLED.indexOf(label);

  let options = q.options.map((option) => {
    // ⚠ 아라비아 분기는 구분자(`.`·`)`·괄호)를 **필수**로 요구한다. 선택으로 두면
    //   자기 번호와 같은 숫자로 시작하는 정상 제목의 첫 토큰을 삼킨다
    //   (실측: `⑤ 5 Ways Cities Get Quiet Wrong` → `Ways Cities Get Quiet Wrong`).
    //   게이트·검증기·후처리 어디도 이 손상을 못 잡아 잘린 제목이 그대로 출하됐다.
    //   스냅이 흡수하려던 실제 드리프트는 원문자 중복(`② ② The Hidden Cost`)과
    //   `5. `/`(5) ` 표기이며, 맨몸 숫자 분기는 그 어느 것도 커버하지 않았다.
    //   보수 가드 규약(확실할 때만 교정) 그대로다 — 애매하면 손대지 않는다.
    const n = rank(option.label) + 1;
    const selfLabelHead = new RegExp(`^(?:${option.label}|[（(]${n}[）)]|${n}[.)])\\s+`);
    const removed = option.text.match(selfLabelHead)?.[0]?.trim();
    if (!removed) return option;
    // 무엇이 지워졌는지 인용한다 — 문구만 남고 실물이 없으면 사후 추적이 불가능하다.
    corrections.push(`${option.label} 선지 본문의 라벨 중복 표기('${removed}')를 제거`);
    return { ...option, text: option.text.replace(selfLabelHead, "").trim() };
  });

  const labelRun = options.map((option) => option.label).join("");
  const sorted = [...options].sort((a, b) => rank(a.label) - rank(b.label));
  if (
    options.length > 1 &&
    new Set(labelRun).size === options.length &&
    options.every((option) => rank(option.label) >= 0) &&
    sorted.map((option) => option.label).join("") !== labelRun
  ) {
    options = sorted;
    corrections.push("선지 제시 순서를 라벨 순으로 정렬");
  }

  return {
    question: corrections.length > 0 ? { ...q, options } : q,
    corrections,
  };
}

export interface TitleGateOptions {
  optionCount?: number;
  answerCount?: number;
  /** 교사 설정 optionLanguage — 선지 텍스트 언어를 결정형으로 집행한다. */
  optionLanguage?: "ko" | "en";
  /** answer-only 모드에서만 false. 기본은 오답해설 전수 요구. */
  requireWrong?: boolean;
}

// 제목이라 부를 수 없는 길이. 문장을 통째로 실어 나른 선지를 잡는 상한이며,
// 정상 제목(영어 4~12단어 / 한국어 한 구)은 여유 있게 통과한다.
const TITLE_OPTION_MAX_CHARS = 120;

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdTitle(
  q: MdTitleQuestion,
  passage: string,
  options?: TitleGateOptions,
): string[] {
  const optionCount = options?.optionCount ?? q.options.length;
  const answerCount = options?.answerCount ?? 1;
  const optionLanguage = options?.optionLanguage ?? "en";
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];

  // #1 선지 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (q.options.length !== optionCount) {
    return [`선지 ${q.options.length}개 (${optionCount}개 필요)`];
  }

  // #2 라벨 축 정합 — 원문자 ①부터 순서대로.
  const expected = TITLE_MD_CIRCLED.slice(0, optionCount).split("");
  const actualRun = q.options.map((option) => option.label).join("");
  if (actualRun !== expected.join("")) {
    v.push(`선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${actualRun || "없음"}`);
  }

  // #3~#5 선지 본문 — 누락·과길이·언어 위반을 라벨로 지목한다.
  const seen = new Map<string, string>();
  for (const option of q.options) {
    const text = normalizeWs(option.text);
    if (!text) {
      v.push(`${option.label} 선지 텍스트 누락`);
      continue;
    }
    if (text.length > TITLE_OPTION_MAX_CHARS) {
      v.push(
        `${option.label} 선지가 제목이 아니라 문장 길이(${text.length}자, ${TITLE_OPTION_MAX_CHARS}자 이하 필요)`,
      );
    }
    if (optionLanguage === "en" && HANGUL_RE.test(text)) {
      v.push(`${option.label} 선지에 한국어가 섞임(영어 제목 설정): '${text.slice(0, 40)}'`);
    }
    if (optionLanguage === "en" && !LATIN_RE.test(text)) {
      v.push(`${option.label} 선지에 영문이 없음(영어 제목 설정)`);
    }
    if (optionLanguage === "ko" && !HANGUL_RE.test(text)) {
      v.push(`${option.label} 선지에 한국어가 없음(한국어 제목 설정): '${text.slice(0, 40)}'`);
    }
    const key = text.toLowerCase();
    const twin = seen.get(key);
    if (twin) v.push(`선지 중복 — ${twin} 와 ${option.label} 가 같은 제목`);
    else seen.set(key, option.label);
  }

  // #6 선지 길이 균형 — 정답만 유독 길면 지문을 안 읽고도 찍힌다.
  // 임계는 fast 검증기 option-length-giveaway 와 같은 값(최장 >= 최단 3배 AND 차이 18자
  // 초과)이라, fast 가 경고를 내는 명백한 사례에서만 발화한다.
  const lengths = q.options.map((option) => normalizeWs(option.text).length).filter((n) => n > 0);
  if (lengths.length === q.options.length && q.options.length > 1) {
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    if (longest >= shortest * 3 && longest - shortest > 18) {
      const longLabel = q.options[lengths.indexOf(longest)]?.label ?? "";
      const shortLabel = q.options[lengths.indexOf(shortest)]?.label ?? "";
      v.push(
        `선지 길이 불균형 — ${longLabel}(${longest}자) 와 ${shortLabel}(${shortest}자). 길이만으로 정답이 드러난다`,
      );
    }
  }

  // #7 정답 — `정답:` 줄이 유일 진실원.
  const labelSet = new Set(q.options.map((option) => option.label));
  if (q.answers.length === 0) {
    v.push("정답 누락");
  } else if (q.answers.length !== answerCount) {
    v.push(`정답 ${q.answers.length}개 (${answerCount}개 필요) — 실제 ${q.answers.join(", ")}`);
  }
  for (const label of q.answers) {
    if (!labelSet.has(label)) v.push(`정답 라벨(${label})이 선지에 없음`);
  }

  // #8 정답 선지가 지문 한 문장의 축자 복사면 압축이 없다(제목이 아니라 인용).
  const foldedPassage = normalizeWs(passage).toLowerCase();
  for (const label of q.answers) {
    const text = normalizeWs(q.options.find((option) => option.label === label)?.text ?? "");
    if (!text) continue;
    const words = text.split(" ").filter(Boolean).length;
    if (words >= 7 && foldedPassage.includes(text.toLowerCase())) {
      v.push(`${label} 정답 선지가 지문 축자 복사(${words}단어) — 제목은 압축 재진술이어야 한다`);
    }
  }

  if (!q.explanation) v.push("해설 누락");
  else v.push(...koreanProseIssues("해설", q.explanation));

  // #9 해설·오답해설 한국어 산문 오염 — fast 는 error 로 차단하지만 md 는 기록만
  // 하므로(qualityIssues 비차단) 여기서 막지 않으면 그대로 학생 표면에 나간다.
  for (const row of q.wrong) {
    if (row.text) v.push(...koreanProseIssues(`${row.label} 오답해설`, row.text));
  }

  // #10 오답해설 — 비정답 라벨 집합과 정확히 일치해야 한다(결손·잉여를 라벨로 지목).
  const wrongNeeded = optionCount - answerCount;
  if (requireWrong) {
    const answerSet = new Set(q.answers);
    const got = q.wrong.map((row) => row.label);
    const gotSet = new Set(got);
    // ⚠ 정답을 못 읽은 상태에서는 결손 검사를 하지 않는다. q.answers 가 비면
    //   needed 가 정답 라벨까지 포함해 "오답해설 누락: ①" 이라는 **항상 거짓인**
    //   문구가 만들어지고, 그게 [반려 재생성] 피드백으로 나가 모델에게 정답
    //   자리의 오답해설을 쓰라고(=정답 누출) 요구한다. 원인은 이미 "정답 누락"이
    //   지목했으므로 여기서 덧붙일 사실이 없다.
    const needed = q.answers.length > 0 ? expected.filter((label) => !answerSet.has(label)) : [];
    const missing = needed.filter((label) => !gotSet.has(label));
    if (missing.length > 0) {
      v.push(`오답해설 누락: ${missing.join(", ")} (${wrongNeeded}개 필요)`);
    }
    if (got.length !== gotSet.size) {
      v.push(`오답해설 라벨 중복 — 해설이 덮어써진다 (${got.join(", ")})`);
    }
    if (q.wrong.some((row) => !row.text.trim())) {
      v.push("오답해설 본문이 빈 줄이 있음");
    }
    const extra = got.filter((label) => !labelSet.has(label));
    if (extra.length > 0) v.push(`오답해설에 없는 선지 라벨: ${extra.join(", ")}`);
  }
  if (q.wrong.some((row) => q.answers.includes(row.label))) {
    v.push("오답해설에 정답 라벨 포함");
  }

  return v;
}
