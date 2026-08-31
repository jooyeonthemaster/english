// ============================================================================
// 학습지 상품 정본 (docs/class-studio-spec.md §3.10.19 E19-1 · 3상품 →
// docs/reading-analysis-worksheet-spec.md §2 「직독직해 분석본」 가입으로 4상품)
//
// 클래스 스튜디오의 생성 단위 = 「학습지 상품」. 기존 3종(basic/practice/final)의
// 라벨·부제 문자열은 학습지 생성 페이지
// (passage-registration/passage-input/passage-input-stack.tsx:454-477)
// 정본을 **자구 그대로** 복제한다 — 두 표면이 갈리면 같은 상품이 다른 물건으로
// 보인다. ⚠ 4번째 reading 만 예외: 지문 등록 페이지는 1차 범위 제외(스펙 §5.3 F-9,
// 스튜디오 모달 전용 상품)라 그 파일에 대응 카드가 없다 — reading 의 자구 정본은
// 스펙 §5.2 A-2 다. 단가는 임의 숫자 금지: getPassageAnalysisCreditCost 조합으로만 만든다.
//
// 순수 TS(React 무의존) — 서버 액션·클라이언트 양쪽에서 import 가능.
// ============================================================================

import {
  getPassageAnalysisCreditCost,
  PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST,
} from "@/lib/passage-analysis-credit-costs";

export type StudioSheetVariant = "basic" | "practice" | "final" | "reading";

export interface StudioSheetProduct {
  id: StudioSheetVariant;
  label: string;
  /** 카드 부제 — 무엇이 들어 있는지(자구 정본) */
  subtitle: string;
  /**
   * 지문당 단가(크레딧) — 상수 조합 산출값.
   *
   * [E30 §3-4] **의미 재정의: 「기본 학습지 미보유 시 단가」 = 상한.**
   * 값은 무개변(basic 5 / practice 10 / final 5)이고 산식도 그대로다. 바뀐 것은
   * practice 의 **읽는 법**뿐이다 — 실전은 기본 이력이 있으면 ◈5(자식 문서만),
   * 없으면 ◈10(기본+실전 동시)이라 지문마다 단가가 갈린다.
   *
   * 왜 상한을 여기에 남기는가: 아직 `unitCostWithBasic` 을 모르는 소비처가 남아 있어도
   * **과소 견적이 절대 나오지 않는다**(workbook-generate-modal.tsx 의
   * 「basicCached=false 취급 = 전액 표기 — 견적이 실청구보다 낮으면 안 된다」와 같은 방향).
   * 지문별 실단가는 `getStudioSheetStates` 의 `practiceUnitCost`(= 서버 판정)가 정본이다.
   */
  unitCost: number;
  /**
   * [E30 §3-4 · additive] 같은 지문에 **기본 학습지가 이미 있을 때**의 지문당 단가.
   *
   * practice 만 `unitCost` 와 값이 다르다(◈5 vs ◈10). basic·final 은 「기본 보유가
   * 단가를 바꾸지 않는」 상품이라 `unitCost` 와 **같은 값**을 채워 3상품 모양을 유지한다
   * — optional 로 두면 소비처가 `?? unitCost` 폴백을 각자 복제하게 되고 그 복제본이
   * 조용히 갈린다. 필수 필드가 정답이다.
   */
  unitCostWithBasic: number;
  /** 국어(PRIME_KO) 지문에 쓸 수 있는가 — fast 라우트가 400 으로 막는 축 */
  koreanSupported: boolean;
}

/** 표시 순서 정본 — basic → practice → final → reading(가격 오름차순이 아니라 학습 흐름 순).
 *  ⚠ 카드 표시 순서와 「같은 지문 안 문서 인쇄 랭크」(pick-order.SHEET_PLAN_RANK —
 *  reading 은 final **앞**)는 서로 다른 축이다 — 여기 순서를 랭크 근거로 읽지 마라. */
