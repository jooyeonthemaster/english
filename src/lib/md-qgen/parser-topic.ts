// ============================================================================
// 주제 추론(TOPIC) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형은 지문을 **전혀 변형하지 않는다**. 따라서 다른 유형의 최강 불변식인
// "지문 재구성 일치"가 아예 없다 — 검사할 대상은 선지 집합의 형상과 정답 축뿐이다.
// 그만큼 형식도 얇다: 원문자 선지 N줄 + `정답:` + `해설:` + `오답:`.
//
// ⚠ 형식 설계 철칙(§1-B) 준수 확인:
//   ① 한 정보는 한 곳에서만 — 정답 여부는 `정답:` 줄에만 있다. 선지 줄에 O/X 칸을
//      두지 않는다(반의어 실사용 2연속 반려의 원인이 정확히 그 중복 칸이었다).
//   ② 줄당 칸 수 최소 — 선지 줄의 칸은 "라벨 + 본문" 하나뿐이라 구분자 드리프트
//      지점이 0이다.
//   ③ 조용한 유실 금지 — 줄 단위로 훑어 라벨이 읽히는 줄만 담고, 무엇이 잘못됐는지는
//      게이트가 라벨을 지목해 말한다.
//
// ⚠ 게이트 본체는 gate-topic.ts 다(파일 500줄 규약 + 관심사 분리).
//   의존 방향은 gate-topic → parser-topic 단방향이다(재수출로 순환을 만들지 마라).
// ============================================================================

/** 파싱 관용 라벨 축 — 원문자 ①~⑩(설정 상한 8보다 넉넉히, 개수는 게이트가 본다). */
export const TOPIC_PARSE_LABELS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
] as const;

export interface MdTopicOption {
  /** "①"~"⑩" */
  label: string;
  text: string;
}

export interface MdTopicQuestion {
  kind: "topic";
  options: MdTopicOption[];
  /** 정답 라벨 — 이 문항에서 정답의 **유일 진실원**(K개, 지문·선지 어디에도 중복 표기 없음) */
  answers: string[];
  /** answers[0] — 단일 정답 경로 편의 접근자 */
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

/** 라벨 표기 흔들림 흡수 — 원문자·평숫자·괄호·마침표 표기를 원문자로 정규화. */
export function topicLabel(raw: string): string {
  const token = String(raw ?? "").trim();
  if (!token) return "";
  const circledIndex = TOPIC_PARSE_LABELS.indexOf(
    token as (typeof TOPIC_PARSE_LABELS)[number],
  );
  if (circledIndex >= 0) return TOPIC_PARSE_LABELS[circledIndex];
  const digits = token.replace(/[^0-9]/g, "");
  if (!digits) return "";
  const n = Number(digits);
  return n >= 1 && n <= TOPIC_PARSE_LABELS.length ? TOPIC_PARSE_LABELS[n - 1] : "";
}

/** 원문자 라벨 → 0-based 인덱스. 미해석은 -1. */
export function topicLabelIndex(label: string): number {
  return TOPIC_PARSE_LABELS.indexOf(label as (typeof TOPIC_PARSE_LABELS)[number]);
}

// 라벨로 시작하는 줄만 후보로 본다. 라벨 앞의 마크다운 장식(불릿·인용·굵게)과
// 표 파이프는 흡수한다 — 모델이 선지 목록을 꾸미는 실측 드리프트.
const CIRCLED_LINE = /^[\s|>*•‧-]*(?:\*\*|__)?\s*([①-⑳])\s*(?:\*\*|__)?\s*[.):：]?\s*(.+)$/;
// 폴백: 모델이 원문자 대신 평숫자를 쓴 경우("1." / "(1)" / "1)"). 구분자를 반드시
// 요구해 본문 속 숫자 문장이 선지로 오인되지 않게 한다.
const DIGIT_LINE = /^[\s|>*•‧-]*(?:\*\*|__)?\s*[([]?\s*(\d{1,2})\s*[)\].:：]\s*(?:\*\*|__)?\s*(.+)$/;

