// ============================================================================
// 조판대(Composing Desk) 스타일 토큰 — 이 디렉터리의 **단일 스타일 진실원**.
//
// 왜 이 파일이 있나:
//   이 기능은 폰트 10종 118회(그중 60회가 0.5px 스텝), 간격 48%가 그리드 밖,
//   버튼 높이 7종, 라운드 6종, 배경 알파 표기 11종으로 무너져 있었다. 원인은
//   취향이 아니라 물리적 사실이다 — 상자를 겹겹이 쌓으면서 각 상자가 자기
//   패딩·자기 크기를 새로 정했다. 값을 한 파일에 못 박고, 원시 리터럴을 CI 로
//   막지 않으면 규칙이 아니라 권고가 되고 6개월 뒤 원상복귀한다.
//   (전례: globals.css 의 SMOAT/yshin 토큰은 이 기능에서 사용 0건이다.)
//
// globals.css @theme 과의 관계:
//   같은 수치가 globals.css 의 `@theme` 에 `--text-desk-*` / `--color-desk-*` 로
//   등록돼 있다(CSS·비-Tailwind 문맥용 정본 등기부). 이 파일은 그 등기부를
//   className 문자열로 1:1 미러링한 **React 소비 계층**이다. 값을 고칠 때는
//   반드시 양쪽을 같이 고친다.
//   ※ 왜 `text-desk-read` 유틸리티를 그대로 쓰지 않고 원시 리터럴을 두는가:
//     `text-desk-*` 는 font-size 와 함께 font-weight 까지 한 규칙에 싣기 때문에,
//     `DESK.num` 처럼 굵기만 700으로 올려 조합할 때 유틸리티 정렬 순서에
//     의존하게 된다(조용히 무시될 수 있는 종류의 의존이다). 이 파일 안에서만
//     리터럴을 쓰고 바깥은 전부 이 상수를 import 하는 편이 검증 가능하다 —
//     scripts/check-authoring-tokens.mjs 게이트 1이 정확히 그것을 강제한다.
//
// 회귀 방지 계약
//  · 타이포는 **5종이 전부**다. 9 / 9.5 / 10 / 10.5 / 11.5 / 12.5px 를 다시
//    들이지 않는다. 위계를 크기로 낮추지 말고 색(slate-700 → slate-500)으로
//    낮춘다. 그래야 "목표보다 조금 짧아요" 같은 조치 요구문이 10.5px 로
//    떨어지는 자리가 구조적으로 사라진다.
//    (구 계약 material-chip.tsx:226 "11.5/12/12.5/13px 네 종"의 *의도* —
//     '제목이 본문보다 커야 한다' — 는 title 14 > body 13 으로 그대로 만족한다.)
//  · 굵기는 500 / 600 / 700 3단. `font-extrabold` 는 만들지 않는다 — 12~14px
//    한글에서 자간이 뭉개져 위계가 오히려 약해진다.
//  · 버튼 높이는 **3종이다**: h-9(md·주보조 공용) · h-7(sm·인라인 트리거·아이콘) ·
//    min-h-12(hero). hero 는 크기 variant 가 아니라 "이 표면의 유일한 주 CTA"
//    라는 **역할 표식**이라 한 표면에 **하나만** 존재한다(둘째를 만들고 싶어지면
//    그건 hero 가 아니라 md 다). h-8 / h-10 / h-11 을 추가하지 않는다 — h-10 은
//    자료 '행'이지 버튼이 아니다.
//    (근거 전문은 authoring-primitives.tsx:36-47 회귀 방지 계약에 있다. 두 파일이
//     서로를 부정하지 않도록 **사실은 여기, 논증은 저기** 한 벌로 유지한다.)
//  · 배경 알파 표기(bg-*-50/40 류)를 만들지 않는다. 흰 배경 합성 시 #f9fbff
//    (ΔL 0.01)로 채움 기여가 0이라 선택 신호가 1px 테두리에만 걸린다.
//  · **선택(SEG_ON)과 열림(ROW_OPEN)은 다른 신호다.** 선택은 채움, 열림은
//    테두리+ring. 둘을 한 상수로 합치지 않는다.
//  · amber / orange / violet 금지(page-frame.tsx:9, v3 §D1 R5). 안내는
//    slate-600 + Info, 조치 필요는 rose-600 + AlertTriangle 이다.
//  · Sparkles(별 반짝이) 아이콘 금지 — 오너 지시. 이 기능의 대표 아이콘은
//    PenLine 이다. (eslint.config.mjs 가 이 디렉터리에서 import 를 막는다.)
// ============================================================================

