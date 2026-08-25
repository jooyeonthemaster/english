// ============================================================================
// 학습지 행 「모바일 배포」 가용 판정 정본 (docs/class-studio-spec.md §3.10.21 E21-5·E21-6-1)
//
// 왜 별도 파일인가 — 같은 술어를 도시에 Sec「학습지」행·도시에 픽 바·「학습지 조판」 뷰
// 병합 목록 행(composer-list-pane.tsx)·학습지 실행대 **4표면**이 쓴다. 두 벌로 복제하면
// 한쪽만 고쳐져 「어떤 화면에서는 눌리고 어떤 화면에서는 안 눌리는」 상태가 난다.
// 스펙이 "정본 = src/lib/studio/sheet-deploy-eligibility.ts 1곳"이라고 못 박은 자리.
//
// 왜 PRIME 만 배포 가능한가 (전부 코드 실측):
//  1. actions/studio/deploy.ts:219-230 `StudioDeployInput` 에 **reportId 입력이 없다**
//     — 배포는 { classId, passageId, modules, ... } 만 받는다.
//  2. 같은 파일 42-53 `loadPrimeReport` 가 `generationPlan: PRIME_REPORT_MARKER`
//     (**단수 마커**, PRIME_REPORT_MARKERS 집합이 아니다)로 passageId 스코프에서 행을
//     **다시 찾는다**. 즉 사용자가 어떤 행을 눌렀든 서버는 그 지문의 PRIME 행만 본다.
//  3. app/api/workbench/passage-reports/prime/[passageId]/save-as/route.ts:142·188·273-283
//     — 사본 저장은 `tx.passage.create`(새 지문) + `tx.passageReport.create`(같은 마커)로
//     **새 passage + 새 report** 쌍을 만든다. 그래서 PRIME_KO/PRIME_FINAL 행의
//     passageId 아래에는 PRIME 행이 **아예 존재하지 않는다**.
//  → 배포 버튼을 열어 두면 deploy.ts:83·142·273 의 `!report` 가로채기에 걸려
//    「먼저 AI 분석을 완료해 주세요.」로 끝난다. 방금 학습지를 만든 사용자에게
//    "분석하라"고 말하는 정면 모순 — 오해를 부르는 실패라 **행에서 미리 잠근다**.
//  (StudioDeployInput 에 reportId 를 더하는 확장은 배포 경로 전체 회귀를 부르므로
//   v1 범위 밖 — 스펙 E21-6-1 감독 결정.)
//
// 순수 TS(React·prisma 무의존) — 클라이언트 행 컴포넌트에서 직접 import 한다.
// ============================================================================

// passage-constants.ts 는 "use server" 가 **아니다**(그 파일 1-3행이 그 사실을 명시:
// "Plain (non-'use server') shared constants ... shared across action modules").
// 의존성 0 · 리터럴만 있는 상수 모듈이라 클라이언트 번들에 서버 코드를 끌고 오지
// 않는다 → 리터럴 복제 대신 정본을 직접 import 한다.
import { PRIME_REPORT_MARKER } from "@/actions/workbench/passage-constants";

