// ============================================================================
// 어휘 적절성(VOCAB_CHOICE) 0원 결정형 게이트 — LLM 콜 없음(정규식·문자열 비교만).
// parser-vocab.ts 에서 분리했다(스펙의 "400줄에서 분할 검토" 조항 — combo·order 가
// 이미 gate-combo.ts / gate-order.ts 로 같은 분리를 했고, 세 유형 구조를 통일한다).
// 의존 방향은 이 파일 → parser-vocab 단방향이다(역참조 금지 — 순환 import).
//
// ⚠ 이 게이트가 md 레인의 **유일한** 차단 장치다. 라우트는 후처리 뒤
//   validateQuestionQuality 를 돌리지만 error 코드를 잡 result 에 기록만 하고
//   차단하지 않는다. 그래서 fast 검증기가 error 로 막는 항목(#10-b 원단어 누설,
//   #17 치환 이음매)은 여기로 승격 이식돼 있다.
//
// ⚠ 정찰 R2 — 어법 게이트에서 그대로 복사하면 100% 사고 나는 지점:
//   gateMdQuestion 의 `changed.length === answerCount` 는 SYNONYM_VARIANT 모드에서
//   비정답 자리도 동의어로 치환되므로 항상 어긋난다. 여기서는 **SOURCE_EXACT
//   에서만** 정답 축 동기 검사를 돌린다.
// ============================================================================

import { normalizeWs, countWordBoundaryMatches, reconstructionEq } from "./parser";
import { findVocabSubstitutionSeamIssues } from "@/lib/question-quality/validators/vocab/substitution-seam";
import { sourceWordVisibleOutsideMarkers } from "@/lib/question-quality/validators/vocab";
import { VOCAB_MD_AXIS_CODES, VOCAB_MD_LABELS } from "./prompts-vocab";
import {
  buildVocabRenderedPassage,
  collectVocabMarks,
  reconstructVocabPassage,
  type MdVocabQuestion,
} from "./parser-vocab";

const AXIS_CODE_SET = new Set<string>(VOCAB_MD_AXIS_CODES);

export interface VocabGateOptions {
  markerCount?: number;
  answerCount?: number;
  /** true 면 비정답도 동의어로 표시된다(계약 반전 — #7↔#8 분기점) */
  synonymVariants?: boolean;
  /** false 면 "정답 해설만" 모드(오답해설 개수 요구 없음) */
  requireWrong?: boolean;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdVocab(
  q: MdVocabQuestion,
  passage: string,
  options?: VocabGateOptions,
): string[] {
  const markerCount = options?.markerCount ?? q.marks.length;
  const answerCount = options?.answerCount ?? Math.max(1, q.answers.length);
  const variant = options?.synonymVariants === true;
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];
  const pn = normalizeWs(passage);

  // #0/#1 형상 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (!q.markedPassage.trim()) return ["밑줄지문 누락"];
  const rendered = collectVocabMarks(q.markedPassage);
  if (rendered.length !== markerCount) {
    return [`밑줄 마커 ${rendered.length}개 (${markerCount}개 필요)`];
  }
  if (q.marks.length !== markerCount) {
    return [`밑줄 ${q.marks.length}개 (${markerCount}개 필요)`];
  }

  // #11 라벨 순서 == 지문 등장순 (a)(b)(c)…
  const expected = VOCAB_MD_LABELS.slice(0, markerCount).map((k) => `(${k})`);
  const renderedKey = rendered.map((m) => m.label).join("");
  if (renderedKey !== expected.join("")) {
    v.push(
      `밑줄 라벨이 지문 등장순 ${expected.join("")} 이 아님 — 실제 ${renderedKey || "없음"}`,
    );
  }
  if (q.marks.map((m) => m.label).join("") !== expected.join("")) {
    v.push(`원형·판단축 라벨 순서 오류 — ${expected.join("")} 필요`);
  }

