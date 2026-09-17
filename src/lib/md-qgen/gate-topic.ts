// ============================================================================
// 주제 추론(TOPIC) 0원 결정형 게이트 — LLM 콜 없음. 빈 배열이면 클린.
// 견본: parser-antonym.ts 의 gateMdAntonym / 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 이 유형은 지문을 변형하지 않아 "지문 재구성 일치"라는 최강 불변식이 없다.
// 그래서 게이트가 지킬 수 있는 것은 **선지 집합의 형상과 정답 축**뿐이다:
//   개수 · 라벨 축 · 중복 · 정답 존재 · 오답해설 개수 · 정답 누출 ·
//   선지 언어 · 길이 평행 · 지문 문장 축자 복사 금지.
// 의미 판정(이게 정말 주제인가)은 결정형으로 불가능하므로 프롬프트 공예의 몫이다 —
// 게이트가 못 하는 일을 하는 척하지 않는다.
//
// ⚠ 게이트 메시지는 반드시 **자리를 지목**한다(철칙 5). 이 문구가 그대로 재생성
//   프롬프트의 피드백으로 실린다 — "선지 4개(5개 필요)" 같은 문구는 모델에게
//   무엇을 고칠지 알려주지 못한다.
// ============================================================================

import { normalizeWs } from "./parser";
import {
  HANGUL_RE,
  LATIN_RE,
  TOPIC_PARSE_LABELS,
  topicLabelIndex,
  topicLengthUnits,
  type MdTopicQuestion,
} from "./parser-topic";

export interface TopicGateOptions {
  /** 선지 개수(교사 설정 실값 4~8) */
  optionCount?: number;
  /** 정답 개수(교사 설정 실값 1~optionCount-1) */
  answerCount?: number;
  /** 선지 언어 축 — 검증기 topic-option-language(error) 의 게이트 승격 이식 */
  optionLanguage?: "en" | "ko";
  /** answer-only 모드에서는 오답 해설을 요구하지 않는다 */
  requireWrong?: boolean;
}

/** 선지에 정답 표시가 섞이는 실측 드리프트("… (정답)", "… ★"). 끝자리만 정확 타격. */
const ANSWER_MARK_RE =
  /(?:[（([]\s*(?:정답|답|answer|correct(?:\s+answer)?)\s*[)）\]]|[★✔✅]|\s+—\s*정답)\s*$/i;

// 길이 평행 임계 — 비율만 보면 짧은 선지에서 오탐이 나므로 절대 차이도 함께 본다.
// 26-08-22 기출 전수 실측(주제 195문항, 훼손 24건 제외): 최장/최단 비율 분포
// p95=1.8·max=2.25 — 종전 2.2 는 관측 최대 안쪽이라 정상 학평 1건을 오반려했다
// (ebsi_go2_20220609-q23, ⑤ 9단어 vs ② 4단어 = 2.25x·차5, 정답이 최단인 정상
// 기출). 관측 최대 2.25 밖인 2.5 로 물려 기출 오반려 0%(캠페인 배선 기준).
// ⚠ 차이 한도(en 4→6)만 올리는 완화는 감사 기각 — 2.17x·차7 기출
//   (ebsi_go1_20221123-q23)이 존재해 비율이 조금만 흔들려도 재오탐이라 비율 축
//   완화만이 안전하다.
const LENGTH_RATIO_LIMIT = 2.5;
const LENGTH_DIFF_LIMIT = { en: 4, ko: 12 } as const;
// ko 하한 — 26-08-22 기출 실측 ko 선지 글자수(공백 제외) n=80: min=5 p50=14
// max=20. 종전 6 은 2007 평가원 모평(2007_06_3001177-q40)의 '성공의척도'·
// '봉사의의의'(5자, 원지 표기 '성공의 척도'도 공백 제외 5자 = OCR 산물 아님)를
// 오반려했다(ko 표본 16문항 중 1건 = 6.3%). ko 표본이 16건뿐인 소표본이라 관측
// 최소 5 에 딱 맞추지 않고 여유 1 을 둔 4 로 완화(감사 권장안).
// en 하한 3 은 관측 최소 3 과 일치(오반려 0건) — 유지.
const LENGTH_MIN = { en: 3, ko: 4 } as const;
const LENGTH_MAX = { en: 25, ko: 80 } as const;
// 정답만 유독 길면 내용을 안 읽고도 지목된다 — 2위 대비 배수·차이 동시 초과만 반려.
const ANSWER_OUTLIER_RATIO = 1.5;
// 오답 해설 최소 길이(한국어 한 문장 기준). 잘린 해설을 CLEAN 으로 흘려보내지 않는다.
const WRONG_TEXT_MIN = 12;

