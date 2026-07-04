// ============================================================================
// KO 공통 품질 게이트 — 전 유형 선실행 (KO-DESIGN-SPEC §7)
// ============================================================================
// 유형 특화 validate() 전에 dispatch 가 실행하는 결정론 게이트.
// 영어 core.ts 헬퍼는 import 하지 않는다 — ko-text 만 사용 (대원칙 3).
// ============================================================================

import {
  charCountKo,
  containsSpanKo,
  extractQuotedSpansKo,
  isNegativeStemKo,
  optionEndingIssueKo,
  stemGrammarIssueKo,
} from "../core/ko-text";
import { isValidMarkerLabel, resolveKoMarkers, type KoMarker } from "../core/markers";
import {
  readKoStimulusBlocks,
  resolveKoStimulusMarkers,
  type KoMarkerWithSurface,
  type KoRenderStimulusBlock,
} from "../core/render-model";
import type { KoQualityIssue, KoTypeMeta, KoValidationContext } from "../registry/type-module";

type Q = Record<string, unknown>;

/**
 * 옛한글 조합 글리프 검출 — 첫가끝 조합 자모(U+1100~11FF·확장 A/B)·아래아(ㆍ).
 * 현대어 NFC 텍스트에는 등장하지 않는다(현대 조합은 완성형 음절로 정규화됨).
 * v1 렌더 폰트(맑은 고딕 계열)가 보장하지 못하므로 warning 으로 표면화한다.
 */
const KO_ARCHAIC_GLYPH_RE = /[ᄀ-ᇿꥠ-ꥼힰ-ퟻㆍ]/;

/**
 * 마커 글리프 리터럴 — ㉠~㉭(한글 원문자)·ⓐ~ⓙ(라틴 원문자, markers.ts 라벨 집합).
 * 원문(지문·자료)에 이 글리프가 박힌 채 markers 가 같은 표면을 다시 가리키면
 * 렌더(buildKoMarkedPassage)가 동일 위치에 원문자를 또 삽입해 이중 마커가 된다
 * (KO_WR_REVISE 판정단 critical 실증). 마킹은 markers 배열로만 표현해야 한다.
 */
const KO_MARKER_GLYPH_RE = /[㉠-㉭ⓐ-ⓙ]/;

/**
 * 이질 표기 — 그리스 문자·수학 기호 (KO_GR_PHONO 'Δ=-1' 판정단 실증).
 * 국어 해설·선지 문체에 등장할 수 없는 집합만 좁게 잡는다. 화살표(→/⇒)는
 * 음운 변동 표기 관행("ㄷ→ㄸ"), ±%×÷ 등 일상 기호는 지문 인용 가능성이 있어
 * 제외(과탐 방지). 지문·보기·자료에 실재하는 글자는 인용으로 보고 면제한다.
 */
const KO_FOREIGN_SYMBOL_RE = /[Α-Ωα-ω∆∑∏√∫≠≤≥≒]/g;

/** 고립 라틴 연쇄(2자 이상) — 병기 괄호·[A]~[E] 라벨 제거 후 검출한다. */
const KO_LATIN_TERM_RE = /[A-Za-z]{2,}/g;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readOptions(q: Q): { label: string; text: string }[] {
  if (!Array.isArray(q.options)) return [];
  return q.options
    .filter((o): o is Q => !!o && typeof o === "object")
    .map((o) => ({ label: str(o.label), text: str(o.text) }));
}

function readMarkers(q: Q): KoMarkerWithSurface[] {
  if (!Array.isArray(q.markers)) return [];
  return q.markers
    .filter((m): m is Q => !!m && typeof m === "object")
    .map((m) => ({
      family: str(m.family) as KoMarker["family"],
      label: str(m.label),
      spanText: str(m.spanText),
      occurrenceIndex: typeof m.occurrenceIndex === "number" ? m.occurrenceIndex : undefined,
      surroundingText: str(m.surroundingText) || undefined,
      targetSurface: m.targetSurface === "stimulus" ? ("stimulus" as const) : undefined,
    }));
}

