// ============================================================================
// KO_RD_THEORY — 독서론 세트 단독 문항 (읽기 이론 이해 · 학생 메모 매핑)
// ============================================================================
// 카탈로그 §2.1 KO_RD_THEORY 사양의 구현. 수능 1~3번 독서론 세트(현행 한정,
// 2028 개편 시 소멸 예정)의 단독 문항 유형 — 읽기 이론·독서 방법 지문 전제.
//
// 실측 관행(카탈로그 §2.1·§4.1):
//   발문 A(이해형): "윗글에 대한 이해로 적절하지 않은 것은?" (2점)
//   발문 B(메모 매핑형): "다음은 학생이 작성한 메모이다. ⓐ~ⓔ 중 적절하지
//     않은 것은?" (3점 관행) — 메모는 자체자료(koStimulus, PLAN_NOTE),
//     ⓐ~ⓔ는 어휘가 아니라 **학생 산출물 부분 지시(예외 용법)** 로
//     targetSurface="stimulus" 마커 5개가 메모 행 내부의 행동 진술 구절에 걸린다.
//   오답 원리: 이론 개념-메모 행동 오매칭 / 이론이 명시한 한정 조건 누락.
//
// 메모 매핑형은 선지-마커 1:1 대응(①=ⓐ)이 관행이므로 lockedOptionOrder: true
// (KO_RD_VOCAB 미러 — 정답 위치 결정론 셔플 제외. 이해형도 함께 제외되므로
// 프롬프트가 정답 위치 분산을 지시한다).
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
} from "../core/render-model";
import { LATIN_CIRCLED_LABELS } from "../core/markers";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  questionForm: z
    .enum(["COMPREHENSION", "MEMO_MAPPING"])
    .describe(
      "출제 형태 — COMPREHENSION: '윗글에 대한 이해로 적절하지 않은 것은?' (지문만, 2점), MEMO_MAPPING: '다음은 학생이 작성한 메모이다. ⓐ~ⓔ 중 적절하지 않은 것은?' (koStimulus 메모 + stimulus 마커 5개, 3점 관행)",
    ),
  answerFlaw: z
    .enum(["CONCEPT_ACTION_MISMATCH", "CONDITION_DROP"])
    .describe(
      "정답(부적절) 항목에 적용한 오답 원리: CONCEPT_ACTION_MISMATCH=지문의 이론 개념 A에 해당하는 행동·진술을 개념 B의 것으로 오매칭, CONDITION_DROP=이론이 명시한 한정 조건(단계·상황·전제)을 누락하거나 어긴 적용을 적절한 것처럼 서술",
    ),
});

