// ============================================================================
// KO_WR_REVISE — 작문: 고쳐쓰기 (초고 수정 방안 판정)  【작문 세트 고정 슬롯】
// ============================================================================
// 카탈로그 §2.4 KO_WR_REVISE 의 전면 구현 — 최근 강화 추세(2026 6평·수능 연속).
// 2모드 (봉투 필드 reviseMode 가 구조를 고정한다):
//   LOCAL  — 학생 초고(koStimulus DRAFT)의 5곳에 ㉠~㉤ 마킹(어색한 접속·의미 중복·
//            성분 호응·불필요 문장·부적절 어휘), 발문 "㉠~㉤을 고쳐 쓰기 위한
//            방안으로 적절하지 않은 것은?" (구체제·내신 표준형)
//   GLOBAL — 초고(DRAFT) + <보기>(선생님·학생들의 의견) → 의견 반영 방안의 정오
//            판정 (수능 작문 세트형: "의견을 반영하여 고쳐 썼다고 할 때 …")
// 정답(부정발문의 정답 = 부적절한 방안) 원리 3종: 안 일어난·잘못 짚은 수정
// (NOT_PERFORMED) / 방향 반전(DIRECTION_FLIP) / 고칠 필요 없는 것을 고침
// (NEEDLESS_FIX).
//
// 결정론 게이트(본 모듈 validate — 공통 게이트는 dispatch 선실행):
//   ① 모드별 구조 강제 — LOCAL: stimulus 표면 KOR_CIRCLED 마커 정확히 5(㉠~㉤ 순서),
//      GLOBAL: 마커 0 + <보기>(의견) 필수
//   ② LOCAL 선지-마커 1:1 순서 대응(①↔㉠ … ⑤↔㉤ — meta.lockedOptionOrder 와 짝)
//   ③ 부정발문 고정 + 모드별 발문 골격(㉠~㉤ 지시 / '반영' 지시)
//   ④ 정답(부적절 방안)의 사유 evidence 극성(DISTORTS/CONTRADICTS/NOT_MENTIONED)
//      + 적절 방안 4개의 SUPPORTS 근거
//   ⑤ 마커 spanText 의 초고(DRAFT) verbatim — 공통 표면 검사와 결합한 이중 방어
// ============================================================================

import { z } from "zod";
import {
  koMarkerSchema,
  koMc5Envelope,
  koStimulusBlockSchema,
} from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
} from "../core/render-model";
import { KOR_CIRCLED_LABELS } from "../core/markers";
import type {
  KoDifficulty,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

/** LOCAL 모드가 사용하는 마커 라벨 5개 — ㉠~㉤ (선지 ①~⑤와 1:1 순서 대응). */
const LOCAL_MARKER_LABELS: readonly string[] = KOR_CIRCLED_LABELS.slice(0, 5);

const schema = koMc5Envelope({
  reviseMode: z
    .enum(["LOCAL", "GLOBAL"])
    .describe(
      "출제 모드 — LOCAL: 초고 5곳 ㉠~㉤ 마킹 + 지점별 수정 방안 판정(내신 표준형), GLOBAL: 초고+<보기> 의견 → 반영 방안 판정(수능 세트형). 설정 지시와 일치시킬 것",
    ),
  trapPrinciple: z
    .enum(["NOT_PERFORMED", "DIRECTION_FLIP", "NEEDLESS_FIX"])
    .describe(
      "정답(부적절한 방안)에 적용한 원리: NOT_PERFORMED=안 일어난·잘못 짚은 수정(해당 지점/의견에 없는 결함·요구를 전제), DIRECTION_FLIP=진단은 맞으나 처방이 반대 방향(고치면 더 어색해짐), NEEDLESS_FIX=고칠 필요 없는(문제 삼지 않은) 것을 고침",
    ),
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "학생 초고 — kind=\"DRAFT\" 블록 1개 필수. lines 는 문단 단위 행(문단 1개=행 1개), title 은 초고 제목. 사용자 지문은 소재 참고로만 쓰고 초고 본문은 자체 생성",
    ),
  markers: z
    .array(koMarkerSchema)
    .max(5)
    .describe(
      "LOCAL 전용 — family=\"KOR_CIRCLED\", targetSurface=\"stimulus\" 인 ㉠~㉤ 5개를 초고 등장 순서대로. spanText 는 초고 행 verbatim. GLOBAL 은 생략",
    )
    .optional(),
});