/**
 * 줄 선두의 '라벨 표기'를 식별한다. **본문 속 지칭과 구별하는 것이 전부**다:
 *   "② The role" · "②. The role" · "1) The role" → 라벨 표기(구분자 또는 공백이 뒤따름)
 *   "②와 달리 …"  · "1990년대에는 …"            → 라벨이 아니라 본문(그대로 둔다)
 */
function leadingLabelToken(text: string): { token: string; length: number } | null {
  const circled = text.match(/^([①-⑳])[ \t]*(?:[.):：][ \t]*|(?=\s))\s*/);
  if (circled) return { token: circled[1], length: circled[0].length };
  // 평숫자는 구분자 + 공백을 모두 요구한다 — 본문 숫자를 라벨로 오인하지 않게.
  const digit = text.match(/^[([]?[ \t]*(\d{1,2})[ \t]*[)\].:：][ \t]+/);
  if (digit) return { token: digit[1], length: digit[0].length };
  return null;
}

/**
 * 선지·오답 본문의 장식 제거 — 굵게/기울임 마커, 감싼 따옴표, 표 잔여 파이프.
 *
 * ⚠ `ownLabel` 을 넘기면 **그 줄 자신의 라벨과 같은 토큰일 때만** 라벨 이중 표기를
 *   떼어낸다("① ① The role" / "① 1) The role"). 선두 원문자를 무조건 떼면
 *   다른 선지를 지칭하는 오답 해설("① ②와 달리 …")에서 지칭 대상이 조용히
 *   사라져 비문("와 달리 …")이 그대로 학생 표면에 출하된다 — 게이트도 후처리도
 *   PASSTHROUGH 라 아무도 못 고치고, 셔플 라벨 재매핑(remapCircledMentions)조차
 *   손댈 대상이 없어진다. 라벨을 모르는 호출(단순 장식 제거)은 인자를 비운다.
 */