/**
 * 배포 불가 사유 자구.
 *
 * 도시에 「학습지 보내기」 CTA 의 기존 게이트 자구와 **같은 계열**이다
 * (스펙 E21-5). 정본 인용 — passage-dossier-pane.tsx:761:
 *   "파이널 원페이지·국어 워크북은 인쇄용 학습지라 모바일 배포 대상이 아닙니다
 *    — 기본 학습지를 만들면 보낼 수 있습니다"
 * 정책·인과·해법 안내가 동일하므로 충돌하지 않는다. 두 군데의 명사 표기가 다르고
 * 그 차이는 의도적이다:
 *  - 거기는 카드 CTA 라 대상이 "학습지"인지 밝혀야 해서 "인쇄용 **학습지**"라고 쓴다.
 *    여기는 학습지 **행** 위의 툴팁이라 대상이 이미 자명해 "인쇄용이라"로 줄인다.
 *  - "국어 워크북" → "국어 학습지": 상품 자구 정본(lib/studio/sheet-products.ts)의
 *    상품명은 기본 학습지·실전 학습지 포함·파이널 원페이지이고 "워크북"은 실전 학습지의
 *    구성요소 이름이다. 행 배지가 「국어」+「학습지」로 읽히는 자리에서 낯선 명사를
 *    쓰지 않는다.
 *
 * ── [E30 §5 P8] 실전 학습지(PRIME_PRACTICE) 등장에 따른 **자구 확장 1건** ──────────
 * **바뀐 것:** 열거에 "실전 학습지"가 들어갔다. 그뿐이다.
 * **안 바뀐 것:** 아래 `canDeployWorksheetRow` 의 **로직은 한 글자도 손대지 않았다** —
 *   `PRIME` 만 ok:true, 나머지 전부(미지 마커 포함) fail-closed 다. 그 판정은 실전 행에
 *   대해서도 **그대로 옳다**: 위 근거 2번의 단수 마커 조회(deploy.ts `loadPrimeReport`)를
 *   통과하는 것은 여전히 PRIME 하나뿐이고, PRIME_REPORT_MARKERS **집합**에 실전이
 *   가입해도(E30 §1-5) 배포 축은 단수 마커라 열리지 않기 때문이다.
 *
 * 그런데 로직이 옳아도 **안내 문구가 거짓말이 된다**: 확장 전 자구는
 * 「파이널 원페이지·국어 학습지는 …」라 실전 행에 붙으면 사용자가 자기 행이 왜 잠겼는지
 * 알 수 없다(열거에 자기가 없다). 실전은 부모 PRIME 을 반드시 갖고 있으므로
 * 해법 문장("기본 학습지를 만들면 보낼 수 있습니다")도 이미 만족된 것처럼 읽힌다 —
 * 그래서 사유는 「인쇄용이라」 쪽이고, 열거에 실전을 넣어야 그 인과가 성립한다.
 *
 * ⚠ 이 상수는 **1문자열이 4표면에 동시 적용**된다(composer-list-pane 2곳 ·
 *   dossier-pick-bar · passage-dossier-pane). 여기서 고치면 4곳이 함께 고쳐진다 —
 *   표면에 리터럴을 복제하지 마라.
 * ⚠ 도시에 카드 CTA(passage-dossier-pane.tsx:761)의 **자매 자구**는 이 파일 소유가
 *   아니다. 거기도 같은 열거 확장이 필요하다(E30 §5 P8, 별도 유닛).
 */
const BLOCKED_REASON =
  "파이널 원페이지·실전 학습지·국어 학습지는 인쇄용이라 모바일 배포 대상이 아닙니다 — 기본 학습지를 만들면 보낼 수 있습니다";

/** 판정 결과 — `ok:false` 일 때만 사유가 있다(툴팁/aria 자구로 그대로 쓴다). */
export type WorksheetDeployEligibility =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 학습지 행의 「모바일 배포」 액션을 열어도 되는가.
 *
 * @param planMarker `PassageReport.generationPlan` 원문(PRIME | PRIME_KO | PRIME_FINAL |
 *   PRIME_PRACTICE, 미지 마커도 그대로 들어온다). 미지 마커는 **막는 쪽**이 안전하다 —
 *   위 근거 2번의 단수 마커 조회를 통과하는 것은 PRIME 하나뿐이므로, 모르는 마커를
 *   열어 주면 똑같이 「먼저 AI 분석을 완료해 주세요」로 끝난다.
 *
 * ⚠ [E30 §5 P8] 실전(PRIME_PRACTICE)도 여기서 잠긴다. 실전은 부모 PRIME 이 **반드시**
 *   있으므로 근거 3번(같은 passageId 아래 PRIME 이 아예 없다)은 실전에 해당하지 않지만,
 *   그래도 열지 않는다: 배포 입력에 reportId 가 없어(근거 1번) 서버는 그 지문의 PRIME
 *   행만 보낸다 — 실전 행 배포 버튼을 열면 **누른 것과 다른 문서가 배포된다**.
 *   그건 잠긴 것보다 나쁘다. 실전 분리 문서는 인쇄 전용이다(E30 §0-3 비목표 · §1-5).
 */
export function canDeployWorksheetRow(
  planMarker: string,
): WorksheetDeployEligibility {
  if (planMarker === PRIME_REPORT_MARKER) return { ok: true };
  return { ok: false, reason: BLOCKED_REASON };
}
