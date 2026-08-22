/**
 * E22 조판실 — **문항** 조판 id 순수 문자열 계층 (docs/class-studio-spec.md §3.10.22 E22-1).
 *
 * 조판실은 「학습지 문서 N개 + 시험지 문항 M개」를 **1 par-root · 1 페이지네이션**으로 합성해
 * A4 한 묶음으로 인쇄한다. 학습지끼리의 id 충돌은 `compose-ids.ts`(접미 `__{docKey}`)가 이미
 * 해결했고, 이 파일은 거기에 **문항 축**을 얹는다.
 *
 * 문항은 학습지와 성격이 근본적으로 다르다 — **저장 레코드가 아니다**. 리포트 스키마가
 * 문항을 담을 수 없음이 코드로 확정됐다(전부 26-08-18 실측):
 *   · `schema.ts:660`     activity 의 `questions.max(8)`  — 8문항 초과 저장 불가
 *   · `schema.ts:331-341` `no` max 12 · choices min2/max6 · explanation 필수
 *   · `schema.ts:799-812` activityKind 는 닫힌 enum 12종 — 시험지 유형이 들어갈 칸이 없다
 *   · `schema.ts:815-826` activityItem 에 **선지 필드 자체가 없다**
 * 그래서 문항은 in-memory `FlowItem[]`(읽기 전용)으로만 존재하고, 이 파일이 만드는 id 는
 * **저장 경로에 단 한 번도 커밋되지 않는 것**이 계약이다(관문은 U5 `rejectComposedId`).
 *
 * 계약은 `compose-ids.ts` 와 동일하다 — **런타임 의존 0 · JSX 0 · 부수효과 0 · import 0**.
 * 렌더 중 호출해도 안전하고(순수 문자열 결합), StrictMode 이중 렌더에서 결과가 동일하다.
 * ⚠ 절대 `Date.now()`/`crypto.randomUUID()`/카운터를 섞지 마라 — `paper-item-utils.tsx:97-99`
 * 의 `makeLocalId` 가 정확히 그 함정(`Date.now()+random`)이고, 그 값을 FlowItem id 로 쓰면
 * 매 렌더 id 가 바뀌어 `report-pages/pages.tsx:80 itemsById` / `:121 heightById` 가 전부 미스,
 * 증상은 오직 「조용한 페이지 넘침」으로만 드러난다(E22-2 2번).
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * ■ 접두 `qb-` 가 안전한 근거 — 5대 판정 전수 회피 (26-08-18 실제 파일을 열어 줄번호 재확인)
 * ────────────────────────────────────────────────────────────────────────────────
 * `compose-ids.ts:14-37` 이 「접두는 영구 금지, 접미만」이라고 못박은 이유는 이 리포의 id
 * 판정이 전부 **앞자리 앵커**라 기존 문법(`s0-head` 등)에 접두를 덧붙이면 그 문법이 깨지기
 * 때문이다. 문항 id 는 사정이 반대다 — **원본 문법 자체가 없는 신규 id 공간**이라,
 * 앞자리 앵커에 「걸리지 않는 것」이 곧 정답 동작이 된다. 아래 5건이 전부 그렇다.
 *
 *  1. `editor-mutations.ts:49`  `shiftBlockIdAfterDelete` — `/^s(\d+)-(.+)$/`
 *     `qb-…` 는 불일치 → `return id`(그대로 통과). 문항은 섹션 인덱스 시프트 대상이 아니므로
 *     통과가 정본 동작이다(문항에는 대응하는 `report.sections[si]` 가 애초에 없다).
 *  2. `editor-mutations.ts:261` `deleteItem` — 같은 `/^s(\d+)-(.+)$/`
 *     불일치 → `:262 setBlockMeta(report, id, { hidden: true })` 로 떨어진다. 즉 **이 한 건만은
 *     회피가 무해하지 않다** — 활성 학습지 report 의 blockMeta 에 `qb-…::p0: {hidden:true}` 라는
 *     외래 키가 써지고 `schema.ts:1020 z.record(z.string(), …)` 가 키를 제한하지 않아 그대로
 *     저장된다(compose-ids.ts:96-102 이 기록한 것과 완전히 같은 사고 경로). 그래서 문항 조각은
 *     ① `showGrip:false`·`resizable:false` 로 어포던스를 없애고(U3) ② **U5 의 `rejectComposedId`
 *     관문이 `isComposedQuestionId` 를 2차 방어로 반드시 켜야 한다**. 어포던스 제거만으로는
 *     Delete 키 경로(`AnalysisReportEditor.tsx` keydown → activeId 직행)가 남는다.
 *  3. `report-pages/items.ts:13` · `editor-mutations.ts:242,252` — `id.startsWith("c-")`
 *     커스텀 블록 판정 3곳(`isActivityAnswerId` / `logicalBlockId` / `deleteItem`).
 *     `qb-` 는 `c-` 로 시작하지 않으므로 전부 회피 = 문항이 커스텀 블록으로 오인되어
 *     `deleteCustomBlock`(`:252`)로 빨려 들어가지 않는다. `editor-mutations.ts:251` 의
 *     `id === "cover"` 도 마찬가지로 불일치.
 *  4. `report-pages/items.ts:12-14` `isActivityAnswerId` — `endsWith("-ans")` (**유일한 접미 판정**)
 *     이 파일이 만드는 **모든** id 는 `questionPartId` 를 거쳐 `::p{n}` 로 끝나므로
 *     `-ans` 로 끝날 수 없다(정답표의 `qb-answers::p0` 포함). 그래서 문항 조각은
 *     `items.ts:61-62,84-88` 의 「정답 페이지는 blockOrder 무관·항상 문서 맨 끝」 특례를
 *     타지 않고 `visibleFlowItems` 본문 흐름에 그대로 남는다 — 합본 순서 보존의 전제다.
 *     ⚠ **`qb-…-ans` 형태의 id 를 절대 만들지 마라.** 만드는 순간 위 특례가 켜지면서
 *       문항 정답표가 활성 학습지의 활동 정답 페이지 뒤로 튕겨 나간다.
 *  5. `report-pages/items.ts:101-102` `isAutoFitItem = /^s\d+-annotated-snt\d+/`
 *     불일치 → `autoFit:false` 가 정본 동작이다. 이 판정은 `packFlow` **내부**
 *     (`items.ts:206` `const autoFit = isAutoFitItem(it)`)에서 도는 것이라 문항 아이템도
 *     반드시 이 줄을 통과한다. autoFit 면제는 필기분석 문장 전용 특례(`items.ts:215` 가
 *     저장된 stale `breakBefore` 를 무시)이고, 문항은 U3 가 첫 조각에만 의도적으로
 *     `breakBefore:true` 를 주므로 그 면제가 **걸리면 안 된다**.
 *
 * ■ 6번째 판정 — `compose-ids.ts:214-216` `isComposedNsId = id.includes("__")`
 *     이 파일의 id 문법에는 **이중 언더스코어 `__` 가 한 글자도 등장하지 않는다**.
 *     학습지 축의 접미 네임스페이스(`${id}__${docKey}`)와 문항 축(`qb-` 접두)을 완전히
 *     분리해 두 판정이 서로를 오탐하지 않게 하기 위함이다. 원천 id(questionId/setId)는
 *     DB cuid 라 `__` 를 포함하지 않지만, 그래도 개발 모드에서 `isSafeQuestionKey` 로
 *     한 번 더 확인할 수 있게 판정을 노출한다(강제하지는 않는다 — 여기는 순수층).
 *
 * ■ 구분자 `::` 를 쓰는 이유
 *     기존 커스텀 블록 조각(`c-{uuid}::0`)과 같은 어휘라 새 문법을 발명하지 않는다. 다만
 *     `logicalBlockId`(`editor-mutations.ts:242`)의 `split("::")` 는 `c-` 로 시작할 때만
 *     도는 분기라 `qb-…::p{n}` 은 그 절단을 타지 않는다 — 조각→논리블록 접기는 U3 가
 *     `orderId`/`editId` 를 명시로 주어 `orderIdOf`/`editIdOf`(`items.ts:16-22`)가 처리한다.
 *     `::` 는 `AnalysisReportEditor.tsx:949-953` scrollToBlock 의
 *     `[data-paper-item-id="${id}"]`(`:953` — `CSS.escape` 없는 문자열 결합) 안에서도 안전하다.
 *     compose-ids.ts:39-43 이 경고한 위험 문자는 따옴표·백슬래시·공백뿐이고 `:` 는 속성값
 *     따옴표 안에서 아무 의미가 없다(참고: 같은 파일 `:538` 은 `CSS.escape` 를 쓴다 —
 *     즉 두 경로가 비대칭이라 안전한 문자셋을 지키는 쪽이 정본이다).
 */