export function stripTopicDecoration(raw: string, ownLabel?: string): string {
  let text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^\|\s*/, "").replace(/\s*\|+\s*$/, "").trim();
  // 라벨이 본문에 한 번 더 적힌 드리프트("① ① The role" / "① 1) The role").
  if (ownLabel) {
    const lead = leadingLabelToken(text);
    if (lead && topicLabel(lead.token) === ownLabel) {
      text = text.slice(lead.length).trim();
    }
  }
  // 굵게/기울임 래핑을 벗긴다(부분 강조는 남긴다 — 내용 훼손 금지).
  for (let i = 0; i < 2; i += 1) {
    const wrapped = text.match(/^(\*\*|__|\*|_)([\s\S]+?)\1$/);
    if (!wrapped) break;
    text = wrapped[2].trim();
  }
  const quoted = text.match(/^["“”'‘’]([\s\S]+?)["“”'‘’]$/);
  if (quoted) text = quoted[1].trim();
  return text;
}

// ── 키워드 줄 머리표 관용 (silent-drop 계통의 근본 처방) ─────────────────────
// 선지·데이터 줄만 관대하게 파싱하고 `정답:` `해설:` `오답:` 같은 **키워드 줄**을
// 무관용 정규식으로 잡으면, 모델이 머리표를 굵게(`**정답:**`) 쓰거나 전각 콜론
// (`정답：`)을 쓰는 순간 그 필드가 통째로 사라진다. 그러면 게이트가 "정답 누락"
// 처럼 **사실과 다른 원인**을 지목하고, 그 문구가 그대로 [반려 재생성] 피드백이
// 되어 모델을 엉뚱한 방향으로 몬다(철칙 3·4·5). 그래서 머리표를 한 곳에서 만들어
// 모든 키워드 줄에 일괄 적용한다.
//   흡수: 앞 장식(불릿 `-`·인용 `>`·해시 `#`·표 `|`·굵게 `**`) · `**정답:**` ·
//         `**정답**:` · 전각 콜론 · 콜론 뒤 장식(`정답: **②**` / `정답: \`②\``) · 공백.
const KEY_PREFIX = "^[\\s>|#*_~`•‧+-]*\\s*";
const KEY_SUFFIX = "\\s*(?:\\*\\*|__|[*_~`])?\\s*[:：][ \\t]*(?:\\*\\*|__|[*_`~])*[ \\t]*";

/** 키워드 줄 머리표의 정규식 소스. **캡처 그룹 없음** — split 에 그대로 쓴다. */
export function topicKeywordHead(keyword: string): string {
  return `${KEY_PREFIX}${keyword}${KEY_SUFFIX}`;
}

// 이어붙이기(연속 줄 접기)를 멈출 머리표.
// ⚠ 이 판정은 위 파싱용 머리표보다 **일부러 더 헐겁다.** 파서가 못 읽은 머리표
//   (`【정답】:` 같은 미지의 장식)를 접기까지 삼켜 버리면, 필드 유실에 더해 직전
//   선지가 오염되는 2차 피해가 난다 — 못 읽는 것보다 나쁘다. 못 읽어도 삼키지는
//   않게, 접기 중단은 관대하게 잡는다.
//   한국어 키워드 + 콜론을 요구하므로 영어 선지의 이어진 뒷줄은 걸리지 않는다.
const FOLD_STOP_RE =
  /^[^가-힣A-Za-z0-9]{0,6}(?:정답|해설|오답|지문|발문|밑줄|원문|주제|선지|고침|포인트)[^가-힣A-Za-z0-9]{0,4}[:：]/;

// 목록 뒤에 모델이 덧붙이는 사족(주석·경고·메모)도 접기에서 제외한다. 오답 목록은
// 출력의 꼬리라 사족이 전부 **마지막 오답 해설**에 달라붙는데, 그 해설은 학생
// 표면에 그대로 나간다 — 유실을 고치면서 새 오염을 들이지 않기 위한 짝 방어다.
const FOLD_STOP_NOTE_RE = /^[^가-힣A-Za-z0-9]{0,4}(?:※|⚠|주의|참고|비고|메모|경고|note\b)/i;

/** 이어진 뒷줄 정리 — 중첩 불릿·인용 접두만 떼고 내용은 그대로 보존한다. */
function continuationText(rawLine: string): string {
  return rawLine
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[-–—•‧>|+]|\*)\s+/, "")
    .trim();
}

/**
 * 라벨 줄 수확. 원문자가 계약이고 평숫자는 폴백인데, **둘을 합쳐서** 돌려준다 —
 * 모델이 목록 중간에 표기를 바꾸는 실측 드리프트에서 한쪽만 채택하면 나머지 줄이
 * 통째로 사라지고 게이트에는 "개수 부족"으로만 보인다(철칙 3: 조용한 유실 금지).
 * 라벨이 겹치면 원문자 줄이 이긴다. 중복 라벨 자체는 지우지 않고 게이트가 지목한다.
 *
 * ⚠ 라벨로 시작하지 **않는** 줄은 직전 항목의 이어진 뒷줄(하드랩·중첩 불릿)로 보고
 *   이어 붙인다. 그냥 버리면 선지·오답 해설의 뒷부분이 조용히 사라진 채 게이트가
 *   CLEAN 을 내고, 잘린 문장이 그대로 학생 표면에 출하된다 — 개수 오류로조차 보이지
 *   않는 최악의 유실이다(`해설:` 만 cleanProse 로 개행을 접어서 생기던 비대칭도 여기서
 *   사라진다). 접기는 **빈 줄**과 **다음 섹션 머리표**에서 멈춘다.
 */