function labelList(labels: string[]): string {
  return labels.join("") || "없음";
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdTopic(
  q: MdTopicQuestion,
  passage: string,
  options?: TopicGateOptions,
): string[] {
  const optionCount = options?.optionCount ?? q.options.length;
  const answerCount = options?.answerCount ?? 1;
  const optionLanguage = options?.optionLanguage === "ko" ? "ko" : "en";
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];

  // #1 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려한다.
  //    무엇이 읽혔는지 함께 알려 "형식을 어겼나 / 파서가 못 읽었나"를 구분시킨다.
  if (q.options.length !== optionCount) {
    return [
      `선지 ${q.options.length}개 (${optionCount}개 필요) — 읽힌 라벨 ${labelList(
        q.options.map((o) => o.label),
      )}`,
    ];
  }

  // #2 라벨 축 — ①~Ⓝ 가 하나씩, 빠짐도 중복도 없어야 한다.
  const expected = TOPIC_PARSE_LABELS.slice(0, optionCount);
  const seenLabels = new Set<string>();
  for (const o of q.options) {
    if (seenLabels.has(o.label)) v.push(`선지 라벨 중복: ${o.label}`);
    seenLabels.add(o.label);
  }
  for (const label of expected) {
    if (!seenLabels.has(label)) v.push(`선지 라벨 ${label} 누락`);
  }
  for (const o of q.options) {
    if (topicLabelIndex(o.label) >= optionCount) {
      v.push(`선지 라벨 ${o.label} 은 범위 밖 — ${labelList([...expected])} 만 쓴다`);
    }
  }

  // #3 선지 본문 — 존재·언어 축·길이 범위·정답 표시 누출·지문 축자 복사.
  const passageNorm = normalizeWs(passage).toLowerCase();
  const seenTexts = new Map<string, string>();
  for (const o of q.options) {
    if (!o.text) {
      v.push(`${o.label} 선지 텍스트 누락`);
      continue;
    }
    if (ANSWER_MARK_RE.test(o.text)) {
      v.push(`${o.label} 선지에 정답 표시가 섞임 — 정답은 '정답:' 줄에만 쓴다`);
    }
    if (optionLanguage === "en") {
      if (HANGUL_RE.test(o.text)) {
        v.push(`${o.label} 선지에 한국어가 섞임 — 이 문항의 선지는 영어여야 한다`);
      } else if (!LATIN_RE.test(o.text)) {
        v.push(`${o.label} 선지에 영문이 없음 — 영어 주제구로 써라`);
      }
    } else if (!HANGUL_RE.test(o.text)) {
      v.push(`${o.label} 선지에 한국어가 없음 — 이 문항의 선지는 한국어여야 한다`);
    }

    const units = topicLengthUnits(o.text, optionLanguage);
    if (units < LENGTH_MIN[optionLanguage]) {
      v.push(`${o.label} 선지가 너무 짧아 주제 진술이 아님: '${o.text.slice(0, 40)}'`);
    } else if (units > LENGTH_MAX[optionLanguage]) {
      v.push(
        `${o.label} 선지가 너무 김(${units}) — 주제 선지는 압축된 구다: '${o.text.slice(0, 50)}…'`,
      );
    }

    // 지문 문장을 그대로 잘라 붙인 선지 — 주제는 압축이지 인용이 아니다.
    const norm = normalizeWs(o.text).toLowerCase();
    if (units >= 5 && passageNorm.length > 0 && passageNorm.includes(norm)) {
      v.push(`${o.label} 선지가 지문 표현을 그대로 옮김: '${o.text.slice(0, 50)}'`);
    }

    const dupOf = seenTexts.get(norm);
    if (dupOf) v.push(`선지 중복: ${dupOf} 와 ${o.label} 이 같은 표현`);
    else seenTexts.set(norm, o.label);
  }

  // #4 길이 평행 — 형태만 보고 정답이 지목되면 문항이 죽는다.
  const measured = q.options
    .filter((o) => o.text)
    .map((o) => ({ label: o.label, units: topicLengthUnits(o.text, optionLanguage) }))
    .filter((m) => m.units > 0);
  if (measured.length === optionCount && optionCount >= 2) {
    const sorted = [...measured].sort((a, b) => b.units - a.units);
    const longest = sorted[0];
    const shortest = sorted[sorted.length - 1];
    if (
      longest.units >= shortest.units * LENGTH_RATIO_LIMIT &&
      longest.units - shortest.units >= LENGTH_DIFF_LIMIT[optionLanguage]
    ) {
      v.push(
        `선지 길이 불균형 — ${longest.label}(${longest.units}) vs ${shortest.label}(${shortest.units}). 서로 비슷한 길이로 맞춰라`,
      );
    }
    // 정답이 최장이고 2위와도 크게 벌어지면 길이만으로 정답이 드러난다.
    const runnerUp = sorted[1];
    if (
      q.answers.includes(longest.label) &&
      longest.units >= runnerUp.units * ANSWER_OUTLIER_RATIO &&
      longest.units - runnerUp.units >= 3
    ) {
      v.push(
        `정답 선지 ${longest.label} 만 유독 김(${longest.units} vs 2위 ${runnerUp.units}) — 길이로 정답이 드러난다`,
      );
    }
  }

  // #5 정답 — `정답:` 줄이 유일 진실원이다(선지 줄에 정답 칸을 두지 않는 계약).
  if (q.answers.length === 0) {
    v.push("정답 누락 — '정답:' 줄이 없거나 라벨을 읽을 수 없음");
  } else if (q.answers.length !== answerCount) {
    v.push(
      `정답 라벨 ${q.answers.length}개 (${answerCount}개 필요) — 읽힌 값 ${labelList(q.answers)}`,
    );
  }
  for (const a of q.answers) {
    if (!seenLabels.has(a)) v.push(`정답 라벨(${a})이 선지에 없음`);
  }

  // 정답 축이 무너진 상태(라벨 0개 / 선지에 없는 라벨)에서는 **그 사실만** 보고한다.
  // 게이트 문구가 곧 [반려 재생성] 프롬프트다. 여기서 "② 오답 해설 누락" 같은 파생
  // 메시지를 함께 내면 모델이 순순히 따라 **정답 선지에도 오답 해설을 쓴** 재생성본을
  // 내고, 2차 게이트가 개수·정답 누출로 다시 반려한다. 재재생성이 없으므로 회복
  // 가능했던 1차 실패가 실패+크레딧 환불로 확정된다(#1 개수 반려가 즉시 return 하는
  // 것과 같은 원칙 — 틀린 자리를 지목하느니 아무 자리도 지목하지 않는다).
  const answerAxisBroken = q.answers.length === 0 || q.answers.some((a) => !seenLabels.has(a));

  // #6 해설
  if (!q.explanation) v.push("해설 누락");
  else if (q.explanation.length < 10) v.push(`해설이 너무 짧음: '${q.explanation}'`);

  // #7 오답 해설 — 개수·라벨 축·정답 누출·중복·본문.
  const wrongNeeded = optionCount - answerCount;
  if (requireWrong) {
    if (q.wrong.length !== wrongNeeded) {
      v.push(
        `오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요) — 읽힌 라벨 ${labelList(
          q.wrong.map((w) => w.label),
        )}`,
      );
    }
    const seenWrong = new Set<string>();
    for (const w of q.wrong) {
      if (seenWrong.has(w.label)) v.push(`오답해설 라벨 중복: ${w.label}`);
      seenWrong.add(w.label);
      if (!seenLabels.has(w.label)) v.push(`오답해설 라벨(${w.label})이 선지에 없음`);
      if (q.answers.includes(w.label)) v.push(`오답해설에 정답 라벨(${w.label}) 포함`);
      // 하한은 '문장으로 성립하는가' 기준이다. 5자 하한은 하드랩된 뒷줄이 유실된
      // 잘린 해설("도입부 소재 함정")을 그대로 통과시켰다 — 파서의 연속 줄 접기와
      // 짝을 이루는 병행 방어다(합니다체 한 문장은 예외 없이 이 하한을 넘는다).
      const text = (w.text ?? "").trim();
      if (!text) v.push(`${w.label} 오답 해설이 비었음`);
      else if (text.length < WRONG_TEXT_MIN) {
        v.push(
          `${w.label} 오답 해설이 문장으로 성립하지 않음(${text.length}자) — 받은 값: '${text}'`,
        );
      }
    }
    if (!answerAxisBroken) {
      for (const o of q.options) {
        if (q.answers.includes(o.label)) continue;
        if (!q.wrong.some((w) => w.label === o.label)) {
          v.push(`${o.label} 오답 해설 누락`);
        }
      }
    }
  }

  return v;
}
