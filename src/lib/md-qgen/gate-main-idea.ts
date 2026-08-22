// ============================================================================
// 요지·주장(MAIN_IDEA) 0원 결정형 게이트 — LLM 콜 없음(정규식·문자열 비교만).
// parser-main-idea.ts 에서 분리했다(스펙의 "400줄에서 분할 검토" 조항 — vocab·
// combo·order 가 이미 gate-*.ts 로 같은 분리를 했고, 네 유형 구조를 통일한다).
// 의존 방향은 이 파일 → parser-main-idea 단방향이다(역참조 금지 — 순환 import).
//
// ⚠ 이 게이트가 md 레인의 **유일한** 차단 장치다. 라우트는 후처리 뒤
//   validateQuestionQuality 를 돌리지만 error 코드를 잡 result 에 기록만 하고
//   차단하지 않는다. 그래서 fast 검증기가 경고로만 남기는 항목 중 이 유형의
//   정체성을 무너뜨리는 둘(main-idea-title-like-options = 명사구 선지,
//   topic-option-language = 선지 언어)은 여기서 error 로 승격돼 있다.
//
// ⚠ 이 유형은 지문을 변형하지 않는다 — 다른 유형의 최강 게이트인 "지문 재구성
//   일치"가 존재하지 않는다. 지문과 문항을 잇는 결정형 앵커는 `근거:` 줄
//   (정답 논지가 가장 압축된 지문 문장의 축자 복사) 하나뿐이고, #7 이 그 줄만
//   지문과 대조한다. 그래서 이 유형의 형식은 `근거:` 줄을 포기할 수 없다.
// ============================================================================

import { normalizeWs } from "./parser";
import {
  MAIN_IDEA_MD_LABELS,
  type MainIdeaOptionLanguage,
} from "./prompts-main-idea";
import type { MdMainIdeaQuestion } from "./parser-main-idea";

export interface MainIdeaGateOptions {
  /** 교사 설정 선지 수(4~8) — 미지정이면 파싱 결과를 그대로 인정 */
  optionCount?: number;
  /** 교사 설정 정답 수(1~선지수-1) */
  answerCount?: number;
  /** 선지 표시 언어 — 기본 ko(한국어 진술문) */
  optionLanguage?: MainIdeaOptionLanguage;
  /** false 면 "정답 해설만" 모드(오답해설 개수 요구 없음) */
  requireWrong?: boolean;
  /** 교사 지정 근거 문장(축자) — 있으면 `근거:` 줄이 그중 하나와 겹쳐야 한다 */
  teacherPoints?: string[];
}

const LABEL_LIST: readonly string[] = MAIN_IDEA_MD_LABELS;

const HANGUL_RE = /[가-힣]/;
// 요지 선지는 완전한 진술문이어야 한다 — 명사구는 제목·주제형 문항의 표면이다.
// 26-08-22 기출 실측: 종전 집합(fast 검증기 validators/topic.ts:97-108 과 동일)이
// 명령형·청유형 종결을 못 받아 주장 기출 155문항 중 53건(34.2%, 수능 2·평가원 9
// 포함 — 어미 '하라'×152 '마라'×13 '어라'×11 '하자'×10 '해라'×8 '여라'×8 '말라'×6)·
// 요지 기출 186문항 중 3건(1.6%)을 "명사구 5/5" 다수결 오반려로 차단했다. 열거
// 확장(하라|마라|아라|어라|여라|하자|말자)은 축약·불규칙 활용('말라'·'늘려라'·
// '시켜라'·'세워라'·'해라'…)이 새어 주장 3건이 잔존(실측) → 한글 1자 앵커
// [가-힣]라|[가-힣]자 로 명령('-라')·청유('-자') 종결 전체를 받는다(두 코퍼스
// 발화 0건 실측). '…라/…자' 꼬리 명사(나라·학자 등)가 진술문으로 판정되는 대가는
// 다수결(>=max(3, n-1))이 흡수한다 — 명사구 5선지 합성 음성테스트는 계속 발화.
// ⚠ fast 검증기와 어미 집합이 갈라졌다 — 동기화 여부는 별도 결정(감사 지시).
const KO_STATEMENT_TAIL =
  /(다|음|함|됨|해야|필요|중요|가능|있다|없다|된다|준다|[가-힣]라|[가-힣]자)[.!?。]?$/;
const LEADING_LABEL_RESIDUE = /^(?:[①②③④⑤⑥⑦⑧]|[([]?[1-8][)\].])\s/;