/**
 * 타이포 5종. 각 값은 globals.css `@theme` 의 `--text-desk-*` 와 같은 수치다.
 *
 *  read   15/500 lh1.75      — 발주 textarea(입력·placeholder), 결과 지문 본문, 판독 본문
 *  title  14/700 -0.01em     — 마스트헤드·모달·결과 밴드·결과 카드 제목
 *  body   13/600             — 설정 라벨·값, 파일명, 모든 버튼 라벨, 드롭다운 항목, 링크
 *  meta   12/500             — 부연·힌트·역할 라벨·글자수·지표 라벨·경고 본문
 *  kicker 11/700 0.04em      — 섹션 머리표(발주/조판 결과/지문 설정), StatusPill, 뱃지
 *  num    13/700 tabular-nums — 지표 값·글자수처럼 자리수가 흔들리면 안 되는 숫자
 */
export const DESK = {
  read: "text-[15px] font-medium leading-[1.75]",
  title: "text-[14px] font-bold tracking-[-0.01em]",
  body: "text-[13px] font-semibold",
  meta: "text-[12px] font-medium",
  kicker: "text-[11px] font-bold tracking-[0.04em]",
  num: "text-[13px] font-bold tabular-nums",
} as const;

/**
 * 선택됨 = 채움. 구 SEG_ON('border-blue-600 bg-blue-50/40 text-blue-700')은
 * 흰 배경 합성 시 #f9fbff(ΔL 0.01)라 채움 기여가 0이었고, 선택 신호가 1px
 * 테두리 하나에만 걸려 있었다. 이 문자열은 6곳에 손코딩 복제돼 있었다 —
 * 여기 하나만 남긴다.
 */
export const SEG_ON = "border-blue-600 bg-blue-600 text-white";

/** 선택 안 됨. hover 는 테두리·배경·글자 세 축을 함께 올려 눌러도 되는 곳임을 알린다. */
export const SEG_OFF =
  "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900";

/**
 * 열림 = 테두리 + ring. **선택과 의미를 분리한다.**
 * 설정 행의 data-[state=open] 이 SEG_ON 을 쓰면 "지금 고른 값"과 "지금 펼친 줄"이
 * 같은 색으로 보여 무엇이 확정인지 읽히지 않는다.
 */
export const ROW_OPEN = "border-blue-500 bg-white ring-2 ring-blue-100";

/** 포커스 링 단일값(하우스 최다값). ring-blue-500 / ring-ring/50 은 쓰지 않는다. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";

/** 자료 행 높이 40px. 버튼이 아니라 '행'이다 — 행 전체가 히트박스다. */
export const ROW_H = "h-10";

/** 모든 버튼(주·보조 공용) 36px. */
export const BTN_MD = "h-9";

/** 인라인 트리거(역할 드롭다운)·아이콘 버튼 28px. 터치 하한을 넘긴다. */
export const BTN_SM = "h-7";

/**
 * 주 CTA 48px. **고정 h-12 가 아니라 min-h-12 다** — 라벨이 접혀도 상자를 뚫지
 * 않고 자란다.
 * 최소 폭(호스트 좌측 패널 하한 380px → 밴드 348px → 버튼 내폭 316px)에서 현행
 * 최장 라벨은 계산상 한 줄에 들어간다(예산 245px vs 라벨 ≈226px — 산식은 라벨의
 * 소유자인 passage-authoring-glossary.AUTHORING_COPY.CTA 주석에 있다). 하지만
 * 그 여유는 19px 뿐이고, 라벨·자릿수·폰트 폴백 중 무엇 하나만 움직여도 넘친다.
 * 고정 h-12 였다면 넘치는 순간 글자가 48px 상자를 **뚫고 나간다**. 상자를 뚫은
 * 화면은 되돌릴 방법이 없지만, 4px 자란 버튼은 아무도 다치지 않는다.
 * (같은 이유로 md CTA 도 호출부에서 min-h-9 로 쓰였다 — 그 손코딩은
 *  authoring-primitives.tsx 의 AuthoringButton 이 흡수했다.)
 */
export const BTN_HERO = "min-h-12";

/** 커버리지 칩 전용 24px. py-px(실높이 14px) 손코딩을 대체한다. */
export const CHIP_H = "h-6";

/**
 * 표면 5종. 내부 블록의 가라앉은 배경은 sunken(slate-50) **하나뿐**이다.
 * 표면을 늘리면 카드 안 카드가 다시 생긴다.
 */
export const SURFACE = {
  card: "bg-white",
  sunken: "bg-slate-50",
  info: "bg-blue-50",
  success: "bg-emerald-50",
  danger: "bg-rose-50",
} as const;

/** 구조선(전폭)과 행 구분선(hairline). 선은 간격 그리드의 대상이 아니다. */
export const RULE = "border-slate-200";
export const HAIRLINE = "border-slate-100";

export type DeskTypeToken = keyof typeof DESK;
export type SurfaceToken = keyof typeof SURFACE;