/**
 * 자료 블록 전체를 검증용 평문 하나로 접는다 (title 행 + 본문 행).
 * ⚠ 마커 해소 검증에는 쓰지 않는다 — 마커의 검증 표면은 렌더 병합 표면과 1:1 이어야
 * 하므로 checkKoStimulusMarkers(블록별 lines 전용, title 제외)가 담당한다(KO-TYPES-1).
 * 정답누출·evidence·인용 verbatim 판정은 title 도 학생 노출면이므로 여기(합본)가 정당.
 */
export function koStimulusPlainText(blocks: KoRenderStimulusBlock[]): string {
  return blocks
    .map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n"))
    .join("\n");
}

export function validateKoCommon(
  question: Q,
  meta: KoTypeMeta,
  ctx: KoValidationContext,
): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = str(question.direction);
  const correctAnswer = str(question.correctAnswer);
  const options = readOptions(question);
  const stimulusBlocks = readKoStimulusBlocks(question.koStimulus);
  const stimulusText = koStimulusPlainText(stimulusBlocks);
  const bogiLines = readBogiLines(question);
  const bogiText = bogiLines.join("\n");
  // [KO-W1-1] 근거·인용의 검증 표면은 "학생에게 실제로 보이는 면"이어야 한다.
  // includesPassage=false 유형(화법·작문·매체·자기완결 문법)은 지문이 인쇄되지
  // 않으므로, 참고용 지문에서 복사된 근거는 학생이 찾을 수 없는 근거환각이다
  // (KO_WR_METHOD 판정단 critical 실증 — 지문 union 허용이 근본 원인).
  const passageIsStudentSurface = meta.includesPassage !== false;
  const spanInStudentSurfaces = (span: string): boolean =>
    (passageIsStudentSurface && containsSpanKo(ctx.passage, span)) ||
    (!!bogiText && containsSpanKo(bogiText, span)) ||
    (!!stimulusText && containsSpanKo(stimulusText, span));
  /** 지문에는 있으나 학생 노출면에는 없는 스팬인가 — 표면 안내 메시지 분기용. */
  const spanOnlyInHiddenPassage = (span: string): boolean =>
    !passageIsStudentSurface && containsSpanKo(ctx.passage, span);
  const spanInAnySurface = (span: string): boolean =>
    spanInStudentSurfaces(span) || spanOnlyInHiddenPassage(span);

  // ── 발문 문법 ──────────────────────────────────────────────────────────
  const stemIssue = stemGrammarIssueKo(direction);
  if (stemIssue) add("error", "ko-direction-grammar", `발문 문법 위반: ${stemIssue} — "${direction}"`);

  // ── 선지 (객관식) ─────────────────────────────────────────────────────
  if (meta.answerFormat === "MC5") {
    if (options.length !== 5) {
      add("error", "ko-option-count", `선지가 ${options.length}개 — 5지선다(①~⑤)여야 합니다`);
    }
    const labels = options.map((o) => o.label);
    const expected = ["①", "②", "③", "④", "⑤"];
    if (options.length === 5 && labels.join("") !== expected.join("")) {
      add("error", "ko-option-count", `선지 라벨이 ①~⑤ 순서가 아닙니다: ${labels.join(" ")}`);
    }
    if (!expected.includes(correctAnswer)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `객관식 correctAnswer 는 ①~⑤ 라벨이어야 합니다: "${correctAnswer}"`,
      );
    }
    // 어미 호응
    for (const o of options) {
      const endingIssue = optionEndingIssueKo(o.text, meta.optionEnding);
      if (endingIssue) {
        add("warning", "ko-option-ending", `${o.label} ${endingIssue}: "${o.text.slice(0, 40)}"`);
        break; // 같은 지적 반복 방지 — 첫 위반만
      }
    }
    // 근거앵커: 선지당 ≥1
    const evidence = Array.isArray(question.evidence) ? (question.evidence as Q[]) : [];
    const coveredLabels = new Set(
      evidence.map((e) => str(e.optionLabel)).filter((label) => expected.includes(label)),
    );
    if (evidence.length === 0) {
      add("error", "ko-evidence-missing", "evidence(근거앵커)가 비어 있습니다");
    } else {
      const missing = expected.filter((label) => !coveredLabels.has(label));
      if (options.length === 5 && missing.length > 0) {
        add(
          "error",
          "ko-evidence-missing",
          `근거앵커 누락 선지: ${missing.join(" ")} — 모든 선지에 근거 스팬이 필요합니다`,
        );
      }
    }
    // 근거 스팬 verbatim — 학생 노출면(includesPassage=true: 지문·보기·자료 /
    // false: 보기·자료)에 실재해야 함 (KO-W1-1)
    for (const e of evidence) {
      const span = str(e.spanText);
      if (!span) continue;
      if (!spanInStudentSurfaces(span)) {
        add(
          "error",
          "ko-evidence-not-in-passage",
          spanOnlyInHiddenPassage(span)
            ? `근거 스팬이 학생에게 보이지 않는 참고용 지문에서 복사되었습니다 — 이 유형(지문 미동봉)의 근거 표면은 <보기>·자체자료뿐입니다: "${span.slice(0, 40)}"`
            : `근거 스팬이 ${passageIsStudentSurface ? "지문/보기/자료" : "보기/자료"}에 없습니다(verbatim 위반): "${span.slice(0, 40)}"`,
        );
      }
    }
    // 선지 내 작은따옴표 인용 verbatim (문학 인용 게이트 — 전 유형 공통 적용)
    for (const o of options) {
      for (const quoted of extractQuotedSpansKo(o.text)) {
        // 4자 미만 인용(강조 표기 '한' 등)은 인용이 아니라 지시로 간주
        if (quoted.length < 4) continue;
        if (!spanInStudentSurfaces(quoted)) {
          add(
            "error",
            "ko-quote-not-verbatim",
            spanOnlyInHiddenPassage(quoted)
              ? `${o.label} 선지의 인용 '${quoted.slice(0, 30)}'이 참고용 지문에만 있고 학생 노출면(보기/자료)에는 없습니다`
              : `${o.label} 선지의 인용 '${quoted.slice(0, 30)}'이 ${passageIsStudentSurface ? "지문/보기/자료" : "보기/자료"}에 없습니다`,
          );
        }
      }
    }
    // [KO-JUDGE-FIX] 해설·오답해설 내 큰따옴표 직접인용의 실재성 — 소넷 판정단
    // 실사고(KO_SP_PLAN): 오답해설이 학생이 읽지 않은 참고용 지문 문장을 발표문
    // 인용("…")으로 날조. 해설의 큰따옴표 인용(≥8자)은 원자료 어딘가에 verbatim
    // 존재해야 한다. 작은따옴표는 해설에서 개념 지시·강조로 관행 사용되므로
    // 제외하고, 큰따옴표 직접인용만 검사한다(과탐 보수 설계 — 토씨 변형 인용도
    // 계약 §1 인용 실재성 위반이므로 차단이 옳다).
    {
      const explanationTexts: string[] = [];
      if (typeof question.explanation === "string") explanationTexts.push(question.explanation);
      const woe = question.wrongOptionExplanations;
      if (Array.isArray(woe)) {
        for (const e of woe) {
          const t = (e as { explanation?: unknown })?.explanation;
          if (typeof t === "string") explanationTexts.push(t);
        }
      } else if (woe && typeof woe === "object") {
        for (const t of Object.values(woe as Record<string, unknown>)) {
          if (typeof t === "string") explanationTexts.push(t);
        }
      }
      // 해설은 교사 표면이라 지문 인용도 정당 — 상단 spanInAnySurface(지문∪보기∪자료) 사용.
      const DOUBLE_QUOTE_RE = /[“"]([^”"]{8,120})[”"]/g;
      for (const text of explanationTexts) {
        for (const m of text.matchAll(DOUBLE_QUOTE_RE)) {
          const quoted = m[1].trim();
          if (!quoted || !/[가-힣]/.test(quoted)) continue;
          if (!spanInAnySurface(quoted)) {
            add(
              "error",
              "ko-quote-not-verbatim",
              `해설의 직접인용 "${quoted.slice(0, 30)}"이 지문·보기·자료 어디에도 없습니다 — 인용 날조 금지, 원문 verbatim 으로만 인용하세요`,
            );
          }
        }
      }
    }
    // [KO-W1-5] 정답 길이 편중 — 정답이 유일 최장이면서 나머지 평균의 1.35배
    // 이상이면 길이 휴리스틱만으로 정답이 노출된다(KO_RD_STRUCT 실증: 66자
    // vs 평균 47.75자). 정상 문항 오차단 방지를 위해 warning 등급.
    if (options.length === 5 && expected.includes(correctAnswer)) {
      const lens = options.map((o) => charCountKo(o.text));
      const idx = expected.indexOf(correctAnswer);
      const correctLen = lens[idx];
      const others = lens.filter((_, i) => i !== idx);
      const maxOther = Math.max(...others);
      const meanOther = others.reduce((a, b) => a + b, 0) / others.length;
      if (meanOther > 0 && correctLen > maxOther && correctLen >= meanOther * 1.35) {
        add(
          "warning",
          "ko-answer-length-bias",
          `정답 선지 ${correctAnswer}(${correctLen}자)가 유일하게 최장이면서 나머지 평균(${Math.round(meanOther)}자)의 1.35배를 넘습니다 — 길이만으로 정답이 노출될 수 있으니 정답을 압축하거나 오답을 보강하세요`,
        );
      }
    }
  } else {
    // ── 서답형 ──────────────────────────────────────────────────────────
    if (!correctAnswer.trim()) {
      add("error", "ko-correct-answer-invalid", "서답형 correctAnswer(모범답안)가 비어 있습니다");
    }
    // 정답 누출: 발문·보기에 정답 문자열이 그대로 노출
    const answerCore = correctAnswer.trim();
    if (answerCore.length >= 4) {
      if (containsSpanKo(direction, answerCore)) {
        add("error", "ko-answer-leak", "발문에 정답이 그대로 노출되어 있습니다");
      }
      if (bogiText && containsSpanKo(bogiText, answerCore) && meta.typeId !== "KO_NS_CLOZE") {
        add("error", "ko-answer-leak", "<보기>에 정답이 그대로 노출되어 있습니다");
      }
      // 자체자료 누수 — 자료는 봉투 동봉물이라 지문과 달리 verbatim 노출이
      // 정당한 유형(발췌형)이 없다. 발췌형 stimulus 유형이 생기면 여기 예외 등록.
      if (stimulusText && containsSpanKo(stimulusText, answerCore)) {
        add("error", "ko-answer-leak", "자체자료(koStimulus)에 정답이 그대로 노출되어 있습니다");
      }
    }
  }

  // ── <보기> 필수 여부 ──────────────────────────────────────────────────
  if (meta.usesBogi === "required" && bogiLines.length === 0) {
    add("error", "ko-bogi-missing", "<보기>가 필수인 유형인데 bogi 가 없습니다");
  }

  // ── 자체자료(stimulus) 게이트 ─────────────────────────────────────────
  // ko-stimulus-missing 은 codes.ts KO_BLOCKING_CODES 에 등록됨(A4-조립) —
  // relaxed 폴백에서도 차단된다.
  issues.push(...validateKoStimulusCommon(question, meta, stimulusBlocks));

  // ── 마커 무결성 (표면별: passage / stimulus) ──────────────────────────
  const markers = readMarkers(question);
  if (markers.length > 0) {
    for (const m of markers) {
      if (!isValidMarkerLabel(m.family, m.label)) {
        add("error", "ko-marker-unresolved", `마커 라벨이 규격 밖입니다: ${m.family} "${m.label}"`);
      }
    }
    const passageMarkers = markers.filter((m) => m.targetSurface !== "stimulus");
    const stimulusMarkers = markers.filter((m) => m.targetSurface === "stimulus");
    if (passageMarkers.length > 0) {
      issues.push(...checkKoMarkersOnSurface(ctx.passage, passageMarkers, "지문"));
    }
    if (stimulusMarkers.length > 0) {
      if (stimulusBlocks.length === 0) {
        for (const m of stimulusMarkers) {
          add(
            "error",
            "ko-marker-unresolved",
            `마커 ${m.label} 가 targetSurface="stimulus" 인데 koStimulus 자료가 없습니다`,
          );
        }
      } else {
        issues.push(...checkKoStimulusMarkers(stimulusBlocks, stimulusMarkers));
      }
    }
  }

  // ── [KO-W1-2] 원문 내 마커 글리프 사전 삽입 금지 ──────────────────────
  // 표면을 정확히 한정한다: 검사 대상은 지문·자료 "원문"뿐이다 — 발문·선지·
  // <보기>에서 ㉠/ⓐ 를 지칭하는 것은 정상이므로 스캔하지 않는다.
  {
    const stimulusGlyph = stimulusText.match(KO_MARKER_GLYPH_RE)?.[0];
    if (stimulusGlyph) {
      const hasStimulusMarkers = markers.some((m) => m.targetSurface === "stimulus");
      if (hasStimulusMarkers) {
        // 자료에 글리프가 박힌 채 markers 가 자료를 다시 마킹 → 이중 마커 확정
        add(
          "error",
          "ko-marker-glyph-in-source",
          `자료(koStimulus) 원문에 마커 글리프 '${stimulusGlyph}' 가 이미 삽입되어 있는데 markers 가 자료를 다시 마킹합니다 — 렌더에서 이중 마커가 됩니다. 자료 원문에는 순수 텍스트만 쓰고 마킹은 markers 배열로만 표현하세요`,
        );
      } else {
        // markers 미선언 baked-in 마킹 — 렌더는 깨지지 않으나 verbatim 검증을
        // 전부 우회하는 계약 일탈. 정상 문항 오차단 방지를 위해 warning.
        add(
          "warning",
          "ko-marker-glyph-in-source",
          `자료(koStimulus) 원문에 마커 글리프 '${stimulusGlyph}' 가 리터럴로 포함되어 있습니다 — 마킹은 markers 배열로 표현해야 위치·verbatim 검증이 보장됩니다`,
        );
      }
    }
    // 지문은 교사 제공 원문이라 재생성으로 고칠 수 없다 — 이중 마커 위험만
    // warning 으로 표면화(차단하면 정상 지문 입력까지 오차단될 수 있음).
    if (markers.some((m) => m.targetSurface !== "stimulus")) {
      const passageGlyph = ctx.passage.match(KO_MARKER_GLYPH_RE)?.[0];
      if (passageGlyph) {
        add(
          "warning",
          "ko-marker-glyph-in-source",
          `지문 원문에 마커 글리프 '${passageGlyph}' 가 이미 있는데 markers 가 지문을 다시 마킹합니다 — 이중 마커 위험, 검수 필요`,
        );
      }
    }
  }

  // ── [KO-W1-3] 고아 마커 — 선언됐으나 어디서도 지칭되지 않음 ───────────
  // 발문·선지·<보기>·조건 어디에도 라벨 지칭이 없으면 학생에게 설명 없는
  // 마킹이 노출된다(KO_LIT_FACT 실증). 선지-마커 1:1 유형(lockedOptionOrder
  // 계열)은 자체 ko-marker-option-mismatch 검사가 있어 중복 발화를 피한다.
  if (markers.length > 0 && meta.lockedOptionOrder !== true) {
    const referenceSurface = expandKoMarkerRanges(
      [direction, ...options.map((o) => o.text), ...bogiLines, ...readConditionTexts(question)]
        .filter(Boolean)
        .join("\n"),
    );
    for (const m of markers) {
      if (!m.label) continue;
      if (!referenceSurface.includes(m.label)) {
        add(
          "warning",
          "ko-marker-orphan",
          `마커 ${m.label} 가 선언되었지만 발문·선지·<보기> 어디에서도 지칭되지 않습니다 — 학생에게 설명 없는 마킹이 노출됩니다(마커를 제거하거나 발문에서 지칭하세요)`,
        );
      }
    }
  }

  // ── [KO-W1-4] 이질어·표기 게이트 — 그리스·수학 기호, 고립 라틴 용어 ────
  // 해설(explanation·wrongOptionExplanations)·선지 텍스트 대상. 지문·보기·
  // 자료에 실재하는 표기는 인용(병기)으로 보고 면제 — 과탐 방지 warning.
  {
    const sourceUnion = [ctx.passage, bogiText, stimulusText].join("\n");
    const offenders = new Set<string>();
    const foreignSurfaces = [
      ...options.map((o) => o.text),
      str(question.explanation),
      ...readWrongOptionExplanationTexts(question),
    ];
    for (const surface of foreignSurfaces) {
      for (const token of foreignLexemesKo(surface, sourceUnion)) offenders.add(token);
    }
    if (offenders.size > 0) {
      add(
        "warning",
        "ko-foreign-lexeme",
        `선지·해설에 국어 문항 문체와 이질적인 표기가 있습니다(그리스·수학 기호 또는 고립 라틴 용어): ${[...offenders].slice(0, 5).join(", ")} — 서술형 우리말 표현으로 바꾸세요`,
      );
    }
  }

  // ── 부정발문-정답 구조 휴리스틱 ───────────────────────────────────────
  if (meta.answerFormat === "MC5" && isNegativeStemKo(direction)) {
    const explanation = str(question.explanation);
    if (explanation && /정답.*(적절하다|일치한다)/.test(explanation.slice(0, 60))) {
      add(
        "warning",
        "ko-negative-stem-mismatch",
        "부정발문인데 해설 서두가 정답을 '적절하다'로 서술합니다 — 극성 확인 필요",
      );
    }
  }

  // ── 배점 상궤 ─────────────────────────────────────────────────────────
  const points = typeof question.points === "number" ? question.points : meta.defaultPoints;
  if (ctx.examMode === "SUNEUNG" && meta.answerFormat === "MC5" && (points < 2 || points > 3)) {
    add("warning", "ko-points-unusual", `수능 객관식 배점은 2~3점입니다: ${points}점`);
  }

  return issues;
}