const prompt = `### 유형: 작문 — 고쳐쓰기 (초고 수정 방안 판정)

**모드 2종** — 봉투 필드 reviseMode 에 출제 모드를 반드시 기록하라(설정 지시와 일치).
이 유형의 발문은 반드시 부정발문이다. 긍정발문 금지.
- LOCAL(마커 고쳐쓰기 — 구체제·내신 표준): 초고 문장 5곳에 ㉠~㉤ 마킹.
  발문: "㉠~㉤을 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?"
- GLOBAL(의견 반영 고쳐쓰기 — 수능 작문 세트형, 2026 6평·수능 연속): 초고 + <보기>(의견).
  발문: "<보기>의 의견을 반영하여 초고를 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?"
  (변형: "다음 의견을 반영하여 고쳐 썼다고 할 때 적절하지 않은 것은?")

**초고(koStimulus DRAFT) 설계 — 두 모드 공통 필수**:
1. koStimulus 에 kind="DRAFT" 블록 1개: 학생이 쓴 초고 3~4문단. lines 는 문단 단위 행
   (문단 1개 = 행 1개), title 에 초고 제목(예: "교내 분리배출 개선을 위한 건의문 초고").
2. 사용자 지문은 소재·주제의 참고로만 사용하고 초고 본문은 자체 생성하라 — 지문 문장
   복사 금지. 교실 작문 맥락(학교 신문 기고문·건의문·소개하는 글·주장하는 글)의 학생
   문체로, 처음-중간-끝 짜임이 보이게 쓰라.
3. 결함은 모드가 요구하는 지점에만 심고, 그 외 부분은 고칠 여지가 없도록 명료하게
   쓰라 — '어디를 고쳐야 하는가'의 판정이 초고 문면에서 일의적이어야 한다.

**따옴표 규약 (위반 = 전량 반려 — 시스템이 결정론 검사한다)**:
- 초고·<보기> 원문 발췌는 작은따옴표 '…' 로만 인용하고 한 글자도 바꾸지 마라
  (시스템이 원문 verbatim 을 검사한다).
- 고침 후 표현(초고에 없는 대체어·새 문구·추가 문장)은 겹따옴표 "…" 로 표기하라.
  고침 후 표현을 작은따옴표로 쓰면 '원문에 없는 인용'으로 반려된다.

**LOCAL 모드 매뉴얼 (reviseMode="LOCAL")**:
- 결함 인벤토리 5종에서 마커 5개를 설계하라(같은 결함 유형은 최대 2회):
  ① 어색한 접속어 — 앞뒤 문장의 논리 관계(인과·대조·첨가)와 어긋나는 접속 표현
  ② 의미 중복 — '미리 예습하다', '따뜻한 온정' 류 겹말, 같은 정보의 불필요한 반복
  ③ 문장 성분 호응 오류 — 주어-서술어·부사어-서술어 호응 파탄('결코 ~이다',
     '왜냐하면 ~이다', '비록 ~므로')
  ④ 통일성을 해치는 문장 — 문단의 중심 화제에서 벗어난 불필요한 문장(삭제 대상)
  ⑤ 문맥에 부적절한 어휘 — 의미·쓰임이 어긋나는 단어(교체 대상)
- markers: 정확히 5개, 전부 family="KOR_CIRCLED", targetSurface="stimulus",
  라벨 ㉠~㉤을 초고 등장 순서대로. spanText 는 초고 행에서 그대로 복사하라
  (접속어·어휘 결함은 해당 표현만, 호응·통일성 결함은 문장 전체를 마킹).
- ⚠ **koStimulus lines 에 ㉠~㉤ 원문자를 직접 쓰지 마라(전량 반려)** — 초고 행은
  원문자 없는 순수 본문이어야 한다. 원문자는 markers 배열 선언만으로 시스템이
  렌더 시 삽입한다. lines 에 "㉠따라서 …" 처럼 박아 넣으면 출력물에 원문자가
  이중으로 찍힌다(시스템이 결정론 검사로 차단).
- 선지-마커 1:1 순서 대응(시스템이 위치를 그대로 보존한다 — 셔플 없음):
  ① 선지는 ㉠, ② 선지는 ㉡, … ⑤ 선지는 ㉤의 수정 방안만 다룬다. 다른 마커 혼입 금지.
- 선지 정형: [결함 진단]+[수정 처방] 2절, '~고친다/~삭제한다/~추가한다/~바꾼다' 평서 종결.
  예: "㉠: 앞 문장과 인과 관계가 성립하지 않으므로 "그러나"로 고친다."
      "㉣: 글의 중심 화제와 관련 없는 내용이므로 삭제한다."
- 적절한 방안 4개: 진단 정확 + 처방 정확 — 처방대로 고친 문장이 실제로 자연스러워지는지
  스스로 검산하라.
- 부적절한 방안 1개(정답) — trapPrinciple 하나를 정확히 적용:
  - NEEDLESS_FIX(고칠 필요 없는 것을 고침): 마킹 지점이 사실은 어법·문맥상 문제가 없는데
    고치자고 한다 — 이 마커는 결함 없는 자리에 걸어라.
  - DIRECTION_FLIP(방향 반전): 진단은 맞으나 처방이 반대 — 인과가 필요한 자리에 대조
    접속어를 제안하는 등, 고치면 오히려 더 어색해지는 방안.
  - NOT_PERFORMED(잘못 짚은 수정): 해당 지점에 없는 결함을 전제한 방안(중복이 아닌데
    중복이라며 삭제하자는 등).
  왜곡은 정확히 한 지점이어야 한다 — 진단·처방을 둘 다 틀리게 하면 난도가 무너진다.

**GLOBAL 모드 매뉴얼 (reviseMode="GLOBAL")**:
- bogi: label "보기", lines 는 화자 행 2~3개 — "선생님: 통계 자료의 출처를 밝히고, 예상
  독자가 얻을 이익이 드러나게 보완하면 좋겠어요." / "학생 1: 마지막 문단의 해결 방안이
  구체적이지 않은 것 같아." 의견은 초고의 실제 약점을 짚어야 하며, 반영 여부를 초고
  문면과 대조해 판정할 수 있어야 한다(막연한 덕담 금지).
- markers 는 생성하지 마라 — GLOBAL 은 무마커 구조다.
- 선지 정형: [어느 의견]+[반영 위치(n문단)]+[반영 내용] 3절, 평서 종결.
  예: "출처를 밝히라는 의견을 반영하여, 2문단의 통계 뒤에 "○○ 통계청, 2025"라는
  출처 표기를 추가한다."
- 적절한 방안 4개: 의견-위치-내용 3절이 전부 정합 — 의견이 실제로 요구한 것을, 초고에서
  그 약점이 실재하는 위치에, 요구된 방향으로 반영한다.
- 부적절한 방안 1개(정답) — trapPrinciple: NOT_PERFORMED(어느 의견도 요구하지 않은
  수정을 '반영'이라 주장) / DIRECTION_FLIP(의견의 방향과 반대로 수정 — 줄이라는데 늘림,
  삭제하라는데 보강) / NEEDLESS_FIX(의견이 문제 삼지 않은, 이미 잘 된 부분을 고침).

**근거앵커(evidence) — 모든 선지(①~⑤)에 optionLabel 을 달아 각 1개 이상**:
- 적절한 방안 선지: relation=SUPPORTS + 결함(또는 의견이 짚은 약점)이 실재하는 초고
  구절을 그대로 복사(verbatim).
- 부적절한 방안(정답): 실제 판정 관계로 — DIRECTION_FLIP 은 DISTORTS,
  NEEDLESS_FIX 는 CONTRADICTS(초고 문면이 방안의 전제와 모순), NOT_PERFORMED 는
  NOT_MENTIONED(가장 가까운 관련 구절). note 에 부적절한 이유를 한 줄로.
- GLOBAL 에서 의견 문장을 근거로 쓸 때는 <보기> 행을 그대로 복사하라.

**해설·오답 해설**:
- explanation: 정답 방안이 왜 부적절한지(적용 원리 포함)를 초고 구절 인용과 함께 서술하고,
  올바른 수정 방향을 덧붙여라.
- wrongOptionExplanations: 적절한 방안 4개 각각에 대해 '어떤 결함을 어떻게 바로잡는지'를
  초고 근거와 함께 1~2문장으로.

**금지**:
- 긍정발문, LOCAL 의 마커-선지 순서 어긋남·마커 혼입, 마커가 있는 GLOBAL.
- 초고 lines 에 원문자(㉠~㉤)를 직접 적는 것 — 마커는 markers 배열로만(렌더 중복 삽입 방지).
- 고침 후 표현의 작은따옴표 인용, 초고·보기에 없는 구절의 작은따옴표 인용(전량 반려).
- 두 선지가 같은 이유로 부적절해지는 구성, 결함 없는 초고(적절 방안 4개가 짚을 실결함이
  초고에 실재해야 한다).
- 사용자 지문 문장의 초고 복사, 맞춤법·표기 규정 암기 퀴즈화(이 유형은 고쳐쓰기 '방안'의
  적절성 판정이지 어문 규정 문제가 아니다 — 규정 축은 KO_GR_NORM 의 몫).`;

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string {
  const lines: string[] = [];

  const mode = settings.reviseMode === "GLOBAL" ? "GLOBAL" : "LOCAL";
  if (mode === "GLOBAL") {
    lines.push(
      '- 출제 모드: GLOBAL(의견 반영 고쳐쓰기). reviseMode="GLOBAL" 로 기록하고, 초고(DRAFT)+<보기>(선생님·학생 의견) 구성으로 마커 없이 출제하라. 발문은 "<보기>의 의견을 반영하여 초고를 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?" 골격.',
    );
  } else {
    lines.push(
      '- 출제 모드: LOCAL(마커 고쳐쓰기). reviseMode="LOCAL" 로 기록하고, 초고 5곳에 ㉠~㉤(targetSurface="stimulus")을 마킹해 선지-마커 1:1(①↔㉠ … ⑤↔㉤) 순서 대응으로 출제하라. 발문은 "㉠~㉤을 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?" 골격.',
    );
  }

  const genre = settings.draftGenre;
  if (genre === "PROPOSAL") {
    lines.push("- 초고 갈래: 건의·제안하는 글(학교·지역 사회의 문제 해결 요구, 예상 독자와 기대 효과가 드러나는 짜임).");
  } else if (genre === "EXPOSITION") {
    lines.push("- 초고 갈래: 설명·소개하는 글(교내 행사·인물·대상 소개, 정보 전달 중심의 객관적 문체).");
  } else if (genre === "ARGUMENT") {
    lines.push("- 초고 갈래: 주장하는 글(논제-근거-반론 고려의 짜임, 설득 목적 문체).");
  } else {
    lines.push("- 초고 갈래: 소재에 맞게 자동 선택(건의문/소개문/주장하는 글 중 결함 설계가 자연스러운 갈래).");
  }

  if (difficulty === "BASIC") {
    lines.push(
      "- 난이도 기본: 결함을 표면형으로 — 명백한 겹말, 논리 관계와 정면으로 어긋난 접속어. 정답은 DIRECTION_FLIP(처방이 반대 방향)로 한 번의 대조로 즉시 판정되게. GLOBAL 은 의견 2개, 선지의 반영 위치를 문단 서두로 단순화.",
    );
  } else if (difficulty === "KILLER") {
    lines.push(
      "- 난이도 킬러: '절반 참' 설계 — 다섯 방안 전부 진단은 그럴듯하게 하고, 정답만 처방(또는 전제)을 한 끗 왜곡하라. NEEDLESS_FIX 는 얼핏 어색해 보이지만 문맥상 정당한 표현에 걸어 전수 검산을 강제하라. GLOBAL 은 의견 3개에 두 의견을 결합 반영하는 선지를 1개 이상 포함하라.",
    );
  } else {
    lines.push(
      "- 난이도 중급: 접속·중복 같은 표면 결함과 호응·통일성 같은 구조 결함을 섞어라. 정답은 NEEDLESS_FIX 또는 NOT_PERFORMED — 해당 지점의 문면을 앞뒤 문장과 대조해야 판정되게 하라.",
    );
  }

  if (settings.examMode === "SUNEUNG") {
    lines.push(
      "- 수능형 모드: 화작 세트 43번대 실전 문체 — 발문·선지를 평가원식 간결·중립 문체로 쓰고, 문장 단위 결함과 함께 통일성·응집성(문단 차원 삭제·이동·추가) 판단의 비중을 높여라.",
    );
  } else {
    lines.push(
      "- 내신 모드(기본): 문장 단위 결함(접속어·성분 호응·의미 중복)을 중심으로 — 수업 활동지의 고쳐쓰기 관행을 따르고, 각 방안의 정오가 교사 채점 기준으로 시비 없이 갈리도록 진단·처방을 구체적으로 쓰라.",
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// validate — 유형 특화 결정론 게이트
// (공통 게이트: 선지 수·근거 verbatim·마커 표면 해소·자료 필수는 dispatch 선실행)
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

interface RawMarker {
  family: string;
  label: string;
  spanText: string;
  targetSurface: string;
}

function readRawMarkers(question: Record<string, unknown>): RawMarker[] {
  if (!Array.isArray(question.markers)) return [];
  return question.markers
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      family: str(m.family),
      label: str(m.label),
      spanText: str(m.spanText),
      targetSurface: str(m.targetSurface),
    }));
}

