import type { BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import type { FlowItem } from "../report-sections/types";

/**
 * E21 학습지 조판 — id 네임스페이스 순수층 (docs/class-studio-spec.md §3.10.21 E21-1).
 *
 * 조판 표면은 「편집 중인 활성 문서 1개 + 읽기전용 부착 문서 N개」를 **1 par-root · 1 페이지네이션**
 * 으로 합성해 보여 준다(저장은 끝까지 문서별 PATCH — 합성 **뷰**이지 합성 **문서**가 아니다).
 * 그러려면 문서끼리 id 가 반드시 충돌한다(모든 문서가 `s0-head`, `s1-snt0`, `c-…` 를 갖는다).
 * 이 파일은 그 충돌만 없애는 **순수 문자열 계층**이다 — 런타임 의존 0, JSX 0, 부수효과 0
 * (import 는 전부 `import type` 이라 번들에 아무것도 남기지 않는다). 렌더 중 호출해도 안전하고
 * StrictMode 이중 렌더에서도 결과가 동일하다(`report-sections/flow-cache.ts` 헤더와 같은 계약).
 *
 * ─── 반드시 **접미**(`${id}__${docKey}`). 접두는 영구 금지 ───────────────────────────
 * 이 리포의 블록 id 파괴/판정 게이트가 전부 **앞자리 앵커**라, 접두를 붙이는 순간 조용히 오작동한다.
 * (아래 4건은 26-08-17 실제 파일을 열어 줄 번호를 재확인한 값이다)
 *
 *  1. `editor-mutations.ts:49`  `shiftBlockIdAfterDelete` — `/^s(\d+)-(.+)$/`
 *     섹션 삭제 후 id 시프트. 접두가 붙으면 매칭 실패 → 그 문서 블록들이 전부 "통과"로 취급되어
 *     섹션 인덱스 보정이 통째로 누락된다.
 *  2. `editor-mutations.ts:261` `deleteItem` — 같은 `/^s(\d+)-(.+)$/`
 *     매칭 실패 시 `setBlockMeta(report, id, { hidden: true })` 로 떨어져,
 *     "문장 1줄 삭제"가 "정체불명 id 를 blockMeta 에 숨김으로 기록"으로 바뀐다.
 *  3. `editor-mutations.ts:242,252` · `report-pages/items.ts:13` — `id.startsWith("c-")`
 *     커스텀 블록 판정 3곳(`logicalBlockId` / `deleteItem` / `isActivityAnswerId`).
 *     접두를 쓰면 커스텀 블록이 커스텀으로 안 보인다.
 *  4. **`report-pages/items.ts:102`  `isAutoFitItem = /^s\d+-annotated-snt\d+/`** — 이게 최악이다.
 *     이 판정은 `packFlow` **내부**(`report-pages/items.ts:206` `const autoFit = isAutoFitItem(it)`)
 *     에서 도는 것이라 **부착 문서 아이템도 반드시 이 줄을 통과한다**. autoFit 인 필기분석 문장
 *     조각은 저장된 stale `breakBefore` 를 무시하도록 되어 있는데(`items.ts:215`),
 *     접두를 쓰면 그 면제가 깨져 **그 문서만 페이지가 폭발한다**(조각마다 강제 분할).
 *
 * 접미는 위 4건을 전부 무해하게 통과한다(앞자리가 원본 그대로다). 반대로 접미가 **일부러** 깨는
 * 판정이 하나 있다 — `isActivityAnswerId`(`items.ts:12-14`, `-ans` 로 **끝나는지**를 본다).
 * 이건 E21-1 5번의 의도된 설계다: 활성 문서 정답지에도 접미를 먹여 "항상 문서 맨 끝"
 * (`items.ts:84-88`) 규칙을 무력화해야, A 문서 정답지가 C 문서 뒤로 튕겨 나가지 않고
 * 각 문서 끝에 앉는다. 정답 아이템은 `describeItems`(`items.ts:36`) 제외 대상이라 편집 계약은 무손상.
 *
 * ─── docKey 문자셋 ───────────────────────────────────────────────────────────────
 * `[A-Za-z0-9_]` 만 허용한다. `AnalysisReportEditor.tsx:745-747` 의 `scrollToBlock` 이
 * `CSS.escape` 없이 `[data-paper-item-id="${id}"]` / `[data-mid="${id}"]` 를 문자열로 결합하기
 * 때문에, 따옴표·백슬래시·공백이 섞인 docKey 는 선택자를 깨뜨린다(호출부가 `isValidDocKey` 로
 * 사전 차단할 것 — 여기서는 판정만 제공하고 강제하지 않는다).
 */

/** docKey 허용 문자셋. `g` 플래그 금지(lastIndex 상태가 남아 호출마다 결과가 흔들린다). */
const DOC_KEY_RE = /^[A-Za-z0-9_]+$/;

/** id 구분자. 원본 id 문법(`s0-head`, `c-…::0`)에 등장하지 않는 이중 언더스코어를 쓴다. */
const NS_SEP = "__";

/**
 * `FlowItem` 의 로컬 확장 — 어느 문서에서 온 아이템인지 표시.
 *
 * 정본 `FlowItem`(`report-sections/types.ts:45-64`)에는 `docKey` 가 없고 그 파일은 이 유닛의
 * 배정 밖이라 여기서 구조적으로 확장한다. 옵셔널이므로 `FlowItem` 을 받는 기존 함수
 * (`visibleFlowItems` · `packFlow` · `describeItems`)에 그대로 대입 가능하고,
 * 미사용 소비처의 동작은 바이트 동일하다.
 */
export type NsFlowItem = FlowItem & { docKey?: string };

/** `${id}__${docKey}` — **접미 고정**(파일 상단 주석의 4건 참조). */
export function nsSuffix(id: string, docKey: string): string {
  return `${id}${NS_SEP}${docKey}`;
}

/**
 * FlowItem 하나를 문서 네임스페이스로 옮긴다 — `id`·`editId`·`orderId` **3필드 전부**.
 *
 * 한 필드라도 새면 `report-pages/pages.tsx` 의 두 인덱스가 서로 다른 블록을 가리킨다:
 * heightById 는 **먼저 만난 것 우선**, itemsById 는 **나중 것이 이김** — 규칙이 정반대라
 * 측정과 렌더가 어긋나고, 증상은 오직 "페이지 넘침"으로만 드러나 원인 추적이 사실상 불가능하다.
 *
 * `editId`/`orderId` 는 **옵셔널이며 부재 시 신설하지 않는다**. `editIdOf`/`orderIdOf`
 * (`report-pages/items.ts:16-22`)가 `orderId ?? editId ?? id` 폴백으로 "조각들이 한 논리 블록"
 * 을 표현하는데, 없는 필드를 채워 넣으면 그 폴백 의미(그룹 접기·blockMeta 조회 키)가 바뀐다.
 * `node`(ReactNode)는 참조 그대로 복사한다 — 새로 만들면 flow-cache 의 참조 보존 이득이 증발한다.
 */
export function nsFlowItem(it: FlowItem, docKey: string): NsFlowItem {
  const next: NsFlowItem = { ...it, id: nsSuffix(it.id, docKey), docKey };
  if (it.editId !== undefined) next.editId = nsSuffix(it.editId, docKey);
  if (it.orderId !== undefined) next.orderId = nsSuffix(it.orderId, docKey);
  return next;
}

/**
 * **부착(읽기전용) 문서 전용** 네임스페이스 이식 — `nsFlowItem` + 편집 chrome 봉인.
 *
 * ─── 왜 필요한가 (26-08-17 적대검수 확정 결함) ───────────────────────────────────
 * 부착 문서 아이템도 활성 문서 아이템과 **같은 `edit` 객체**로 렌더된다
 * (`report-pages/pages.tsx:204` `<RunsView items={pageItems} edit={edit} …/>` — 아이템 출처
 * (docKey) 게이트가 없다). 그래서 `report-pages/shells.tsx` 의 그립·휴지통·리사이즈 핸들이
 * 부착 문서 블록에도 그대로 렌더되고, `report-edit-styles.ts:142-143`
 * `.par-root-edit .par-eline:hover > .par-eblock-del { opacity: 1 }` 때문에 **호버만 하면 보인다**.
 * 누르면 `deleteItem`(`editor-mutations.ts:250`)이 접미 id 를 못 알아보고
 * `:262/:285 setBlockMeta(report, id, { hidden: true })` 로 떨어져 **활성 문서 report 의
 * blockMeta 에 `s3-row2__d_abc: {hidden:true}` 같은 남의 문서 id 쓰레기를 써 넣는다**.
 * `blockMeta` 는 `schema.ts:1020 z.record(z.string(), …)` 라 키 제한이 없어 스키마를 통과해
 * **그대로 저장**된다. 리사이즈(`minHeight`)·그립 드래그(`blockOrder` 삽입)도 같은 경로다.
 * 화면에서는 실제로 사라지므로(합성 blockMeta 병합이 그 hidden 키를 살려 준다) 사용자는
 * 「부착 문서를 편집했다」고 믿지만, 그 학습지를 단독으로 열면 하나도 안 지워져 있다 —
 * E21-0 「저장 대상은 현재 문서」 고지와 정면으로 어긋나는 신뢰 사고.
 *
 * ─── 왜 이 두 필드만으로 끝나는가 ────────────────────────────────────────────────
 * `report-pages/shells.tsx` 가 이미 아이템 필드로 게이트하고 있다:
 *   `:189,190`(LiShell) · `:215`(RowShell) · `:235,236`(BlockShell) · `:275,276`(MapItemShell)
 *     → `it.showGrip !== false` (그립 + 블록 휴지통)
 *   `:186`(LiShell) · `:232`(BlockShell) → `it.resizable !== false` (리사이즈 핸들)
 * 선례도 있다 — `report-sections/assemble.tsx:293-294`·`worksheet-flow.tsx:26-27` 가 같은 방식으로
 * 파생/조각 블록의 chrome 을 끈다. 즉 이건 신규 메커니즘이 아니라 **기존 계약의 재사용**이다.
 *
 * ─── 활성 문서에는 절대 쓰지 마라 ────────────────────────────────────────────────
 * `compose-flow.ts:157` 의 **활성 문서 정답 아이템** 접미 경로는 `nsFlowItem` 그대로 둔다.
 * 그 아이템들은 활성 문서 소유라 chrome 을 없앨 이유가 없고(원본 id 로의 편집은 별도
 * 관문 `AnalysisReportEditor.tsx` 가 막는다), 여기서 같이 끄면 비합성 모드와 조판 모드의
 * 정답 페이지 어포던스가 갈린다.
 *
 * ─── ⚠️ QA 하네스 오탐 주의 (26-08-18 실측, 스펙 §3.10.21 E21-7 8번) ─────────────────
 * `showGrip:false` 는 `shells.tsx:75-81 Grip` 의 렌더를 막는데, 그 버튼의 **본문이 글리프
 * `⠿`(U+283F = 10303)** 다. 즉 부착 문서 페이지는 활성/단독 문서보다 `.par-sheet-body` 의
 * `textContent` 가 **블록당 1글자씩 줄어든다** — 이건 의도된 봉인의 정상 부수효과다.
 * 그래서 **이미지 전용 페이지**(커스텀 `wrap:"image"` 블록 = 지문 웹툰)는
 *   · 단독 열람: `bodyLen === 1` (그립 `⠿` 만 있음)
 *   · 조판(부착): `bodyLen === 0` (그립이 봉인됨)
 * 이 되어, `.par-sheet-body` **텍스트 길이로 빈 페이지를 찾는 검출기**는 조판에서만 그 페이지를
 * 「본문 0 = 빈 페이지」로 잡는다. **합성 결함이 아니다.**
 * 실측 반증(2학년·기본 학습지 3건): 조판 34p = 단독 5p + 5p + 24p 로 **완전 가산**이고,
 * 문서 3(서양 역사…)의 페이지별 아이템 배치가 단독 pi=0..23 ↔ 조판 pi=10..33 에서 접미를
 * 뺀 값까지 **1:1 완전 일치**(문제의 이미지 페이지 = 단독 pi=2 ↔ 조판 pi=12, 같은 블록
 * `c-6e0f4c90-…`). 이미지도 정상 로드된다(naturalSize 2160×3840, 렌더 556×989px).
 * → 빈 페이지 검출기는 텍스트가 아니라 **`.par-sheet-body` 의 자식 요소 수 / 렌더 박스 높이**
 *   로 판정해야 한다(`.tmp-worksheet-compose/_blank-dump.mjs`·`_blank-img.mjs` 가 그 방식).
 */
export function nsAttachedFlowItem(it: FlowItem, docKey: string): NsFlowItem {
  const next = nsFlowItem(it, docKey);
  // 읽기전용 부착 문서 = 편집 chrome 봉인. `false` 를 **명시**해야 한다(undefined 는 `!== false`
  // 게이트를 통과한다) — 원본이 `showGrip: true` 를 갖고 있어도 여기서 덮어써야 하므로
  // `nsFlowItem` 의 `{...it}` 복사 뒤에 오는 이 두 줄의 순서가 곧 계약이다.
  next.showGrip = false;
  next.resizable = false;
  return next;
}

/**
 * blockMeta Record 의 **키 전량**을 문서 네임스페이스로 리맵한다(값은 참조 복사 — BlockMeta 는
 * 불변 취급이라 얕은 복사조차 불필요하고, 참조 보존이 하위 memo 에 유리하다).
 *
 * 합성 `pagesReport.blockMeta` 는 `{...활성, ...부착 리맵}` 병합이라(E21-1 6번),
 * 접미가 없으면 부착 문서의 `s0-head` 메타가 활성 문서의 `s0-head` 를 덮어써
 * **남의 문서 서식이 내 문서에 적용된다**.
 */
export function nsBlockMetaKeys(
  meta: Record<string, BlockMeta> | undefined,
  docKey: string,
): Record<string, BlockMeta> {
  const out: Record<string, BlockMeta> = {};
  if (!meta) return out;
  for (const key of Object.keys(meta)) out[nsSuffix(key, docKey)] = meta[key];
  return out;
}

/**
 * 합성 결과의 id 유일성 검증 — **개발 모드 전용, throw 금지**.
 *
 * 중복 id 는 pages.tsx 의 heightById/itemsById 불일치(= 조용한 페이지 넘침)로만 드러나므로
 * 개발 중에 콘솔로 먼저 잡는다. 다만 사용자 화면을 죽이면 안 되므로 절대 throw 하지 않는다
 * (조판은 저장 경로가 아니라 **뷰**다 — 표시가 어긋나도 원본 문서는 안전하다).
 * 목록은 최대 5개까지만 출력한다(중복이 나면 보통 문서 단위로 수백 개가 쏟아진다).
 */
export function assertUniqueIds(items: FlowItem[]): void {
  if (process.env.NODE_ENV === "production") return;
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const it of items) {
    if (seen.has(it.id)) {
      // 같은 id 가 3번 나와도 목록엔 1번만 — 5개 슬롯을 한 id 가 다 먹지 않게.
      if (!dups.includes(it.id) && dups.length < 5) dups.push(it.id);
    } else {
      seen.add(it.id);
    }
  }
  if (dups.length === 0) return;
  const total = items.length - seen.size;
  console.error(
    `[compose] FlowItem id 중복 ${total}건 — 네임스페이스 누락 의심(nsFlowItem 은 id/editId/orderId 3필드 전부 접미해야 함):`,
    dups.join(", ") + (total > dups.length ? " …" : ""),
  );
}