function readBogiLines(q: Q): string[] {
  if (!q.bogi || typeof q.bogi !== "object") return [];
  const lines = (q.bogi as Q).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

/** 조건 나열 유형(conditions[])의 라벨·본문 — 고아 마커 판정의 지칭 표면에 포함. */
function readConditionTexts(q: Q): string[] {
  if (!Array.isArray(q.conditions)) return [];
  return q.conditions
    .filter((c): c is Q => !!c && typeof c === "object")
    .flatMap((c) => [str(c.label), str(c.text)])
    .filter(Boolean);
}

/**
 * wrongOptionExplanations 해설 본문 추출 — KO 봉투는 배열형({label, explanation})
 * 이 정격이지만, 과거 데이터/영어 경유 Record 형도 방어적으로 읽는다.
 */
function readWrongOptionExplanationTexts(q: Q): string[] {
  const woe = q.wrongOptionExplanations;
  if (Array.isArray(woe)) {
    return woe
      .map((el) =>
        el && typeof el === "object" ? str((el as Q).explanation) : typeof el === "string" ? el : "",
      )
      .filter(Boolean);
  }
  if (woe && typeof woe === "object") {
    return Object.values(woe).filter((v): v is string => typeof v === "string");
  }
  return [];
}

/**
 * "㉠~㉤"·"ⓐ~ⓔ" 같은 범위 표기를 개별 라벨 나열로 전개한다 — 고아 마커
 * 게이트가 범위 축약 지칭(발문 관행)을 미지칭으로 오판하지 않게(과탐 방지).
 * 같은 패밀리(코드포인트 오름차순·간격 ≤13)만 전개하고, 그 외는 원문 유지.
 */
export function expandKoMarkerRanges(text: string): string {
  return text.replace(
    /([㉠-㉭ⓐ-ⓙ])\s*[~∼〜–—-]\s*([㉠-㉭ⓐ-ⓙ])/g,
    (full, a: string, b: string) => {
      const start = a.codePointAt(0) ?? 0;
      const end = b.codePointAt(0) ?? 0;
      if (end <= start || end - start > 13) return full;
      let expanded = "";
      for (let c = start; c <= end; c++) expanded += String.fromCodePoint(c);
      return expanded;
    },
  );
}

/**
 * 이질 표기 토큰 검출 — (a) 그리스·수학 기호 (b) 병기 괄호·[A]라벨 제거 후
 * 남는 2자 이상 라틴 연쇄. sourceText(지문∪보기∪자료)에 실재하면 인용으로
 * 간주해 면제한다. 반환은 위반 토큰 목록(중복 포함 가능 — 호출부가 Set 처리).
 */
export function foreignLexemesKo(text: string, sourceText: string): string[] {
  if (!text) return [];
  const offenders: string[] = [];
  for (const symbol of text.match(KO_FOREIGN_SYMBOL_RE) ?? []) {
    if (!sourceText.includes(symbol)) offenders.push(symbol);
  }
  // 정당한 병기(괄호 안 로마자 표기 "뱅크 런(bank run)")·[A]~[E] 블록 라벨은
  // 라틴 검출 대상에서 제외 — 괄호 세그먼트·브래킷 라벨을 통째로 걷어낸다.
  const stripped = text.replace(/\([^)]*\)/g, " ").replace(/\[[A-E]\]/g, " ");
  for (const word of stripped.match(KO_LATIN_TERM_RE) ?? []) {
    if (!sourceText.includes(word)) offenders.push(word);
  }
  return offenders;
}

