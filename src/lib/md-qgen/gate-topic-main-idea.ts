// ============================================================================
// 주제/요지(TOPIC_MAIN_IDEA) 0원 결정형 게이트 — 빈 배열이면 클린.
// 견본: parser-antonym.ts gateMdAntonym · 분리 선례: gate-order.ts(500줄 규약)
//
// 이 유형은 지문을 변형하지 않아 "지문 재구성 대조"가 없다. 그래서 게이트가 지킬
// 것은 두 축이다 —
//   (1) 형상: 선지 개수·라벨 축·중복·정답 소속·오답해설 대응 (감독 지시 초점)
//   (2) 정박: 근거문장이 지문에 축자로 존재 (이 유형의 유일한 지문 접점)
// 취향·난이도 판단(선지 길이 균질, 미끼 매력도)은 게이트가 아니라 프롬프트 몫이다
// — 결정형으로 판정할 수 없는 것을 반려 사유로 만들면 정상 문항이 죽는다
// (dispatcher 의 SHIP-FIRST 강등 철학과 같은 선).
//
// ⚠ 게이트 메시지는 반드시 자리를 지목한다(§1-B 철칙 5) — 이 문구가 그대로
//   재생성 프롬프트의 피드백으로 실린다.
// ============================================================================

import { containsHangul, containsLatinLetter } from "@/lib/question-quality/core";
import { normalizeWs } from "./parser";
import {
  TOPIC_MAIN_IDEA_MD_LABELS,
  type MdGistMode,
} from "./prompts-topic-main-idea";
import {
  foldForGistMatch,
  verifyGistEvidenceSentence,
  type MdTopicMainIdeaQuestion,
} from "./parser-topic-main-idea";

export interface GateGistOptions {
  optionCount: number;
  answerCount: number;
  gistMode: MdGistMode;
  /** answer-only 모드에서는 오답해설 개수 검사를 끈다. */
  requireWrong?: boolean;
}

// 해설이 선지를 평숫자로 지칭하면 저장 단계의 보기 셔플이 통째로 포기된다
// (question-diversity.ts:585-591 UNMAPPABLE_MENTION — 라벨 재매핑이 불가능해
// 정답 키와 해설이 어긋나는 것을 막으려 셔플을 건너뛴다). 그 결과 정답 위치가
// 모델 취향대로 고정돼 다양성이 죽으므로, md 는 아예 생성 단계에서 막는다.
// 원문자 단독 언급(①)은 셔플이 재매핑하므로 허용이다 — 여기 패턴에 없다.
const UNMAPPABLE_OPTION_MENTION =
  /(?:[1-9]\s*번(?!째))|(?:선지\s*[1-9])|(?:보기\s*[1-9])|(?:\(\s*[1-9]\s*\))|(?:[①-⑳]\s*[~∼〜‐–—-]\s*[①-⑳])/;

// 선지 안에 남은 정답 표시(스냅이 걷어내지 못한 변형) — 학생 표면 누출.
const ANSWER_MARK_ANY = /[(（[]\s*(?:정답|답|정답임)\s*[)）\]]/;