/**
 * 스냅이 걷어내지 못한 정답 표시 잔재. 실측(프로브)에서 `① (정답) …`·`① … ← 정답`·
 * `① ✅ …` 가 스냅·게이트·검증기를 전부 통과해 **정답이 표시된 채 출하**됐다(critical).
 * 스냅은 아는 형태만 지우므로, 형상 검사로 한 번 더 막는다 — `정답:` 줄 외의 두 번째
 * 정답 채널이 학생 표면에 생기는 것이 철칙 1 이 금지하는 바로 그것이다.
 *
 * 보수 가드(오반려 방지): '정답'·'answer'·'correct' 를 맨몸으로 잡지 않고 **표시 자리**
 * 에서만 잡는다 — 이모지 / 괄호 안 / 화살표 뒤 / 줄 앞머리 라벨(뒤에 구분자) / 줄 꼬리.
 * 교육·평가 소재 지문이면 "학생은 정답을 맞히는 능력보다 …" 같은 선지가 정상이고,
 * 영어 선지에서 'correct'·'answer' 는 본문 어휘로 흔하다. 조사가 붙은 '정답을'·문장
 * 중간의 'the answer' 는 통과하고, 라벨처럼 놓인 '정답 …'·'… 정답' 만 반려한다.
 */
const ANSWER_MARK_RESIDUE = new RegExp(
  [
    "[✅✔✓☑🟢🔴👉👈]",
    "|[([【][^)\\]】]*(?:정답|answer|correct)[^)\\]】]*[)\\]】]",
    "|(?:←|⇐|⬅|<-|<=|→|⇒|➡|->|=>)\\s*(?:정답|answer|correct)",
    "|^\\s*정답(?=[\\s:：·—–-])",
    "|정답\\s*$",
  ].join(""),
  "i",
);

/**
 * 잘린 선지의 꼬리 — 두 줄로 접힌 선지의 둘째 줄이 유실되면 쉼표·연결어미에서
 * 끊긴 미완성 진술이 그대로 학생 표면에 나간다(실측: `…것일 뿐이며,`). 파서가
 * 이어 붙이지 못한 경우까지 라벨별로 지목한다. 명사구 판정(#3 아래)은 다수결이라
 * 한 개만 잘린 경우를 묻어버리므로, 이 검사는 라벨 단위 error 여야 한다.
 */
const TRUNCATED_TAIL =
  /(?:[,，、;]|며|으며|하며|되며|지만|이며|이고|하고|면서|는데|은데|아서|어서|라서|거나)$/;

/**
 * 중복·포함 판정용 접기 — 공백과 구두점을 지운다. 종결부호 하나 차이로
 * "...넓혀 준다." 와 "...넓혀 준다는 점이 중요하다." 가 서로 다른 진술로 통과하던
 * 구멍을 막는다(같은 주장을 두 번 쓴 선지 = 복수정답 시비).
 */