  // #2 지문 재구성 대조 — 마커 밖 무단 편집과 원형 오기를 한 번에 잡는 최강 게이트
  // (말미 종결부호만 관용 — reconstructionEq 주석의 26-08-11 RCA).
  const reconstructionOk = reconstructionEq(reconstructVocabPassage(q), passage);
  if (!reconstructionOk) {
    v.push("지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 원형이 지문 축자가 아님");
  }

  const answerSet = new Set(q.answers);
  const originalByLabel = new Map(q.marks.map((m) => [m.label, m.original]));
  // displayed — 그 자리의 **원문 단어가 실제로 학생 화면에 표시되는가**(shown == original).
  // #9 가 "선지 겹침" 을 주장하려면 이 값이 참이어야 한다(아래 주석 참조).
  const originalKeys = q.marks.map((m) => ({
    label: m.label,
    key: normalizeWs(m.original).toLowerCase(),
    displayed: normalizeWs(m.shown).toLowerCase() === normalizeWs(m.original).toLowerCase(),
  }));
  const renderedPassage = buildVocabRenderedPassage(q);
  const seenOriginal = new Set<string>();
  const seenShown = new Set<string>();
  const seenLabel = new Set<string>();

  for (const m of q.marks) {
    if (seenLabel.has(m.label)) v.push(`밑줄 라벨 중복: ${m.label}`);
    seenLabel.add(m.label);
    const isAnswer = answerSet.has(m.label);

    if (!m.original) {
      v.push(`${m.label} 원형 누락(원형·판단축 섹션 불일치)`);
      continue;
    }
    if (!m.shown) v.push(`${m.label} 표시어 누락`);
    // #3 판단축 코드 — 닫힌 집합 소속.
    if (!m.code) v.push(`${m.label} 판단축 코드 누락`);
    else if (!AXIS_CODE_SET.has(m.code)) {
      v.push(`${m.label} 판단축 코드 '${m.code}' 가 닫힌 집합(${VOCAB_MD_AXIS_CODES.join("·")}) 밖`);
    }

    // 단어 형태 — 구·절·괄호 뜻풀이가 섞이면 선지와 밑줄이 함께 무너진다.
    for (const [name, value] of [
      ["원형", m.original],
      ["표시어", m.shown],
    ] as const) {
      if (value && (value.trim().split(/\s+/).length > 3 || /[()[\]]/.test(value))) {
        v.push(`${m.label} ${name}가 단어 형태가 아님: '${value.slice(0, 40)}'`);
      }
    }

    // #10-a 위치 유일성 — 밑줄 자리 확정. 대조 축은 #2 재구성과 같은 정규화 축이다
    // (원시 문자열로 세면 곱슬따옴표·en대시 차이만으로 여기서만 오반려된다).
    const occurrences = countWordBoundaryMatches(pn, normalizeWs(m.original));
    if (occurrences === 0) {
      v.push(`${m.label} 원형이 지문에 축자로 없음(단어 경계 기준): '${m.original}'`);
    } else if (occurrences > 1) {
      v.push(`${m.label} 원형 '${m.original}' 이 지문에 ${occurrences}회 등장 — 밑줄 자리가 모호하고 정답이 누설된다`);
    } else if (isAnswer && sourceWordVisibleOutsideMarkers(renderedPassage, m.original)) {
      // #10-b 누설 축은 **대소문자 무시**다. 위 카운트는 대소문자를 구분해 문두 대문자
      // 잔존("Shade … casts shade")을 통과시키지만 fast 검증기는 이를 error 로 잡는다.
      // md-stream 은 검증기를 차단에 쓰지 않으므로(기록만) 여기서 직접 승격한다.
      v.push(`${m.label} 정답 원단어 '${m.original}' 이 밑줄 밖 지문에 대소문자만 달리 남아 있음 — 학생이 지문만 보고 정답을 역추론한다`);
    }

    const originalKey = normalizeWs(m.original).toLowerCase();
    if (originalKey && seenOriginal.has(originalKey)) v.push(`표적 단어 중복: '${m.original}'`);
    if (originalKey) seenOriginal.add(originalKey);

    // #16 표시어 축 중복 — 학생 표면의 선지는 표시어 그대로 실린다. 두 자리의 표시어가
    // 같으면 글자까지 같은 선지가 두 개 나가 정답이 유일하지 않다(fast 는
    // duplicate-option-text error, md 는 차단하지 않는다). 정답·모드 무관으로 본다.
    const shownKey = normalizeWs(m.shown).toLowerCase();
    if (shownKey && seenShown.has(shownKey)) {
      v.push(`표시어 중복: '${m.shown}' — 학생 표면에 글자까지 같은 선지가 두 개 실린다`);
    }
    if (shownKey) seenShown.add(shownKey);
    // #9 표시어가 **다른 자리의 원문 단어**와 같은 경우. 실제 결함은 두 갈래뿐이다:
    //  (a) 그 자리가 **정답**이면 → 정답 자리의 올바른 단어가 선지에 그대로 실린다(누출).
    //  (b) 그 자리의 원문이 **실제로 표시되고 있으면**(shown == original, 즉 SOURCE_EXACT
    //      비정답) → 같은 글자의 선지가 두 개 나간다.
    // 변형 모드의 "비정답 표시어 == 다른 **비정답**의 원문" 은 그 원문이 동의어로 가려져
    // 화면에 아예 없다 — 누출도 중복도 아닌 정상 조합이다. 좁히지 않으면 결함 없는
    // 문항을 반려하고, 게다가 "선지가 겹쳐" 라는 **사실과 다른 사유**를 1회뿐인 재생성
    // 프롬프트에 되먹인다(모델은 존재하지 않는 겹침을 고치라는 지시를 받는다).
    const clash = shownKey ? originalKeys.find((o) => o.label !== m.label && o.key === shownKey) : undefined;
    if (clash) {
      if (answerSet.has(clash.label)) {
        v.push(`${m.label} 표시어가 정답 자리(${clash.label})의 원문 단어와 동일 — 정답 노출`);
      } else if (clash.displayed) {
        v.push(`${m.label} 표시어가 다른 밑줄(${clash.label})의 원문 단어와 동일 — 그 자리도 같은 단어로 표시돼 선지가 겹치고 정답이 유일하지 않다`);
      }
    }

    const unchanged = normalizeWs(m.shown) === normalizeWs(m.original);
    if (isAnswer) {
      // #6 정답 자리는 반드시 원문과 다른 오용어로 표시돼야 한다.
      if (unchanged) v.push(`${m.label} 정답 자리인데 표시어가 원형과 동일 — 오용어로 교체되지 않음`);
      // #5 고침 == 원형(축자).
      const fix = q.fixes[m.label];
      if (!fix) v.push(`고침${m.label} 누락`);
      else if (normalizeWs(fix) !== normalizeWs(m.original)) {
        v.push(`고침${m.label} '${fix}' 이 원형 '${m.original}' 과 다름`);
      }
    } else if (variant) {
      // #8 변형 모드 — 비정답도 반드시 동의어로 변장돼 있어야 한다.
      if (unchanged) v.push(`${m.label} 동의어 변형 모드인데 표시어가 원문 그대로`);
    } else if (!unchanged) {
      // #7 SOURCE_EXACT — 비정답은 원문 그대로.
      v.push(`${m.label} 비정답 표시어가 원문과 다름 ('${m.shown}' vs '${m.original}') — 동의어 변형 모드가 아니면 원문 그대로여야 한다`);
    }
  }