const prompt = `### 유형: 독서 — 독서론 세트 단독 문항 (읽기 이론 이해 · 학생 메모 매핑)

**지문 전제**: 이 유형은 읽기 이론·독서 방법을 설명하는 독서론 지문(수능 1~3번 세트 지문)을
전제한다 — 예: 초인지(메타인지) 읽기 전략, 눈동자 움직임 연구, 사회적 독서, 독서 일지,
주제 통합적 읽기, 읽기 발달 단계. 일반 독서 지문이 주어져도 그 안의 개념·방법·조건 구조를
같은 방식으로 다뤄라.

**발문 템플릿** (questionForm 에 따라 정확히 이 형태로 — [3점] 마크업은 시스템 처리이니 넣지 말 것):
- COMPREHENSION: "윗글에 대한 이해로 적절하지 않은 것은?"
- MEMO_MAPPING: "다음은 학생이 작성한 메모이다. ⓐ~ⓔ 중 적절하지 않은 것은?"
이 유형의 발문은 두 형태 모두 반드시 부정발문이다. 긍정발문 금지.

**COMPREHENSION(이해형) 구성 원리**:
1. 5개 선지는 지문의 서로 다른 문단/구역의 이론 개념·방법·조건을 재진술한다 — 한 문단 몰림 금지.
2. 선지는 지문 문장 복사가 아니라 재진술이다. 평서형('~다')으로 끝내라.
3. 참 선지 4개 + 왜곡 선지 1개(=정답). 왜곡은 answerFlaw 원리를 정확히 한 지점에만 적용하라:
   - CONCEPT_ACTION_MISMATCH: 개념 A의 특징·기능·예를 개념 B의 것으로 서술
     (예: 지문 "점검하기는 읽기 중에 이해 여부를 확인하는 활동이다" → 선지 "점검하기는 읽기 전에
     배경지식을 활성화하는 활동이다").
   - CONDITION_DROP: "~인 경우에만/초기 단계에서는/능숙한 독자는" 같은 한정 조건을 지워
     과잉 일반화하거나, 조건이 어긋난 상황에 적용 가능한 것처럼 서술.
4. koStimulus·markers 는 절대 동봉하지 마라 — 이해형은 지문과 선지만으로 구성된다.
5. 정답 위치(①~⑤)는 시스템이 셔플하지 않는다 — 매 출제마다 다른 위치를 의도적으로 골라라.

**MEMO_MAPPING(메모 매핑형) 구성 원리**:
1. **메모(koStimulus) 설계**: kind="PLAN_NOTE" 블록 정확히 1개. 지문의 읽기 이론을 학생이
   자신의 독서 활동에 적용해 작성한 산출물이다. title 은 "OO을 읽고 쓴 메모"처럼 구체 상황을
   담고(필요시), lines 는 5~7행 — 각 행은 학생의 행동·계획·점검 진술 1개
   ("~했다", "~해야겠다", "~하며 읽었다" 종결). 메모는 지문 문장의 복사가 아니라
   이론을 **구체 독서 상황에 적용한** 진술이어야 한다.
2. **마커(ⓐ~ⓔ) — 산출물 부분 지시(예외 용법)**: family="LATIN_CIRCLED",
   **targetSurface="stimulus"** 로 메모 행 내부의 행동 진술 구절 5곳에 건다. spanText 는 메모
   행에 적힌 그대로(verbatim — 한 글자도 바꾸지 말 것), 단어 하나가 아니라 판정 가능한
   **구절 단위**(행동+대상, 2어절 이상)로 잡아라. 메모 등장 순서대로 ⓐ→ⓔ, 5개 전부 서로 다른
   행에 분산시켜라.
3. ⓐ~ⓔ 중 정확히 1개(=정답)는 지문 이론에 비추어 **부적절한 적용**이다 — answerFlaw 원리를
   적용하라: 이론 개념에 해당하지 않는 행동을 그 개념의 실행처럼 쓰거나(CONCEPT_ACTION_MISMATCH),
   이론이 단서로 둔 조건을 어긴 행동을 쓴다(CONDITION_DROP). 나머지 4개는 지문 이론과 정확히
   부합하는 적용이어야 한다 — 하나라도 애매하면 복수 정답 시비로 반려된다.
4. **선지-마커 1:1 순서 대응 절대 준수**: ①=ⓐ, ②=ⓑ, ③=ⓒ, ④=ⓓ, ⑤=ⓔ. 선지 텍스트는
   마커 라벨 단독("ⓐ") 또는 "ⓐ: 판정 요지 한 줄" 형식만 허용한다. 순서를 바꾸지 마라 —
   정답 라벨은 부적절 항목의 위치(ⓐ면 ①, ⓔ면 ⑤)로 자동 결정된다.
5. points 는 3으로 설정하라 (독서론 메모 매핑 3점 관행).
6. 부적절 항목의 위치(ⓐ~ⓔ)는 매 출제마다 고르게 분산시켜라.

**근거앵커(evidence) 작성** (두 형태 공통 — 판정 근거는 항상 지문의 이론 문면):
- 참 선지(적절 항목): relation=SUPPORTS + 그 선지/메모 행동이 부합하는 지문 이론 구절 verbatim.
- 정답(부적절 항목): relation=DISTORTS(개념 오매칭·조건 위반) 또는 CONTRADICTS(정면 모순) +
  부적절 판정의 기준이 되는 지문 이론 구절 verbatim. 메모 매핑형에서도 근거 spanText 는
  메모가 아니라 **지문**에서 복사하라(메모 행을 근거로 쓰면 자기 참조가 된다).

**해설(explanation) 의무**:
- 정답 항목이 지문의 어떤 개념·조건과 어긋나는지, 지문 근거 문장을 직접 인용하며 서술하라.
- 메모 매핑형은 "ⓐ는 지문의 '…(이론 구절)…'에 해당하므로 적절하다" 식으로
  wrongOptionExplanations 에서 나머지 4개 항목의 개념 대응을 각각 확인하라.

**금지**:
- 긍정발문, 두 형태 발문 템플릿 밖의 변형.
- 지문 문장을 그대로 복사한 선지·메모 행 (재진술·적용 없는 구성).
- 상식만으로 정오가 갈리는 항목, 읽지 않아도 배제되는 황당 진술.
- 왜곡 지점이 두 군데 이상인 정답 항목 (이 유형은 난도 하 — 판정은 한 끗이되 명료해야 한다).
- 메모 매핑형에서 마커를 지문(targetSurface 생략)에 거는 것 — 반드시 stimulus 표면이다.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.questionForm === "MEMO_MAPPING") {
    lines.push(
      "- questionForm=MEMO_MAPPING 으로 출제하라: 발문 \"다음은 학생이 작성한 메모이다. ⓐ~ⓔ 중 적절하지 않은 것은?\", koStimulus(PLAN_NOTE) 메모 1블록 + targetSurface=\"stimulus\" 마커 ⓐ~ⓔ 5개 + 선지 1:1 대응(①=ⓐ), points=3.",
    );
  } else {
    lines.push(
      "- questionForm=COMPREHENSION 으로 출제하라: 발문 \"윗글에 대한 이해로 적절하지 않은 것은?\", koStimulus·markers 없이 지문 재진술 선지 5개, 2점.",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 대응 단원이 희소한 유형이다 — 교과서 읽기 단원(독서의 방법·태도)의 용어를 그대로 쓰고, 메모 매핑형이면 메모 상황을 수업에서 다룬 제재의 독서 활동으로 설정하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 독서론 세트(1~3번)의 페이스 조절 슬롯이다 — 판정이 지문 문면에서 일의적으로 확인되는 평이한 밀도로 출제하라.",
    );
  }
  return lines.join("\n");
}

/** 메모 매핑형 선지: 마커 라벨 단독("ⓐ") 또는 "ⓐ: 요지" 형식. */
const MEMO_OPTION_RE = /^([ⓐⓑⓒⓓⓔ])\s*(?:[:：]\s*\S.*)?$/;

function readStimulusPlainText(question: Record<string, unknown>): string {
  const blocks = readKoStimulusBlocks(question.koStimulus);
  return blocks
    .map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n"))
    .join("\n");
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const memoForm = question.questionForm === "MEMO_MAPPING";
  const stimulusBlocks = readKoStimulusBlocks(question.koStimulus);

  // ── (1) 부정발문 고정 (두 형태 공통) ────────────────────────────────────
  if (direction && !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "독서론 유형은 부정발문('~적절하지 않은 것은?') 고정입니다 — 긍정발문 금지",
    );
  }

  // ── (2) 발문 ↔ questionForm 정합 ───────────────────────────────────────
  if (memoForm) {
    if (direction && !(/(메모|작성)/.test(direction) && direction.includes("ⓐ"))) {
      add(
        "error",
        "ko-direction-grammar",
        `MEMO_MAPPING 형 발문은 "다음은 학생이 작성한 메모이다. ⓐ~ⓔ 중 적절하지 않은 것은?" 형태여야 합니다 — "${direction.slice(0, 50)}"`,
      );
    }
  } else {
    if (direction && !direction.includes("윗글")) {
      add(
        "error",
        "ko-direction-grammar",
        `COMPREHENSION 형 발문은 "윗글에 대한 이해로 적절하지 않은 것은?" 형태여야 합니다 — "${direction.slice(0, 50)}"`,
      );
    }
    if (direction.includes("ⓐ")) {
      add(
        "error",
        "ko-direction-grammar",
        "COMPREHENSION 형인데 발문이 ⓐ~ⓔ 마커를 지시합니다 — questionForm 과 발문이 모순됩니다",
      );
    }
  }

  if (memoForm) {
    // ── (3) 메모(stimulus) 필수 — usesStimulus:"optional" 이라 공통 게이트가
    //        결손을 잡지 않으므로 여기서 형태 조건부로 강제한다.
    if (stimulusBlocks.length === 0) {
      add(
        "error",
        "ko-stimulus-missing",
        "MEMO_MAPPING 형인데 koStimulus(학생 메모, PLAN_NOTE)가 없습니다 — 메모 매핑형의 필수 자료입니다",
      );
    } else {
      if (stimulusBlocks.length > 1) {
        add(
          "warning",
          "ko-stimulus-kind",
          `메모 매핑형의 자료는 메모 1블록 관행입니다 (현재 ${stimulusBlocks.length}블록)`,
        );
      }
      const totalLines = stimulusBlocks.reduce((n, b) => n + b.lines.length, 0);
      if (totalLines < 5) {
        add(
          "warning",
          "ko-stimulus-kind",
          `메모가 ${totalLines}행 — ⓐ~ⓔ 5개 행동 진술을 담기에 부족합니다 (5~7행 권장)`,
        );
      }
    }

    // ── (4) 마커: 정확 5개 · 전부 LATIN_CIRCLED · 전부 stimulus 표면 · ⓐ→ⓔ ──
    //        (해소·중첩·순서는 공통 게이트 checkKoMarkersOnSurface 가 검증)
    if (markers.length !== 5) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커가 ${markers.length}개 — 선지 1:1 대응을 위해 ⓐ~ⓔ 정확히 5개여야 합니다`,
      );
    }
    const badFamilies = markers.filter((m) => m.family !== "LATIN_CIRCLED");
    if (badFamilies.length > 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `독서론 메모 마커는 전부 LATIN_CIRCLED(ⓐ~ⓔ)여야 합니다 — 위반 ${badFamilies.length}개`,
      );
    }
    const offSurface = markers.filter((m) => m.targetSurface !== "stimulus");
    if (offSurface.length > 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `메모 매핑형 마커는 전부 targetSurface="stimulus"(메모 표면)여야 합니다 — 지문 마킹 ${offSurface.length}개 발견`,
      );
    }
    const labels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
    const expectedSeq = LATIN_CIRCLED_LABELS.slice(0, 5).join("");
    if (markers.length === 5 && labels.join("") !== expectedSeq) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 라벨이 ${expectedSeq} 순서가 아닙니다: ${labels.join("")}`,
      );
    }
    // 산출물 부분 지시(예외 용법) — 단어 하나가 아니라 판정 가능한 구절이어야 한다
    for (const m of markers) {
      const span = typeof m.spanText === "string" ? m.spanText : "";
      if (span && ctx.koText.eojeolCount(span) < 2) {
        add(
          "warning",
          "ko-marker-hierarchy",
          `메모 마커 ${typeof m.label === "string" ? m.label : "?"} 의 스팬("${span.slice(0, 20)}")이 1어절 — 독서론 메모 지시는 행동 진술 구절(2어절 이상) 단위여야 합니다`,
        );
      }
    }

    // ── (5) 선지-마커 1:1 순서 대응 (①=ⓐ … ⑤=ⓔ) ─────────────────────────
    for (let i = 0; i < Math.min(options.length, 5); i++) {
      const text = typeof options[i].text === "string" ? (options[i].text as string) : "";
      const optionLabel = typeof options[i].label === "string" ? (options[i].label as string) : "";
      const m = MEMO_OPTION_RE.exec(text.trim());
      if (!m) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${optionLabel} 선지가 마커 지시 형식("ⓐ" 또는 "ⓐ: 요지")이 아닙니다: "${text.slice(0, 30)}"`,
        );
        continue;
      }
      const expectedMarker = LATIN_CIRCLED_LABELS[i];
      if (m[1] !== expectedMarker) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${optionLabel} 선지가 ${expectedMarker} 가 아니라 ${m[1]} 를 지시합니다 — 선지-마커 1:1 순서 대응(①=ⓐ) 위반`,
        );
      }
    }

    // ── (6) 배점 상궤: 메모 매핑형 3점 관행 ────────────────────────────────
    const points = typeof question.points === "number" ? question.points : 2;
    if (points !== 3) {
      add(
        "warning",
        "ko-points-unusual",
        `독서론 메모 매핑형은 3점 관행입니다 (현재 ${points}점)`,
      );
    }

    // ── (7) 근거 자기 참조 금지: 정답 판정 근거는 메모가 아니라 지문이어야 ──
    const stimulusText = readStimulusPlainText(question);
    const evidenceArr = Array.isArray(question.evidence)
      ? (question.evidence as Record<string, unknown>[])
      : [];
    for (const e of evidenceArr) {
      const span = typeof e.spanText === "string" ? e.spanText : "";
      if (!span) continue;
      if (!ctx.koText.containsSpanKo(ctx.passage, span) && ctx.koText.containsSpanKo(stimulusText, span)) {
        add(
          "error",
          "ko-evidence-not-in-passage",
          `근거 스팬이 지문이 아니라 메모에서 복사되었습니다(자기 참조): "${span.slice(0, 30)}" — 판정 근거는 지문의 이론 문면이어야 합니다`,
        );
      }
    }
  } else {
    // ── (3') 이해형: 자료·마커 동봉 금지 ───────────────────────────────────
    if (markers.length > 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `COMPREHENSION 형인데 마커 ${markers.length}개가 동봉되었습니다 — 이해형은 지문과 선지만으로 구성됩니다`,
      );
    }
    if (stimulusBlocks.length > 0) {
      add(
        "warning",
        "ko-stimulus-kind",
        "COMPREHENSION 형인데 koStimulus 가 동봉되었습니다 — 메모 매핑형이면 questionForm=MEMO_MAPPING 으로 선언하세요",
      );
    }
    // 선지 어미: 평서형 (meta.optionEnding 은 메모형 라벨 선지 때문에 "any" — 여기서 보강)
    for (const o of options) {
      const text = typeof o.text === "string" ? o.text : "";
      const label = typeof o.label === "string" ? o.label : "";
      if (!text) continue;
      const endingIssue = ctx.koText.optionEndingIssueKo(text, "plain");
      if (endingIssue) {
        add("warning", "ko-option-ending", `${label} ${endingIssue}: "${text.slice(0, 40)}"`);
        break; // 첫 위반만 (공통 게이트 관행 미러)
      }
    }
    // 지문 문장 통복사 선지 경고 (재진술 요구 — KO_RD_FACT 미러)
    for (const o of options) {
      const text = typeof o.text === "string" ? o.text : "";
      const label = typeof o.label === "string" ? o.label : "";
      const body = text.replace(/(다|이다|았다|었다|있다)\.?$/, "");
      if (body.length >= 25 && ctx.koText.containsSpanKo(ctx.passage, body)) {
        add(
          "warning",
          "ko-option-ending",
          `${label} 선지가 지문 문장을 재진술 없이 복사했습니다 — 재진술 거리를 확보하세요`,
        );
      }
    }
  }

  // ── (8) 극성-근거관계 정합 (부정발문 고정: 정답=왜곡 계열, 나머지=SUPPORTS) ─
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    if (isCorrect && ![...relations].some((r) => distortRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 정답(부적절 항목)인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 적절 항목인데 SUPPORTS 근거가 없습니다 — 지문 이론과의 부합 근거를 앵커하세요`,
      );
    }
  }

  return issues;
}