/** 문항 조판 id 접두. 5대 판정 전수 회피 근거는 파일 상단 주석. */
export const QUESTION_ID_PREFIX = "qb-";

/** id 조각 구분자. 커스텀 블록 조각(`c-…::0`)과 같은 어휘를 재사용한다. */
const PART_SEP = "::";

/**
 * 문항 묶음의 `sectionIndex` 기저값. 실제 값은 `QUESTION_SECTION_BASE + viewIndex`(문항마다 다름).
 *
 * 왜 sectionIndex 를 문항마다 다르게 주는가: `runs.tsx:31-38` 의 런 병합 조건이
 * `(wrap, sectionIndex)` **쌍 비교**이고(`:33-34`), `packFlow` 의 런 경계 판정
 * (`items.ts:285 newSection` · `:287 newRun`)도 같은 축을 본다. 문항 전체가 한 값을 공유하면
 * 인접 문항이 **한 박스로 병합**되어 문항 경계가 사라지고 페이지 예산까지 어긋난다.
 * (`ws-list` 는 `runs.tsx:37` 의 orderId 조건이 2차로 막아 주지만, `packFlow` 쪽 `newRun` 은
 *  `wsl && groupStart` 로 별도 판정이라 sectionIndex 를 갈라 두는 편이 두 경로 모두 안전하다.)
 *
 * 왜 900_000 인가: 부착 학습지는 `compose-flow.ts:86 SECTION_INDEX_STRIDE = 1000` 로
 * `(docIndex + 1) * 1000 + [-1, 12]` 구간을 쓴다(문서당 섹션 최대 12 — `schema.ts:1016,1062`
 * `sections: z.array(...).min(1).max(12)`, 커스텀/표지는 -1 — `types.ts:47`).
 * E22-0 3번으로 문서 하드 상한(6)이 폐기됐으므로 문서 수는 「수십」까지 열려 있는데,
 * 900_000 은 **문서 899개**(899 × 1000 + 12 = 899,012)까지 겹치지 않는다. 서버 요청 배치
 * 상한이 12, 콘텐츠 소프트 경고가 총 아이템 600 임을 감안하면 사실상 영구 비충돌이다.
 * 값이 커도 안전하다 — sectionIndex 는 배열 인덱스로 쓰이는 곳이
 * `properties-panel.tsx:208`(`active.sectionIndex >= 0 ? report.sections[idx] : null`) 뿐이고
 * 거기서 `undefined` 가 나와도 `:209` 이후가 전부 `activeSection?.` 옵셔널 체이닝이라
 * 크래시가 없다(부착 문서의 1000+ 값이 이미 같은 경로를 지나고 있다 — 신규 위험 0).
 */