/**
 * 자체자료 공통 게이트 (validateKoCommon 이 선실행 — 유형 validate() 재구현 금지):
 *   (a) usesStimulus="required" 유형의 자료 결손 → error ko-stimulus-missing
 *   (b) 선언 stimulusKinds 밖의 kind → warning ko-stimulus-kind
 *   (c) 옛한글 조합 글리프(첫가끝·아래아) → warning ko-render-fallback
 *       (v1 렌더 폰트 미보장 — 현대어 전사 유도)
 * 단독 export: stimulus 유형 모듈이 자체 검증에서 재호출할 필요는 없다.
 */
export function validateKoStimulusCommon(
  question: Q,
  meta: KoTypeMeta,
  blocks?: KoRenderStimulusBlock[],
): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const stimulusBlocks = blocks ?? readKoStimulusBlocks(question.koStimulus);
  const usesStimulus = meta.usesStimulus ?? "none";

  if (usesStimulus === "required" && stimulusBlocks.length === 0) {
    issues.push({
      severity: "error",
      code: "ko-stimulus-missing",
      message: "자체자료(koStimulus)가 필수인 유형인데 자료가 없습니다",
    });
  }
  if (meta.stimulusKinds?.length) {
    for (const b of stimulusBlocks) {
      if (!meta.stimulusKinds.includes(b.kind)) {
        issues.push({
          severity: "warning",
          code: "ko-stimulus-kind",
          message: `자료 kind ${b.kind} 는 이 유형의 허용 kind(${meta.stimulusKinds.join("/")}) 밖입니다`,
        });
      }
    }
  }
  for (const b of stimulusBlocks) {
    if (KO_ARCHAIC_GLYPH_RE.test([b.title ?? "", ...b.lines].join(""))) {
      issues.push({
        severity: "warning",
        code: "ko-render-fallback",
        message:
          "자료에 옛한글 글리프(첫가끝 조합 자모·아래아)가 있습니다 — v1 렌더 폰트 미보장, 현대어 전사 권장",
      });
      break; // 문항당 1회
    }
  }
  return issues;
}