export const STUDIO_SHEET_PRODUCTS: readonly StudioSheetProduct[] = [
  {
    id: "basic",
    label: "기본 학습지",
    subtitle:
      "원문 필기 캔버스 · 요약 · 어법 · 출제 포인트 · 어휘 · 구문 분석",
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // 기본 학습지 자신은 「기본 보유」로 단가가 깎이지 않는다(캐시 단락은 별개 축 —
    // 지문별 basicCached 로 모달이 ◈0 을 표기한다). 그래서 상한과 같은 값이다.
    unitCostWithBasic: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // 국어 지문은 PRIME_KO 경로로 흘러 기본 학습지가 정상 생성된다.
    koreanSupported: true,
  },
  {
    id: "practice",
    label: "실전 학습지 포함",
    subtitle:
      "기본 구성 + 어법 선택 워크북 · 어휘 빈칸 · 배열 영작 + 수능형 추론 5문항",
    // [E30 §3-4] 기본 미보유 시 단가(상한) = BASE + EXTRA = ◈10. **값 무개변.**
    // 이 값으로 청구되는 것은 (b) 경로(기본+실전 동시, fast 라우트)뿐이다.
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: true }),
    // [E30 §3-4] 기본 이력이 있으면 자식 문서만 만든다((c) worksheet 라우트) = EXTRA 만 ◈5.
    // ⚠ 리터럴 5 를 쓰지 마라 — 청구측(getPracticeSheetCreditCost)과 **같은 상수**를
    //   읽어야 표기와 청구가 갈리지 않는다(E19-2).
    unitCostWithBasic: PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST,
    // KO 게이트는 자기완결 블록이라 실전 학습지(영어 전용 파이프라인)로 흐르지
    // 않는다 — 국어 지문을 practice 로 발사하면 값만 내고 기본만 나온다.
    koreanSupported: false,
  },
  {
    id: "final",
    label: "파이널 원페이지",
    subtitle:
      "시험 직전 족집게 · 손필기 원문 분석 · 유형별 출제 포인트·함정 · A4 딱 1장",
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // 파이널은 부모 PRIME 유무와 무관하게 자기완결 블록이 만든다(DB 실측: 고아 파이널
    // 3행 존재). 기본 보유가 단가를 바꾸지 않으므로 상한과 같은 값이다.
    unitCostWithBasic: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // fast/route.ts:324-329 — 국어 지문 + finalOnepage = 400.
    koreanSupported: false,
  },
  {
    id: "reading",
    label: "직독직해 분석본",
    // ⚠ 이 상품만 자구 정본이 passage-input-stack 이 아니다(파일 머리주석) —
    //   docs/reading-analysis-worksheet-spec.md §5.2 A-2 자구 그대로.
    subtitle:
      "전 문장 슬래시 끊어읽기 · 1:1 직독직해 · 완전해석 · 색상 문법 판서 · 교과서/부교재 정밀 분석",
    // 직독직해는 파이널과 같은 자기완결 블록(fast 라우트)이 만든다 — 부모 PRIME 유무와
    // 무관하게 지문당 ◈5. 기본 보유가 단가를 바꾸지 않으므로 상한과 같은 값이다.
    // ⚠ 리터럴 5 금지 — 청구측과 같은 상수 조합만 읽어야 표기·청구가 안 갈린다(E19-2).
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    unitCostWithBasic: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // 영어 전용 파이프라인(EN→KO 직독직해가 상품의 본질) — fast 라우트가
    // PRIME_KO 지문 + readingAnalysis 조합을 400 으로 막는다(스펙 §5.2 C-8).
    koreanSupported: false,
  },
] as const;

export const STUDIO_SHEET_PRODUCT_BY_ID: ReadonlyMap<
  StudioSheetVariant,
  StudioSheetProduct
> = new Map(STUDIO_SHEET_PRODUCTS.map((p) => [p.id, p]));

export function isStudioSheetVariant(v: unknown): v is StudioSheetVariant {
  return v === "basic" || v === "practice" || v === "final" || v === "reading";
}

export function sheetProductLabel(v: StudioSheetVariant): string {
  return STUDIO_SHEET_PRODUCT_BY_ID.get(v)?.label ?? "학습지";
}

/**
 * 발사 요청에 실을 promptConfig 파편(§3.10.19 E19-4).
 * ⚠ `targetSections` 는 **절대** 넣지 않는다 — fast 라우트가 finalOnepage/
 * includeWorksheet 와의 조합을 400 으로 막는다(route.ts:284-303).
 * `readingAnalysis` 도 같은 배타 축이다 — includeWorksheet·finalOnepage·targetSections
 * 와의 조합은 fast 라우트가 400(스펙 §5.2 C-8). 세 플래그가 상호 배타인 것은
 * 이 함수가 variant 당 정확히 1키만 돌려주는 것으로 보장된다.
 * 부재 키는 스프레드가 비어 기존 정액 경로와 요청 바이트가 같다(§11 무회귀 —
 * reading 플래그 역시 true 일 때만 키가 존재한다).
 */