  // #4 정답 축 — 개수·소속.
  if (q.answers.length !== answerCount) {
    v.push(`정답 라벨 ${q.answers.length}개 (설정 ${answerCount}개)`);
  }
  for (const label of q.answers) {
    if (!originalByLabel.has(label)) v.push(`정답 라벨(${label})이 밑줄에 없음`);
  }
  // 정답 축 동기 — "정답 라벨 집합" vs "실제로 변형된 자리 집합".
  // ⚠ SOURCE_EXACT 에서만 유효하다. 변형 모드는 전 자리가 변형이라 이 검사가
  //   구조적으로 성립하지 않는다(어법 게이트를 그대로 복사하면 여기서 죽는다).
  if (!variant) {
    const changedKey = q.marks
      .filter((m) => normalizeWs(m.shown) !== normalizeWs(m.original))
      .map((m) => m.label)
      .sort()
      .join(", ");
    const answerKey = [...q.answers].sort().join(", ");
    if (changedKey !== answerKey) {
      v.push(`정답 라벨(${answerKey || "없음"})과 오용 표시 자리(${changedKey || "없음"}) 불일치`);
    }
  }
  for (const label of Object.keys(q.fixes)) {
    if (!answerSet.has(label)) v.push(`${label} 은 정답이 아닌데 고침이 붙어 있음`);
  }