/**
 * 마커 집합을 지정 표면 텍스트에 대해 해소·중첩·순서 검증한다.
 * (validateKoCommon 의 지문/자료 양 표면이 공용 — targetSurface 해소 검증의 본체)
 */
function checkKoMarkersOnSurface(
  surfaceText: string,
  markers: KoMarker[],
  surfaceLabel: "지문" | "자료",
): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const resolution = resolveKoMarkers(surfaceText, markers);
  for (const m of resolution.unresolved) {
    issues.push({
      severity: "error",
      code: "ko-marker-unresolved",
      message: `마커 ${m.label} 의 spanText 를 ${surfaceLabel}에서 찾을 수 없습니다(verbatim 위반): "${m.spanText.slice(0, 40)}"`,
    });
  }
  for (const [a, b] of resolution.overlaps) {
    issues.push({
      severity: "error",
      code: "ko-marker-overlap",
      message: `마커 ${a} 와 ${b} 의 ${surfaceLabel} 구간이 겹칩니다`,
    });
  }
  // 표면 흐름 순서와 라벨 순서 일치 (같은 패밀리 내)
  const byFamily = new Map<string, typeof resolution.resolved>();
  for (const r of resolution.resolved) {
    const list = byFamily.get(r.family) ?? [];
    list.push(r);
    byFamily.set(r.family, list);
  }
  for (const [family, list] of byFamily) {
    const sortedByPos = [...list].sort((x, y) => x.match.sourceStart - y.match.sourceStart);
    const labelOrder = list.map((r) => r.label).join("");
    const posOrder = sortedByPos.map((r) => r.label).join("");
    if (labelOrder !== posOrder) {
      issues.push({
        severity: "warning",
        code: "ko-marker-order",
        message: `${family} 마커 라벨 순서가 ${surfaceLabel} 등장 순서와 다릅니다: ${labelOrder} vs ${posOrder}`,
      });
    }
  }
  return issues;
}