/**
 * docKey 로 쓸 수 있는 문자열인지. 근거는 파일 상단 「docKey 문자셋」 —
 * `AnalysisReportEditor.tsx:745-747` scrollToBlock 이 `CSS.escape` 없이 선택자를 결합한다.
 */
export function isValidDocKey(k: string): boolean {
  return DOC_KEY_RE.test(k);
}

/**
 * 합성 네임스페이스(`__{docKey}`)가 붙은 id 인가 = **활성 report 로 커밋하면 안 되는 외래 id**.
 *
 * 편집 콜백(`deleteActive`/`onResize`/`onReorder`/`onBlockMeta`)의 관문 판정용이다. 부착 문서
 * 블록의 chrome 은 `nsAttachedFlowItem` 이 이미 제거하지만, chrome 을 거치지 않는 경로
 * (Delete 키 — `AnalysisReportEditor.tsx` 의 keydown 핸들러가 `activeId` 로 바로 삭제, 그리고
 * `chromeProps`(`report-pages/items.ts:145-160`)의 `onMouseDown → setActiveId` 로 부착 블록이
 * 선택될 수 있어 속성 패널 경유도 열려 있다)가 남으므로 **콜백 초입에서 한 번 더** 막는다.
 * 어포던스 제거(1차)와 관문 차단(2차)은 둘 다 필요하다.
 *
 * `NS_SEP` 를 `__`(이중 언더스코어)로 고른 이유가 여기서 값을 한다 — 원본 id 문법
 * (`s0-head` · `s1-snt0` · `activity-answers-head` · `c-${crypto.randomUUID()}`(`editor-mutations.ts:216-222`)
 * · `c-…::0`)에는 `__` 가 **한 번도** 등장하지 않으므로 오탐이 원리적으로 없다.
 * (26-08-17 실측: `report-sections/` 전량 grep 결과 `__` 는 `editable-field.tsx:331` 의
 *  마크다운 강조 파서 `/__(.+?)__/g` 와 빈칸 밑줄 문자열뿐 — id 생성부는 0건.)
 */
export function isComposedNsId(id: string): boolean {
  return id.includes(NS_SEP);
}