export const QUESTION_SECTION_BASE = 900_000;

/**
 * 문항 정답표 전용 `sectionIndex`. 문항 본문 구간(`900_000 + viewIndex`)과 90,000 만큼 떨어져
 * 있어, 마지막 문항 조각과 정답표 첫 조각이 `runs.tsx:34` 에서 **절대 한 런으로 병합되지 않는다**
 * (정답표는 `.par-ws-key-table` 표라 병합되면 마지막 문항 박스 안으로 빨려 들어간다).
 * 90,000 간극은 문항 수가 이론상 90,000 개를 넘지 않는 한 침범될 수 없다.
 */
export const QUESTION_ANSWER_SECTION = 990_000;

/**
 * 문항 하나의 논리 블록 id(= `orderId` = `editId`). 조각들은 이 값을 공유한다.
 *
 * `questionId` 는 DB 레코드 id(cuid)를 그대로 쓴다 — **렌더 시점에 생성하지 않는다**.
 * 같은 문항이 몇 번 다시 렌더돼도 같은 id 여야 `pages.tsx` 의 heightById/itemsById 두 인덱스가
 * 일치한다(파일 상단 `makeLocalId` 함정 참조).
 */
export function questionOrderId(questionId: string): string {
  return `${QUESTION_ID_PREFIX}${questionId}`;
}