/**
 * [KO-TYPES-1] stimulus 마커 게이트 — 렌더 병합과 동일한 블록 배정
 * (resolveKoStimulusMarkers: 블록별 lines 전용 표면, title 제외)을 그대로 검증해
 * "게이트 통과 = 렌더에서 같은 위치에 병합" 을 구성적으로 보장한다.
 * 종전(title 포함 합본 checkKoMarkersOnSurface)의 3결함을 차단한다:
 *   (a) title 겹침으로 occurrenceIndex 가 합본 기준으로 매겨져 렌더 행이 어긋남,
 *   (b) title 에만 있는 스팬이 통과했으나 렌더에서 마커가 소실됨,
 *   (c) 복수 블록에서 findSpanKo 클램프로 다른 블록에 오배치됨.
 * occurrence 엄격화는 게이트 측에서만: 배정 블록 표면에서 occurrenceIndex 가
 * 등장 총수를 벗어나면(렌더는 방어적으로 클램프) 위치 모호로 error 차단해
 * 재생성으로 반려한다.
 */
function checkKoStimulusMarkers(
  blocks: KoRenderStimulusBlock[],
  markers: KoMarkerWithSurface[],
): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const assignment = resolveKoStimulusMarkers(blocks, markers);
  for (const m of assignment.unassigned) {
    issues.push({
      severity: "error",
      code: "ko-marker-unresolved",
      message: `마커 ${m.label} 의 spanText 를 자료 본문(블록 lines)에서 찾을 수 없습니다(verbatim 위반 — title 은 마킹 표면이 아닙니다): "${m.spanText.slice(0, 40)}"`,
    });
  }
  // 블록별 해소 결과 수집 — 겹침(error)·위치 모호(error)·패밀리 순서(warning)
  const resolvedEntries = new Map<string, { block: number; start: number }>();
  const entryKey = (family: string, label: string) => `${family}\u0000${label}`;
  assignment.perBlock.forEach(({ text, markers: blockMarkers }, blockIdx) => {
    if (blockMarkers.length === 0) return;
    const resolution = resolveKoMarkers(text, blockMarkers);
    for (const [a, b] of resolution.overlaps) {
      issues.push({
        severity: "error",
        code: "ko-marker-overlap",
        message: `마커 ${a} 와 ${b} 의 자료 구간이 겹칩니다`,
      });
    }
    for (const r of resolution.resolved) {
      const wanted = r.occurrenceIndex ?? 0;
      if (wanted > r.match.occurrenceTotal - 1) {
        issues.push({
          severity: "error",
          code: "ko-marker-unresolved",
          message: `마커 ${r.label} 의 occurrenceIndex(${wanted}) 가 배정 자료 블록의 등장 횟수(${r.match.occurrenceTotal})를 벗어납니다 — 위치 모호(렌더는 클램프되어 의도와 다른 위치에 찍힘)`,
        });
      }
      resolvedEntries.set(entryKey(r.family, r.label), {
        block: blockIdx,
        start: r.match.sourceStart,
      });
    }
  });
  // 패밀리 내 라벨 순서 ↔ 자료 흐름 순서(블록순 → 블록 내 위치순) 대조
  const byFamily = new Map<string, { label: string; block: number; start: number }[]>();
  for (const m of markers) {
    const entry = resolvedEntries.get(entryKey(m.family, m.label));
    if (!entry) continue;
    const list = byFamily.get(m.family) ?? [];
    list.push({ label: m.label, block: entry.block, start: entry.start });
    byFamily.set(m.family, list);
  }
  for (const [family, list] of byFamily) {
    const sortedByPos = [...list].sort((x, y) => x.block - y.block || x.start - y.start);
    const labelOrder = list.map((e) => e.label).join("");
    const posOrder = sortedByPos.map((e) => e.label).join("");
    if (labelOrder !== posOrder) {
      issues.push({
        severity: "warning",
        code: "ko-marker-order",
        message: `${family} 마커 라벨 순서가 자료 등장 순서와 다릅니다: ${labelOrder} vs ${posOrder}`,
      });
    }
  }
  return issues;
}