function readBogiLines(question: Record<string, unknown>): string[] {
  if (!question.bogi || typeof question.bogi !== "object") return [];
  const lines = (question.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = str(question.direction);
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[]).map((o) => ({
        label: str(o.label),
        text: str(o.text),
      }))
    : [];
  const markers = readRawMarkers(question);

  // 모드 판정 — 봉투 필드 우선(zod 가 생성 시 강제), 결손 시 구조로 추론
  const rawMode = question.reviseMode;
  const mode: "LOCAL" | "GLOBAL" =
    rawMode === "GLOBAL" || rawMode === "LOCAL"
      ? rawMode
      : markers.length > 0
        ? "LOCAL"
        : "GLOBAL";

  // ── (1) 부정발문 고정 — 고쳐쓰기는 두 모드 전부 '적절하지 않은 것은?' ────
  if (direction && !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "고쳐쓰기는 부정발문('~방안으로 적절하지 않은 것은?') 고정 유형입니다 — 긍정발문 금지",
    );
  }
  if (direction && !direction.includes("고쳐")) {
    add(
      "error",
      "ko-direction-grammar",
      `발문에 '고쳐 쓰기(고쳐 썼다)' 지시가 없습니다: "${direction.slice(0, 40)}"`,
    );
  }

  // ── (2) 초고(DRAFT) 자료 — 결손은 공통 게이트(ko-stimulus-missing)가 차단,
  //        여기서는 '자료는 있는데 DRAFT 가 아님'을 잡는다 ────────────────────
  const stimulusBlocks = readKoStimulusBlocks(question.koStimulus);
  const draftBlocks = stimulusBlocks.filter((b) => b.kind === "DRAFT");
  if (stimulusBlocks.length > 0 && draftBlocks.length === 0) {
    add(
      "error",
      "ko-stimulus-missing",
      '자료(koStimulus)에 초고 블록이 없습니다 — 고쳐쓰기는 kind="DRAFT" 학생 초고가 필수입니다',
    );
  }
  const draftText = draftBlocks
    .map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n"))
    .join("\n");

  // ── (2.5) 초고 원문자 하드코딩 차단(결정론) — 판정단 critical 재발 방지 ────
  // ㉠~㉤은 markers 배열로만 선언한다. lines 에 원문자를 직접 박아 넣으면 렌더
  // 파이프라인(buildKoMarkedPassage)이 markers 로 같은 위치에 원문자를 '또' 삽입해
  // 전 출력면(웹·DOCX·HWPX)에 '㉠㉠__…__' 중복·산개 오염이 재현된다.
  const stimulusLinesAll = stimulusBlocks.flatMap((b) => b.lines);
  const hardcodedMarkerLine = stimulusLinesAll.find((line) => /[㉠-㉭]/.test(line));
  if (hardcodedMarkerLine) {
    add(
      "error",
      "ko-marker-unresolved",
      `초고(자료) 행에 원문자(㉠~㉭)가 직접 적혀 있습니다 — 마커는 markers 배열로만 선언하세요(렌더가 원문자를 중복 삽입합니다): "${hardcodedMarkerLine.slice(0, 40)}"`,
    );
  }

  if (mode === "LOCAL") {
    // ── (3-L) 마커 규율: KOR_CIRCLED 5개 · ㉠~㉤ 순서 · stimulus 표면 ────────
    if (markers.length !== 5) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `LOCAL(마커 고쳐쓰기)은 ㉠~㉤ 마커가 정확히 5개여야 합니다 — 현재 ${markers.length}개`,
      );
    }
    for (const m of markers) {
      if (m.family !== "KOR_CIRCLED") {
        add(
          "error",
          "ko-marker-option-mismatch",
          `마커 ${m.label || "(라벨 없음)"} 패밀리 ${m.family || "(없음)"} — 고쳐쓰기 마커는 ㉠계열(KOR_CIRCLED)만 사용합니다`,
        );
      }
      if (m.targetSurface !== "stimulus") {
        add(
          "error",
          "ko-marker-unresolved",
          `마커 ${m.label || "(라벨 없음)"} 의 targetSurface 가 "stimulus" 가 아닙니다 — 초고(자료) 행에 마킹해야 합니다`,
        );
      }
      if (draftText && m.spanText && !ctx.koText.containsSpanKo(draftText, m.spanText)) {
        add(
          "error",
          "ko-marker-unresolved",
          `마커 ${m.label} 의 spanText 를 초고(DRAFT)에서 찾을 수 없습니다(verbatim 위반): "${m.spanText.slice(0, 40)}"`,
        );
      }
    }
    if (markers.length === 5) {
      const seq = markers.map((m) => m.label).join("");
      if (seq !== LOCAL_MARKER_LABELS.join("")) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `마커 라벨이 ㉠~㉤ 순서가 아닙니다: ${seq || "(없음)"}`,
        );
      }
    }

    // ── (4-L) 발문 골격: ㉠~㉤ 범위 지시 ────────────────────────────────────
    if (
      direction &&
      (!direction.includes(LOCAL_MARKER_LABELS[0]) || !direction.includes(LOCAL_MARKER_LABELS[4]))
    ) {
      add(
        "error",
        "ko-direction-grammar",
        `LOCAL 발문은 "㉠~㉤을 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?" 골격이어야 합니다 — ㉠·㉤ 지시 누락: "${direction.slice(0, 40)}"`,
      );
    }

    // ── (5-L) 선지-마커 1:1 순서 대응 (①↔㉠ … ⑤↔㉤, lockedOptionOrder 와 짝) ─
    if (options.length === 5 && markers.length === 5) {
      options.forEach((o, i) => {
        const expected = LOCAL_MARKER_LABELS[i];
        if (!o.text) return;
        if (!o.text.includes(expected)) {
          add(
            "error",
            "ko-marker-option-mismatch",
            `${o.label} 선지가 대응 마커 ${expected} 를 지시하지 않습니다 — 선지-마커 1:1 순서 대응 위반`,
          );
          return;
        }
        const intruder = LOCAL_MARKER_LABELS.find((l) => l !== expected && o.text.includes(l));
        if (intruder) {
          add(
            "error",
            "ko-marker-option-mismatch",
            `${o.label} 선지에 대응 마커 ${expected} 외의 마커(${intruder})가 섞여 있습니다 — 선지 하나는 마커 하나의 방안만 다룹니다`,
          );
        }
      });
    }
  } else {
    // ── (3-G) GLOBAL 구조: 마커 0 + <보기>(의견) 필수 ───────────────────────
    if (markers.length > 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `GLOBAL(의견 반영 고쳐쓰기)은 마커 없이 출제합니다 — 마커 ${markers.length}개 발견`,
      );
    } else if (LOCAL_MARKER_LABELS.some((l) => direction.includes(l))) {
      add(
        "error",
        "ko-marker-option-mismatch",
        "발문이 ㉠계열 마커를 지시하지만 markers 가 없습니다 — 초고에 마킹되지 않는 지시",
      );
    }
    const bogiLines = readBogiLines(question);
    if (bogiLines.length === 0) {
      add(
        "error",
        "ko-bogi-missing",
        "GLOBAL(의견 반영 고쳐쓰기)은 <보기>(선생님·학생들의 의견)가 필수인데 bogi 가 없습니다",
      );
    }
    if (direction && !direction.includes("반영")) {
      add(
        "error",
        "ko-direction-grammar",
        `GLOBAL 발문은 "…의견을 반영하여 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?" 골격이어야 합니다 — '반영' 지시 누락: "${direction.slice(0, 40)}"`,
      );
    }
  }

  // ── (6) 정답(부적절 방안) 사유 evidence 극성 + 적절 방안의 SUPPORTS ──────
  const correctAnswer = str(question.correctAnswer);
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = str(e.optionLabel);
    const relation = str(e.relation);
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  const trapRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    if (isCorrect && ![...relations].some((r) => trapRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 정답(부적절한 방안)인데 사유 근거의 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다`,
      );
    }
    if (!isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 적절한 방안인데 SUPPORTS 근거가 없습니다 — 결함(또는 의견이 짚은 약점)이 실재하는 초고 구절을 앵커하세요`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------

export const KO_WR_REVISE: KoTypeModule = {
  meta: {
    typeId: "KO_WR_REVISE",
    // 화법·작문·매체 영역 축이 KoArea 유니온에 아직 없다(비소유 계약 파일) —
    // LOCAL(내신 표준형)을 근거로 잠정 NAESIN. 유니온 확장 시 화작 축으로 이관.
    area: "NAESIN",
    label: "고쳐쓰기",
    formatCategory: "객관식",
    // ⚠ 조립 단계 계약 확장 대기: KoTypeMeta.uiGroup 유니온에 "국어 화법·작문·매체" 가
    //    아직 없어(비소유 파일) 이중 단언으로 선언한다 — type-module.ts 소유 클러스터가
    //    유니온을 등록하면 단언을 제거할 것.
    uiGroup: "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"],
    answerFormat: "MC5",
    // 작문 유형: 사용자 지문은 소재 참고일 뿐 — 문항에는 자체 초고(DRAFT)만 동봉.
    includesPassage: false,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "optional", // GLOBAL 모드에서만 필수 — validate 가 모드별로 강제
    usesStimulus: "required",
    stimulusKinds: ["DRAFT"],
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "plain",
    needsSolverGate: false,
    // LOCAL 선지가 ㉠~㉤과 1:1 순서 대응 — 정답 위치 셔플에서 제외.
    lockedOptionOrder: true,
    description:
      "학생 초고의 결함(접속·중복·호응·통일성·어휘)을 ㉠~㉤ 마커 또는 <보기> 의견으로 짚고, 수정 방안 5개 중 부적절한 하나(안 일어난 수정·방향 반전·불필요한 수정)를 판정하는 작문 고쳐쓰기 유형",
    setSlot: "작문 세트 고쳐쓰기 슬롯(43번대) — 최근 강화 추세(2026 6평·수능 연속), 내신 작문 단원 최빈 변형축",
    studentTask:
      "초고의 ㉠~㉤(또는 <보기>의 의견)에 대한 수정 방안 다섯 개를 초고 문면과 대조하여, 적절하지 않은 방안 하나를 고릅니다.",
    bestFor: [
      "작문 단원(고쳐쓰기·통일성과 응집성) 내신 대비",
      "화작 선택자 수능 작문 세트(43~45번대) 실전 훈련",
      "문장 성분 호응·접속 표현 오류 교정 훈련",
    ],
    outputUi: ["학생 초고 박스(㉠~㉤ 마킹 가능)", "〈보기〉 의견 박스(GLOBAL)", "5지선다(수정 방안형)", "방안별 초고 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "reviseMode",
        label: "출제 모드",
        kind: "select",
        options: [
          { value: "LOCAL", label: "마커 고쳐쓰기(㉠~㉤ 수정 방안)" },
          { value: "GLOBAL", label: "의견 반영 고쳐쓰기(초고+조언)" },
        ],
        defaultValue: "LOCAL",
        description:
          "LOCAL=초고 5곳 ㉠~㉤ 마킹 후 지점별 방안 판정(내신 표준형), GLOBAL=선생님·학생 의견의 반영 방안 판정(수능 세트형)",
      },
      {
        key: "draftGenre",
        label: "초고 갈래",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(소재 특성)" },
          { value: "PROPOSAL", label: "건의·제안하는 글" },
          { value: "EXPOSITION", label: "설명·소개하는 글" },
          { value: "ARGUMENT", label: "주장하는 글" },
        ],
        defaultValue: "AUTO",
        description: "자체 생성되는 학생 초고의 갈래 — 사용자 지문은 소재 참고로만 반영됩니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 지문 비동봉(includesPassage=false) — 초고(stimulus)·<보기>는
    // buildDefaultKoRenderModel 이 봉투에서 자동 조립한다.
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "결함은 표면형(명백한 겹말·정면으로 어긋난 접속어) 중심. 정답은 DIRECTION_FLIP — 처방이 반대 방향이라 초고와 한 번만 대조하면 판정된다. GLOBAL 은 의견 2개로 단순하게.",
    INTERMEDIATE:
      "표면 결함(접속·중복)과 구조 결함(성분 호응·통일성)을 섞어라. 정답은 NEEDLESS_FIX 또는 NOT_PERFORMED — 해당 지점의 문면을 앞뒤 문장과 대조해야 부적절함이 드러나게 하라.",
    KILLER:
      "'절반 참' 설계 — 다섯 방안 전부 진단은 그럴듯하게, 정답만 처방(또는 전제)을 한 끗 왜곡하라. NEEDLESS_FIX 는 얼핏 어색해 보이지만 문맥상 정당한 표현에 걸어 전수 검산을 강제하고, GLOBAL 은 의견 3개에 두 의견 결합 반영 선지를 포함하라.",
  },
};