/**
 * 세트(다지문 묶음) 공유지문 블록의 논리 블록 id.
 *
 * 세트 공유지문은 멤버 문항과 **다른 논리 블록**이어야 한다 — `runs.tsx:37` 의 ws-list 병합
 * 조건이 `orderIdOf` 동일성이라, 같은 orderId 를 주면 공유지문과 첫 멤버가 한 박스로 붙어
 * 페이지 경계에서 나뉘지 못한다. `set-` 중간 토큰은 문항 id 공간과의 충돌 방지용
 * (`qb-set-{setId}` vs `qb-{questionId}` — 접두가 달라 우연 충돌이 불가능하다).
 */
export function questionSetOrderId(setId: string): string {
  return `${QUESTION_ID_PREFIX}set-${setId}`;
}

/**
 * 문항 정답표 묶음의 논리 블록 id(단일 — 정답표는 전 문항이 한 논리 블록).
 *
 * ⚠ `-ans` 로 끝나지 않는다. `isActivityAnswerId`(`items.ts:12-14`)의 접미 판정에 걸리면
 * `visibleFlowItems`(`items.ts:61-62,84-88`)가 이 묶음을 「항상 문서 맨 끝」 특례로 옮겨
 * 활성 학습지의 활동 정답 페이지 뒤로 튕겨 나간다. 조각 id 는 어차피 `::p{n}` 으로 끝나므로
 * 이중으로 안전하다.
 */
export const QUESTION_ANSWER_ORDER_ID = `${QUESTION_ID_PREFIX}answers`;

/**
 * 조각 id — `${orderId}::p{n}`.
 *
 * 첫 인자는 **이미 접두가 붙은 논리 블록 id**(`questionOrderId` / `questionSetOrderId` /
 * `QUESTION_ANSWER_ORDER_ID`)를 받는다. 접두를 여기서 다시 붙이지 않는 이유는, 붙이면
 * 호출부가 orderId 와 조각 id 를 서로 다른 어휘로 만들게 되어 `orderIdOf`(`items.ts:16-22`)
 * 폴백(`orderId ?? editId ?? id`)과 어긋날 여지가 생기기 때문이다.
 *
 * 잘림 방지의 본체가 이 조각 분할이다 — `.par-sheet { overflow:hidden }`
 * (`report-styles.ts:25-37`) 때문에 250mm 를 넘는 통짜 블록은 **소리 없이 잘린다**
 * (`worksheet.tsx:276-281` 이 기록한 실제 결함). 조각이 잘게 나뉘어야 `packFlow` 가
 * 페이지 경계에서 나눌 수 있다.
 */
export function questionPartId(orderId: string, n: number): string {
  return `${orderId}${PART_SEP}p${n}`;
}

/**
 * 문항 축에서 나온 id 인가 = **활성 학습지 report 로 커밋하면 안 되는 외래 id**.
 *
 * `isComposedNsId`(`compose-ids.ts:214-216`, 학습지 축)와 **한 쌍**으로 쓴다. U5 의 편집 관문
 * (`deleteActive`/`onResize`/`onReorder`/`onBlockMeta` 초입)은 두 판정을 **둘 다** 켜야 한다 —
 * 문항 id 에는 `__` 가 없으므로 `isComposedNsId` 단독으로는 문항을 절대 못 잡고,
 * 그때 `deleteItem`(`editor-mutations.ts:250,261-262`)이 `qb-…::p0` 를 활성 report 의
 * blockMeta 에 `{hidden:true}` 로 써 넣는다(파일 상단 2번 참조).
 */
export function isComposedQuestionId(id: string): boolean {
  return id.startsWith(QUESTION_ID_PREFIX);
}

/**
 * 원천 키(questionId / setId)가 이 id 문법을 오염시키지 않는지 — **개발용 선택 판정**.
 *
 * 순수층이라 강제하지 않는다(throw·console 없음). 호출부(U2/U3)가 원하면 dev 모드에서
 * 한 번 확인하는 용도다.
 *  · `__` 포함 → `isComposedNsId`(학습지 축) 오탐 — 두 네임스페이스 축이 섞인다.
 *  · `::` 포함 → 조각 구분자와 충돌해 `questionPartId` 결과가 모호해진다.
 * 실측상 DB cuid 에는 둘 다 등장하지 않으므로 정상 경로에서는 항상 true 다.
 */
export function isSafeQuestionKey(key: string): boolean {
  return key.length > 0 && !key.includes("__") && !key.includes(PART_SEP);
}