export function sheetPromptFlags(v: StudioSheetVariant): {
  includeWorksheet?: boolean;
  finalOnepage?: boolean;
  readingAnalysis?: boolean;
} {
  if (v === "practice") return { includeWorksheet: true };
  if (v === "final") return { finalOnepage: true };
  if (v === "reading") return { readingAnalysis: true };
  return {};
}

/**
 * planMarker → 종류 배지 라벨(§3.10.16-d 환산 정본). 미지 마커는 원문 폴백.
 *
 * [E30 §4-1] `PRIME_PRACTICE` 추가로 **4키**, [reading] `PRIME_READING` 추가로 **5키**.
 * 이 Map 하나를 읽는 표면이 8곳
 * (composer-list-pane 3 · passage-dossier-pane · sheets-action-rail ·
 *  dossier-pick-bar · sheet-compose-surface 2)이라 여기 1줄로 전 표면이 동시에 고쳐진다.
 * 복제본을 만들면 「어떤 화면에서는 실전 학습지, 어떤 화면에서는 PRIME_PRACTICE」가 된다.
 *
 * ⚠ 「실전 학습지」 자구 제약 3항(어기면 프로브가 조용히 오탐한다 — E30 §1-1):
 *  1. 첫 어절이 기존 3키와 달라야 한다 — 조판 칩은 `planLabel.split(" ")[0]` 만 쓴다
 *     (sheet-compose-surface.tsx:2102). 「실전」 vs 기본/국어/파이널. ✅
 *  2. 「기본 학습지」를 **부분문자열로 포함하지 않는다** —
 *     .tmp-studio-qa/behavior-exam-studio.mjs 의 `/기본 학습지|국어 워크북|파이널 원페이지/`
 *     계열 필터와 교차매치를 막는다. ✅
 *  3. 상품 라벨 「실전 학습지 포함」(위 STUDIO_SHEET_PRODUCTS)과 **다른 문자열**이어야 한다 —
 *     .tmp-studio-qa/_probe-noregression.mjs 가 그 문자열을 `exact:true` 로 요구한다.
 *     상품 라벨은 개명하지 않는다(E19-1 「상품 라벨 자구는 불변」). ✅
 *  · 5키째 「직독직해 학습지」 검증: 첫 어절 「직독직해」 유일 ✅ / 「기본 학습지」 비포함 ✅ /
 *    상품 라벨 「직독직해 분석본」과 상이 ✅.
 */
export const SHEET_PLAN_LABEL: ReadonlyMap<string, string> = new Map([
  ["PRIME", "기본 학습지"],
  ["PRIME_KO", "국어 워크북"],
  ["PRIME_FINAL", "파이널 원페이지"],
  ["PRIME_PRACTICE", "실전 학습지"],
  ["PRIME_READING", "직독직해 학습지"],
]);

/**
 * PassageReport.status → 상태 배지(§3.10.19 E19-5 정본).
 * 도시에 「학습지」 행(passage-dossier-pane.tsx)과 「학습지 조판」 뷰 병합 목록
 * (composer-list-pane.tsx)이 **같은 상수**를 읽는다 —
 * 값 복제본이 두 표면에 살면 같은 문서가 서로 다른 배지를 달게 된다
 * (적대 검수 minor 실적: 초판이 복제본을 신설했다). DB 컬럼은 String 이라
 * 미지값은 표시부가 원문으로 폴백한다.
 */
export const SHEET_STATUS_BADGE: ReadonlyMap<
  string,
  { label: string; cls: string }
> = new Map([
  ["DRAFT", { label: "초안", cls: "border-slate-200 bg-slate-50 text-slate-500" }],
  [
    "PUBLISHED",
    { label: "발행됨", cls: "border-emerald-200 bg-emerald-50 text-emerald-600" },
  ],
  [
    "ARCHIVED",
    { label: "보관됨", cls: "border-slate-200 bg-slate-100 text-slate-400" },
  ],
]);