export const KO_RD_THEORY: KoTypeModule = {
  meta: {
    typeId: "KO_RD_THEORY",
    area: "READING",
    label: "독서론(읽기 이론) 이해·메모 매핑",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "optional", // MEMO_MAPPING 형에서만 필수 — validate 가 조건부 강제
    stimulusKinds: ["PLAN_NOTE"],
    markerFamilies: ["LATIN_CIRCLED"],
    optionEnding: "any", // 메모형 선지는 "ⓐ"/"ⓐ: 요지" 라벨 형식 — 이해형 평서 어미는 validate 가 보강
    needsSolverGate: false,
    lockedOptionOrder: true, // 메모형 ①=ⓐ 1:1 순서 대응 — 정답 위치 셔플 제외 (프롬프트가 위치 분산 지시)
    description:
      "읽기 이론·독서 방법 지문의 이해(윗글 이해형) 또는 학생 메모(ⓐ~ⓔ)의 이론 적용 적절성(메모 매핑형)을 판정하는 독서론 세트 단독 유형",
    setSlot: "독서론 세트(1~3번, 현행 한정 — 2028 개편 시 소멸 예정)의 이해/메모 매핑 슬롯, 매회 1~3번 고정",
    studentTask:
      "지문의 읽기 이론을 기준으로, 선지 재진술 또는 학생 메모의 ⓐ~ⓔ 적용 중 이론과 어긋나는 하나를 고릅니다.",
    bestFor: [
      "읽기 전략·독서 방법을 설명하는 독서론 지문",
      "개념-조건 구조가 뚜렷한 이론 설명 지문",
      "수능 1~3번 세트 대비 페이스 조절 훈련",
    ],
    outputUi: ["지문 동봉", "메모 매핑형: 학생 메모 자료 박스 + ⓐ~ⓔ 마킹", "5지선다(메모형 1:1 대응)", "선지별 이론 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "questionForm",
        label: "출제 형태",
        kind: "select",
        options: [
          { value: "COMPREHENSION", label: "윗글 이해형(지문만)" },
          { value: "MEMO_MAPPING", label: "학생 메모 매핑형(ⓐ~ⓔ · 3점)" },
        ],
        defaultValue: "COMPREHENSION",
        description: "메모 매핑형은 학생 메모 자료에 ⓐ~ⓔ를 마킹하고 부적절한 이론 적용 하나를 찾습니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: true,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "판정이 지문 한 문장과의 대조로 즉시 끝나게 하라. 이해형 왜곡은 개념 정의의 정면 오매칭, 메모형 부적절 항목은 이론 개념과 무관한 행동으로 명료하게.",
    INTERMEDIATE:
      "왜곡 판정에 두 문장(개념 정의 + 한정 조건)의 결합이 필요하게 하라. 메모형이면 부적절 항목을 CONDITION_DROP(조건 위반 적용)으로 — 행동 자체는 그럴듯하되 이론의 단서 조건과 어긋나게.",
    KILLER:
      "이 유형은 독서론 페이스 조절 슬롯이라 킬러 관행이 없다 — 상한은 '조건 결합 판정'까지다. 참 항목들의 재진술 거리를 넓히고 부적절 항목은 인접 개념 간 미세 오매칭으로 두되, 판정 근거는 여전히 지문 문면에서 일의적으로 확인되게 하라.",
  },
};