const foldKey = (s: string): string =>
  normalizeWs(s)
    .toLowerCase()
    .replace(/[\s.,!?;:·…"'`()[\]{}]/g, "");
const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdMainIdea(
  q: MdMainIdeaQuestion,
  passage: string,
  options?: MainIdeaGateOptions,
): string[] {
  const optionCount = options?.optionCount ?? q.options.length;
  const answerCount = options?.answerCount ?? 1;
  const optionLanguage: MainIdeaOptionLanguage = options?.optionLanguage === "en" ? "en" : "ko";
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];

  // #0 섹션 앵커 — 둘 다 못 찾으면 선지 구간을 자를 수 없어 오답해설까지 선지로
  // 흡수된다. 그 상태에서 개수 오류를 뱉으면 "선지를 5개 쓴 모델"에게 "선지가 9개다"
  // 라는 거짓 피드백이 재생성 프롬프트로 실려 진짜 원인(장식 헤더)을 못 고친다.
  // 개수보다 먼저 원인을 지목한다 — 철칙 3(은폐 금지)·철칙 5(자리 지목).
  if (!q.anchors.answer && !q.anchors.wrong) {
    return [
      "`정답:`·`오답:` 줄을 찾지 못함 — 출력 형식 그대로(굵게·헤딩 없이) `정답: ①` 과 `오답:` 줄을 쓰라",
    ];
  }

  // #1 선지 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (q.options.length !== optionCount) {
    return [`선지 ${q.options.length}개 (${optionCount}개 필요)`];
  }

  // #2 라벨 축 — 원문자 오름차순.
  const expected = LABEL_LIST.slice(0, optionCount);
  const actual = q.options.map((o) => o.label);
  if (actual.join("") !== expected.join("")) {
    v.push(`선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${actual.join("") || "없음"}`);
  }

  // #3 선지 본문 — 형상·언어·진술문 여부.
  const nounPhraseLike: string[] = [];
  for (const option of q.options) {
    if (!option.text) {
      v.push(`${option.label} 선지 본문 누락`);
      continue;
    }
    if (LEADING_LABEL_RESIDUE.test(option.text)) {
      v.push(`${option.label} 선지 본문에 번호가 중복으로 남음: '${option.text.slice(0, 30)}'`);
    }
    if (ANSWER_MARK_RESIDUE.test(option.text)) {
      v.push(
        `${option.label} 선지 본문에 정답 표시가 남음: '${option.text.slice(0, 40)}' — 선지 줄에는 선지 문장만 쓰라(정답은 \`정답:\` 줄에서만)`,
      );
    }
    if (TRUNCATED_TAIL.test(normalizeWs(option.text))) {
      v.push(
        `${option.label} 선지가 문장으로 끝나지 않음(잘림 의심): '...${normalizeWs(option.text).slice(-24)}' — 선지는 개행 없이 한 줄, 완결된 진술문으로 쓰라`,
      );
    }
    const hasHangul = HANGUL_RE.test(option.text);
    if (optionLanguage === "ko" && !hasHangul) {
      v.push(`${option.label} 선지가 한국어 진술문이 아님: '${option.text.slice(0, 40)}'`);
    }
    if (optionLanguage === "en" && hasHangul) {
      v.push(`${option.label} 선지에 한국어가 섞임(영어 설정): '${option.text.slice(0, 40)}'`);
    }
    if (optionLanguage === "ko" && hasHangul && !KO_STATEMENT_TAIL.test(normalizeWs(option.text))) {
      nounPhraseLike.push(option.label);
    }
  }
  // 명사구 선지는 제목·주제형 문항의 표면이다. 한둘은 문체 편차로 볼 수 있으므로
  // fast 검증기와 같은 다수 기준에서만 반려한다(오반려 방지).
  if (nounPhraseLike.length >= Math.max(3, optionCount - 1)) {
    v.push(
      `선지가 완전한 진술문이 아니라 제목·주제형 명사구다 — 해당 ${nounPhraseLike.join("")}`,
    );
  }

  // #4 선지 중복·포함관계 — 복수정답 시비의 결정형 차단.
  for (let i = 0; i < q.options.length; i += 1) {
    for (let j = i + 1; j < q.options.length; j += 1) {
      const a = foldKey(q.options[i].text);
      const b = foldKey(q.options[j].text);
      if (!a || !b) continue;
      if (a === b) {
        v.push(`선지 중복: ${q.options[i].label}${q.options[j].label} 가 같은 진술`);
      } else if (
        Math.min(a.length, b.length) >= 12 &&
        (a.includes(b) || b.includes(a))
      ) {
        v.push(
          `선지 포함관계: ${q.options[i].label}${q.options[j].label} 가 서로를 통째로 담고 있음 — 배타적 진술이어야 함`,
        );
      }
    }
  }

  // #5 길이 균형 — 유독 긴 선지 하나가 정답을 흘리는 시험 요령 차단(정본 마감 규칙).
  // 26-08-22 기출 실측: diff 관측최대 요지 24자(p50=5·p99=23, n=187)·주장 40자
  // (n=158 — ebsi_go1_20111115-q23 이 diff=40·×3.50 으로 종전 임계 30+ratio>=2
  // 복합 조건에 실제 오반려). 임계를 30→40 으로 물려 관측최대(40)가 경계 밖
  // (diff>40)이 되게 한다 — 두 코퍼스 발화 0건(감사 zeroFpProposals #5.
  // ratio>=2 축은 요지 관측최대 2.20이라 그대로 둔다).
  const lengths = q.options.map((o) => ({ label: o.label, len: normalizeWs(o.text).length }));
  const longest = lengths.reduce((a, b) => (b.len > a.len ? b : a), lengths[0]);
  const shortest = lengths.reduce((a, b) => (b.len < a.len ? b : a), lengths[0]);
  if (shortest.len > 0 && longest.len - shortest.len > 40 && longest.len >= shortest.len * 2) {
    v.push(
      `선지 길이 불균형 — 최장 ${longest.label}(${longest.len}자) 대 최단 ${shortest.label}(${shortest.len}자)`,
    );
  }

  // #6 정답 — `정답:` 줄이 유일 진실원(어법·반의어 정본과 동일 구조).
  const labelSet = new Set(actual);
  if (q.answers.length === 0) {
    v.push("정답 누락");
  } else {
    if (q.answers.length !== answerCount) {
      v.push(`정답 ${q.answers.length}개 (${answerCount}개 필요) — 실제 ${q.answers.join("")}`);
    }
    for (const answer of q.answers) {
      if (!labelSet.has(answer)) v.push(`정답 라벨(${answer})이 선지에 없음`);
    }
  }

  // #7 근거 — 이 유형에서 문항과 지문을 잇는 유일한 축자 앵커.
  const evidenceNorm = normalizeWs(q.evidence);
  if (!evidenceNorm) {
    v.push("근거 문장 누락 — 정답 논지가 압축된 지문 문장 한 줄이 필요함");
  } else if (!normalizeWs(passage).includes(evidenceNorm)) {
    v.push(`근거 문장이 지문에 축자로 없음: '${q.evidence.slice(0, 60)}'`);
  } else if (countWords(q.evidence) < 5) {
    v.push(`근거 문장이 너무 짧음(${countWords(q.evidence)}단어) — 논지 문장 하나를 그대로 옮겨야 함`);
  } else if (countWords(q.evidence) > 60) {
    v.push(`근거가 ${countWords(q.evidence)}단어 — 지문 문장 하나만 옮겨야 함`);
  }

  // #8 정답 선지가 근거 문장의 축자 복사면 요지 판단이 아니라 옮겨 적기가 된다.
  if (evidenceNorm) {
    for (const answer of q.answers) {
      const option = q.options.find((o) => o.label === answer);
      if (!option) continue;
      const a = foldKey(option.text);
      const e = foldKey(q.evidence);
      if (a.length >= 20 && (e.includes(a) || a.includes(e))) {
        v.push(`정답 ${answer} 선지가 근거 문장의 축자 복사 — 재진술이어야 함`);
      }
    }
  }

  // #9 해설·오답해설.
  if (!q.explanation) {
    v.push("해설 누락");
  } else if (!HANGUL_RE.test(q.explanation)) {
    v.push("해설이 한국어가 아님");
  } else if (normalizeWs(q.explanation).length < 20) {
    v.push(`해설이 너무 짧음(${normalizeWs(q.explanation).length}자)`);
  }

  const wrongNeeded = optionCount - answerCount;
  if (requireWrong) {
    if (q.wrong.length !== wrongNeeded) {
      v.push(`오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요)`);
    }
    const seen = new Set<string>();
    for (const w of q.wrong) {
      if (!labelSet.has(w.label)) v.push(`오답해설 라벨(${w.label})이 선지에 없음`);
      if (seen.has(w.label)) v.push(`오답해설 라벨 중복(${w.label}) — 해설이 덮어써진다`);
      seen.add(w.label);
      if (normalizeWs(w.text).length < 6) v.push(`${w.label} 오답해설이 비어 있거나 너무 짧음`);
    }
    for (const label of expected) {
      if (q.answers.includes(label)) continue;
      if (!seen.has(label)) v.push(`${label} 오답해설 누락`);
    }
  }
  // 파서가 정답 줄을 걸러내므로 여기 남는 경우는 라벨 표기가 어긋난 때다 — 지목한다.
  if (q.wrong.some((w) => q.answers.includes(w.label))) {
    v.push("오답해설에 정답 라벨 포함");
  }

  // #10 교사 지정 근거 문장 — 지정이 있으면 `근거:` 줄이 그중 하나와 겹쳐야 한다.
  // (선지·해설에 논지가 반영됐는지는 의미 판단이라 결정형 검사 불가 — 그 부분은
  //  fast 와 동일하게 프롬프트 전담이고, 여기서는 '어느 문장을 근거로 삼았나'라는
  //  결정형 사실만 본다. 레인이 같은 요구를 프롬프트 블록으로 먼저 못박는다.)
  const teacherPointsRaw = (options?.teacherPoints ?? []).filter(Boolean);
  const teacherPoints = teacherPointsRaw.map((p) => foldKey(p)).filter(Boolean);
  if (teacherPoints.length > 0 && evidenceNorm) {
    const e = foldKey(q.evidence);
    if (!teacherPoints.some((p) => e.includes(p) || p.includes(e))) {
      // 누락 포인트 원문을 명시한다(26-08-22 과녁 검증 — hard 유형들은 전부 원문을
      // 인용하는데 이 메시지만 고정 문구라 재생성 피드백 정보가 비어 있었다).
      const cited = teacherPointsRaw
        .map((p) => `'${p.slice(0, 60)}'`)
        .join(" · ");
      v.push(
        `교사 지정 근거 문장이 \`근거:\` 줄에 반영되지 않음 — 지정 문장 ${cited} 중 하나를 근거로 삼아라`,
      );
    }
  }

  return v;
}