  // #12 · #13 · #14
  if (!q.explanation) v.push("해설 누락");
  // #13 은 "개수" 가 아니라 **비정답 라벨 전수 커버리지** 다. 개수만 보면 라벨 중복과
  // 다른 라벨 누락이 서로 상쇄돼 클린 통과하고, 어댑터의 wrongByLabel Map 이 중복을
  // 뒤엣것으로 덮어써 선지 하나가 해설 없이 저장된다(검증기는 warning 뿐이라 무신호).
  if (requireWrong) {
    const wrongNeeded = markerCount - answerCount;
    const wrongLabels = q.wrong.map((w) => w.label);
    const dup = [...new Set(wrongLabels.filter((l, i) => wrongLabels.indexOf(l) !== i))];
    if (dup.length > 0) {
      v.push(`오답해설 라벨 중복: ${dup.join(", ")} — 비정답 라벨당 정확히 한 줄`);
    }
    const wrongSet = new Set(wrongLabels);
    const missing = q.marks
      .map((m) => m.label)
      .filter((l) => !answerSet.has(l) && !wrongSet.has(l));
    if (missing.length > 0) {
      v.push(`오답해설 누락 라벨: ${missing.join(", ")} — 비정답 ${wrongNeeded}곳 전부에 한 줄씩 필요`);
    } else if (wrongSet.size !== wrongNeeded) {
      v.push(`오답해설 ${wrongSet.size}개 (${wrongNeeded}개 필요)`);
    }
  }
  if (q.wrong.some((w) => answerSet.has(w.label))) {
    v.push("오답해설에 정답 라벨 포함");
  }

  // #17 치환 이음매 무결성 — fast 검증기(findVocabSubstitutionSeamIssues)를 md 게이트로
  // 승격한다(md 레인은 validateQuestionQuality 를 차단에 쓰지 않는다). 재구성이 성립할
  // 때만 돌린다 — 지문이 이미 훼손된 상태에서 이음매를 보면 오탐만 는다.
  if (reconstructionOk) {
    for (const finding of findVocabSubstitutionSeamIssues(
      q.marks.map((m) => {
        const isAnswer = answerSet.has(m.label);
        return {
          label: m.label,
          originalWord: m.original,
          substituteWord: m.shown,
          word: m.shown,
          isInappropriate: isAnswer,
          ...(isAnswer ? { betterWord: m.original } : {}),
        };
      }),
      renderedPassage,
      passage,
      variant ? "SYNONYM_VARIANT" : "SOURCE_EXACT",
    )) {
      const label = String(finding.evidence.label ?? "");
      v.push(
        finding.code === "vocab-substitution-seam-particle"
          ? `(${label}) 구동사 머리만 치환해 particle 이 잔류 — 문법 파손만으로 정답이 드러난다`
          : `(${label}) 치환 자리 주변 문장부호가 원문과 다름 — 한 단어 교체를 벗어난 무단 변형`,
      );
    }
  }

  return v;
}