function readLabeledLines(section: string): MdTopicOption[] {
  const circled: MdTopicOption[] = [];
  const digit: MdTopicOption[] = [];
  let last: MdTopicOption | null = null;
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    // 빈 줄은 블록 경계다 — 넘어서 이어 붙이면 무관한 산문이 선지에 달라붙는다.
    if (!line.trim()) {
      last = null;
      continue;
    }
    const c = line.match(CIRCLED_LINE);
    if (c) {
      const label = topicLabel(c[1]);
      const text = stripTopicDecoration(c[2], label);
      last = label && text ? { label, text } : null;
      if (last) circled.push(last);
      continue;
    }
    const d = line.match(DIGIT_LINE);
    if (d) {
      const label = topicLabel(d[1]);
      const text = stripTopicDecoration(d[2], label);
      last = label && text ? { label, text } : null;
      if (last) digit.push(last);
      continue;
    }
    if (!last || FOLD_STOP_RE.test(line) || FOLD_STOP_NOTE_RE.test(line)) {
      last = null;
      continue;
    }
    const cont = continuationText(line);
    if (cont) last.text = `${last.text} ${cont}`;
  }
  const seen = new Set(circled.map((o) => o.label));
  const merged = [...circled, ...digit.filter((o) => !seen.has(o.label))];
  return merged.sort((a, b) => topicLabelIndex(a.label) - topicLabelIndex(b.label));
}

const HEAD_ANSWER = topicKeywordHead("정답");
const HEAD_EXPLAIN = topicKeywordHead("해설");
const HEAD_WRONG = topicKeywordHead("오답");

/** 산문 필드(해설)의 감싼 장식만 벗긴다 — 본문은 건드리지 않는다. */
function cleanProse(raw: string): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[*_]+\s*/, "")
    .replace(/\s*[*_]+$/, "")
    .trim();
}

/**
 * `정답:` 줄의 선행 라벨 런만 취한다(정본 parseGrammarAnswerFix 계승).
 * ⚠ 머리표가 콜론 **뒤**의 장식(`**정답:** ②`)까지 먹어야 한다 — 여기 남은 `**` 하나가
 *   런의 `^` 앵커를 깨서 이 유형의 유일 진실원을 통째로 날렸던 자리다.
 */