export function gateMdTopicMainIdea(
  q: MdTopicMainIdeaQuestion,
  passage: string,
  options: GateGistOptions,
): string[] {
  const requireWrong = options.requireWrong !== false;
  const optionCount = options.optionCount;
  const answerCount = options.answerCount;
  const v: string[] = [];

  // #1 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (q.options.length !== optionCount) {
    return [`선지 ${q.options.length}개 (${optionCount}개 필요)`];
  }

  // #2 라벨 축 — 원문자 ①~ 순서대로, 중복·누락 없음.
  const expected = TOPIC_MAIN_IDEA_MD_LABELS.slice(0, optionCount);
  const actual = q.options.map((o) => o.label);
  if (actual.join("") !== expected.join("")) {
    v.push(
      `선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${actual.join("") || "없음"}`,
    );
  }

  // #3 선지 텍스트 — 공백·중복 금지(중복은 복수정답 시비의 결정형 증거다).
  const seen = new Map<string, string>();
  for (const option of q.options) {
    const text = normalizeWs(option.text);
    if (!text) {
      v.push(`${option.label} 선지 텍스트 누락`);
      continue;
    }
    const key = text.toLowerCase();
    const first = seen.get(key);
    if (first) v.push(`${first}·${option.label} 선지 텍스트 중복`);
    else seen.set(key, option.label);

    // #4 정답 표시 누출 — 스냅이 못 걷어낸 변형만 여기 도달한다.
    if (ANSWER_MARK_ANY.test(text)) {
      v.push(`${option.label} 선지에 정답 표시가 남아 있음: '${text.slice(0, 40)}'`);
    }

    // #5 선지 언어 정합 — 보기 언어 설정이 곧 선지 형식이다(주제=영어 명사구 /
    //    요지=한국어 진술문). 검증기는 경고로만 남기므로 md 게이트로 승격한다.
    if (options.gistMode === "TOPIC") {
      if (containsHangul(text) || !containsLatinLetter(text)) {
        v.push(`${option.label} 선지가 영어 주제 표현이 아님: '${text.slice(0, 40)}'`);
      }
    } else if (!containsHangul(text)) {
      v.push(`${option.label} 선지가 한국어 진술문이 아님: '${text.slice(0, 40)}'`);
    }
  }

  // #6 지문 축자 복사 금지(영어 선지 한정) — 선지는 재진술이어야 한다.
  //    한국어 선지는 fold(영문·숫자만)가 비어 대조 자체가 성립하지 않아 건너뛴다.
  if (options.gistMode === "TOPIC") {
    const foldedPassage = foldForGistMatch(passage);
    for (const option of q.options) {
      const folded = foldForGistMatch(option.text);
      if (folded.split(" ").filter(Boolean).length < 4) continue;
      if (foldedPassage.includes(folded)) {
        v.push(`${option.label} 선지가 지문 축자 복사임 — 재진술이 아님`);
      }
    }
  }

  // #7 정답 — `정답:` 줄이 유일 진실원(선지 줄에 정답 표시를 받지 않는다).
  const labelSet = new Set(actual);
  if (q.answers.length === 0) {
    // 머리표를 못 읽은 것과 값이 없는 것을 구분해 자리를 지목한다(§1-B 철칙 5) —
    // 뭉뚱그린 "정답 누락" 은 형식이 멀쩡한 출력을 모델에게 "안 썼다"로 되돌려 준다.
    const raw = (q.answerRaw ?? "").trim();
    v.push(
      raw
        ? `정답 누락 — '정답:' 줄에서 선지 번호를 읽을 수 없음(받은 값: '${raw.slice(0, 40)}'). '정답: ${TOPIC_MAIN_IDEA_MD_LABELS[1]}' 형식으로 적어라`
        : "정답 누락",
    );
  } else if (q.answers.length !== answerCount) {
    v.push(`정답 ${q.answers.length}개 (${answerCount}개 필요: ${q.answers.join(", ") || "없음"})`);
  }
  for (const answer of q.answers) {
    if (!labelSet.has(answer)) v.push(`정답 라벨(${answer})이 선지에 없음`);
  }

  // #8 해설
  if (!q.explanation) v.push("해설 누락");

  // #9 근거문장 — 이 유형의 유일한 지문 정박점.
  //    substring 존재만 보면 지문의 임의 조각 12자로 충족돼 정박이 공회전한다
  //    (형식 리터럴 이탈의 유일한 근거가 그 정박이므로, 문장성까지 요구한다).
  if (!q.evidence) {
    v.push("근거문장 누락 — 정답 판단의 축이 된 지문 문장을 축자로 적어라");
  } else {
    const verdict = verifyGistEvidenceSentence(passage, q.evidence);
    if (verdict === "not-found") {
      v.push(
        `근거문장이 지문에 축자로 없음(재진술·두 문장 결합 금지): '${q.evidence.slice(0, 60)}'`,
      );
    } else if (verdict !== "ok") {
      v.push(
        `근거문장이 지문의 완결된 한 문장이 아님(문장 처음부터 종결 구두점까지 그대로 옮겨라): '${q.evidence.slice(0, 60)}'`,
      );
    }
  }

  // #10 오답해설 — 개수와 라벨 집합이 비정답 선지와 정확히 대응해야 한다.
  const answerSet = new Set(q.answers);
  const wrongNeeded = optionCount - answerCount;
  if (requireWrong) {
    // 머리표 자체를 못 찾은 경우 — "0개 (4개 필요)" + 라벨별 누락 4건을 쏟아내면
    // 모델은 "내가 안 썼구나"로 읽고 같은 머리표로 다시 써서 2콜을 태운다.
    // 원인을 지목하는 한 줄로 대체한다(§1-B 철칙 5).
    if (q.wrongSectionFound === false && q.wrong.length === 0 && wrongNeeded > 0) {
      v.push(
        `오답 블록 머리표를 인식할 수 없음 — '오답:' 으로 시작하는 줄 아래에 오답해설 ${wrongNeeded}개를 적어라(굵게·해시 장식은 무방하다)`,
      );
    } else {
      if (q.wrong.length !== wrongNeeded) {
        v.push(`오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요)`);
      }
      const wrongSeen = new Set<string>();
      for (const w of q.wrong) {
        if (wrongSeen.has(w.label)) v.push(`오답해설 라벨 중복(${w.label})`);
        wrongSeen.add(w.label);
        if (!labelSet.has(w.label)) v.push(`오답해설 라벨(${w.label})이 선지에 없음`);
      }
      for (const label of actual) {
        if (!answerSet.has(label) && !wrongSeen.has(label)) {
          v.push(`${label} 오답해설 누락`);
        }
      }
    }
  }
  if (q.wrong.some((w) => answerSet.has(w.label))) {
    v.push("오답해설에 정답 라벨 포함");
  }

  // #11 번호 지칭 금지 — 저장 단계 셔플을 무력화한다(상단 주석 참조).
  const mentions: Array<{ where: string; text: string }> = [
    { where: "해설", text: q.explanation },
    ...q.wrong.map((w) => ({ where: `${w.label} 오답해설`, text: w.text })),
  ];
  for (const m of mentions) {
    if (m.text && UNMAPPABLE_OPTION_MENTION.test(m.text)) {
      v.push(`${m.where}이 선지를 번호로 지칭함 — 선지 내용으로 지칭하라`);
    }
  }

  return v;
}