function parseTopicAnswers(text: string): string[] {
  const line = text.match(new RegExp(`${HEAD_ANSWER}\\s*(.+)$`, "m"))?.[1] ?? "";
  const token = String.raw`(?:[①-⑳]|[([]?\d{1,2}[)\].]?)`;
  const run =
    line.match(new RegExp(String.raw`^\s*(${token}(?:\s*[,，·、/]\s*${token})*)`))?.[1] ?? "";
  const labels: string[] = [];
  for (const m of run.matchAll(/[①-⑳]|\d{1,2}/g)) {
    const label = topicLabel(m[0]);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * 주제 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·평숫자·괄호), 불릿·굵게·표 행 장식, 전각 콜론,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdTopic(text: string): MdTopicQuestion {
  // 선지는 `정답:` 줄 위에서만 수확한다 — 해설·오답 구역의 라벨 줄이 선지로
  // 섞여 들어가는 최악의 오염을 구조로 차단한다.
  const answerHead = new RegExp(HEAD_ANSWER, "m");
  const wrongHead = new RegExp(HEAD_WRONG, "m");
  const beforeAnswer = text.split(answerHead)[0] ?? text;
  const optionSection = beforeAnswer.split(wrongHead)[0] ?? beforeAnswer;
  const wrongSection = text.split(wrongHead)[1] ?? "";

  const options = readLabeledLines(optionSection);
  const answers = parseTopicAnswers(text);
  const answerSet = new Set(answers);

  // 드리프트 관용: 모델이 오답 목록에 정답 줄("③ (정답)")을 끼워 넣는 실측 —
  // 지시로 안 막혀서 파서가 걸러낸다(정본 parseMdBlank 동일 처방).
  const wrong = readLabeledLines(wrongSection).filter((w) => !answerSet.has(w.label));

  const explanationRaw =
    text.match(new RegExp(`${HEAD_EXPLAIN}\\s*([\\s\\S]*?)(?=${HEAD_WRONG})`, "m"))?.[1] ??
    text.match(new RegExp(`${HEAD_EXPLAIN}\\s*([\\s\\S]+)$`, "m"))?.[1] ??
    "";

  return {
    kind: "topic",
    options,
    answers,
    answer: answers[0] ?? "",
    // 해설은 저장 형상이 한 줄이다(카드·시험지 렌더 공통) — 개행 드리프트를 접는다.
    explanation: cleanProse(explanationRaw),
    wrong,
  };
}

/**
 * 0원 자동 보정. 이 유형은 지문 대조 대상이 없으므로 스냅의 일은 **표면 정돈**뿐이다.
 * 내용을 지어내는 보정은 하지 않는다(마침표를 붙이지 않고 떼기만 한다) —
 * 애매하면 그대로 두고 게이트가 반려하게 한다는 정본 보수 가드 그대로다.
 *
 * ⚠ 다른 유형의 autoSnap* 과 달리 지문 인자를 받지 않는다. 보정할 대상이 전부
 *   모델 출력 표면이고 지문과 대조할 것이 하나도 없다는 사실 자체가 이 유형의
 *   정의다(지문 무변형) — 쓰지 않을 인자를 형식만 맞춰 남기지 않는다.
 */
export function autoSnapTopicOptions(
  q: MdTopicQuestion,
): { question: MdTopicQuestion; corrections: string[] } {
  const corrections: string[] = [];

  // 1) 장식 잔재 정돈 — 파싱 시 이미 1차로 벗겼고, 여기서는 남은 겹장식을 마저 벗긴다.
  //    자기 라벨을 넘겨 '다른 선지 지칭'을 라벨 이중 표기로 오인하지 않게 한다.
  let options = q.options.map((o) => {
    const text = stripTopicDecoration(o.text, o.label);
    if (text === o.text || !text) return o;
    corrections.push(`${o.label} 선지 장식 제거`);
    return { ...o, text };
  });

  // 2) 마침표 표기 혼재 정돈 — 일부만 마침표로 끝나면 그 자체가 정답을 흘리는
  //    표면 단서다. 붙이는 쪽이 아니라 **떼는 쪽**으로만 통일한다(내용 무첨가).
  const ended = options.filter((o) => /[.]$/.test(o.text));
  if (ended.length > 0 && ended.length < options.length) {
    options = options.map((o) =>
      /[.]$/.test(o.text) ? { ...o, text: o.text.replace(/\.+$/, "").trim() } : o,
    );
    corrections.push(
      `선지 마침표 표기 통일(${ended.map((o) => o.label).join("")} 의 마침표 제거)`,
    );
  }

  // 3) 오답 해설 장식 정돈 — 라벨 축은 건드리지 않는다.
  const wrong = q.wrong.map((w) => {
    const text = stripTopicDecoration(w.text, w.label);
    return text && text !== w.text ? { ...w, text } : w;
  });

  return { question: { ...q, options, wrong }, corrections };
}

/**
 * 선지 길이 단위. 영어 선지는 단어 수, 한국어 선지는 공백 제외 글자 수가
 * "학생 눈에 보이는 길이"에 가깝다 — 길이 평행 검사(게이트)의 척도로 쓴다.
 */
export function topicLengthUnits(text: string, optionLanguage: "en" | "ko"): number {
  const t = String(text ?? "").trim();
  if (!t) return 0;
  return optionLanguage === "ko"
    ? t.replace(/\s+/g, "").length
    : t.split(/\s+/).filter(Boolean).length;
}

export const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
export const LATIN_RE = /[A-Za-z]/;
