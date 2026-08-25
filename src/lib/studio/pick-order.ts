// ============================================================================
// 조판 대기열 **지문 그룹 정렬** 순수층 (E27 · docs/class-studio-spec.md §3.10.26)
//
// 이 파일이 존재하는 이유는 하나다: `studio-home-client.tsx`(오케스트레이터)와
// `sheet-compose-surface.tsx`(조판 표면)가 **같은 정렬 규칙**을 써야 하는데, 표면이
// 오케스트레이터를 import 하면 **순환**이 된다 —
// `studio-home-client.tsx:149` 가 이미 표면을 import 하고 있다.
// 번들러가 호이스팅으로 살려 줄 수는 있으나, 이 리포는 그런 곡예를 허용하지 않는다:
// `sheet-pick-types.ts` 머리주석이 같은 상황에서 「순수 타입만 · 런타임 import 0」을
// 못박았고 `dossier-types.ts` 가 같은 이유로 존재한다. 규칙을 두 벌로 복제하는 길은
// 더 나쁘다 — 두 벌은 **조용히 갈린다**.
//
// **JSX 0 · 부수효과 0.** 순수 함수만 둔다.
// 런타임 import 는 **의존성 0 인 리터럴 상수 모듈 1건**(passage-constants.ts)뿐이다.
// [E30] 그 예외를 두는 이유: 아래 `SHEET_PLAN_RANK` 의 키는 마커 문자열이라, 리터럴을
// 복제하면 마커가 늘거나 개명될 때 **타입 에러 0 · 화면에서만 순서가 틀린** 방식으로
// 조용히 갈린다(이 파일이 존재하는 이유와 같은 계통의 사고). 같은 판단을
// `sheet-deploy-eligibility.ts:28-32` 가 이미 내렸고 그 파일도 클라이언트 행
// 컴포넌트가 직접 import 한다 — 프로덕션에서 이미 도는 배선이라 번들 안전이 실증돼 있다.
//
// ⚠ 두 축의 소유가 다르다:
//   · `withPassageGroupedOrder`(학습지) — **오케스트레이터가 Map 자체에 커밋**한다.
//     학습지는 순번 배지와 인쇄가 둘 다 그 Map 파생이라 정합한다.
//   · `withPassageGroupedQuestionOrder`(문항) — **조판 표면이 파생에만 쓴다.**
//     `flatPicked` 자체는 절대 재정렬하지 마라. 시험지 빌더의 라이브 동기화가
//     집합 diff 전용(`exam-paper-builder-client.tsx:1182-1191` toAdd/toRemove)이라
//     순수 재정렬이 전파되지 않는데 배지만 바뀌어 **배지/인쇄가 갈린다**
//     (이 리포가 이미 한 번 수리한 「3,1,2」 결함의 재발 — E27 적대검수 확정).
// ============================================================================

import {
  FINAL_REPORT_MARKER,
  KO_PRIME_REPORT_MARKER,
  PRACTICE_REPORT_MARKER,
  PRIME_REPORT_MARKER,
} from "@/actions/workbench/passage-constants";

import type { PickedQuestionMeta } from "@/app/(director)/director/studio/workbench/dossier-pick-bar";

/**
 * [E27] 문항 목록을 **학습지 그룹 순서**에 맞춘다(E27-SPEC §2 R1-2).
 *
 * ══ ⚠ 【소비자는 이 파일이 아니다 — E27 적대검수 확정】 ══════════════════════════
 * 이 함수를 **정렬 effect 에서 부르지 마라.** `flatPicked` 를 재정렬하면
 * `composeSyncIds` → 시험지 빌더 `syncQuestionIds` 로 흐르는데, 그 소비처
 * (`exam-paper-builder-client.tsx:1182-1191`)가 **집합 diff 전용**이라 순수 재정렬
 * 커밋에 무동작이다. 그런데 순번 배지는 같은 Map 파생이라 즉시 바뀐다 →
 * 「배지만 바뀌고 시험지 인쇄 순서는 그대로」. 상세 근거는 정렬 effect 위
 * 「교차축 정정」 절.
 *
 * **유일한 정당한 호출부는 학습지 조판 표면**(`workbench/sheet-compose-surface.tsx`)
 * 이다. 그쪽은 자기 인쇄 스트림의 순서를 정하려고 이 규칙을 쓰고, 그 결과는
 * `flatPicked`(= 배지 = 시험지 축)에 되돌아가지 않는다. 그래서 이 함수는
 * **export** 돼 있다 — 「아무도 안 쓰는 것 같으니 지우자」로 읽지 마라.
 * (표면이 import 하지만 순환이 아니다: webpack/SWC 는 ESM named import 를
 *  **호출 지점 프로퍼티 접근**으로 컴파일하고 함수 선언은 호이스팅되므로,
 *  이 모듈이 평가되기 전에 값을 읽는 창이 존재하지 않는다.)
 *
 * ⚠ 학습지 축과 달리 「활성」 개념이 **없다** — 문항에는 활성 문서라는 것이 존재하지
 *   않는다. 적용하는 것은 **그룹 정렬 하나뿐**이고, 「활성을 맨 앞으로」는
 *   끝까지 학습지 축 전용이다.
 *
 * 규칙 3개:
 *  1) 문항을 `passageId` 로 그룹(첫 등장 순서).
 *  2) `sheetGroupOrder` 에 있는 지문을 **그 순서대로 먼저**, 없는 지문은 첫 등장 순서로 뒤에.
 *  3) 그룹 내부 상대 순서 보존. 동일 시퀀스면 원본 참조 반환(무동작 수렴 — 위 규칙 4)와 동일 장치).
 *
 * `PickedQuestionMeta.passageId` 는 타입상 `string` 이지만 원천 DB 컬럼이 nullable
 * 이고(`prisma/schema.prisma:960 passageId String?`) 액션이 방어적으로 스킵하는 축이라
 * (`actions/studio/questions.ts:162-164 if (!q.passageId) continue;`), 빈 문자열/undefined
 * 는 **그룹 키 `""`** 로 모아 **언제나 꼬리**에 둔다. 지문 미상 문항이 남의 지문 묶음
 * 사이에 끼면 인쇄물에서 그 지문 문제로 오독되기 때문이다 — 이 그룹은 `sheetGroupOrder`
 * 에 우연히 `""` 가 섞여 있어도 앞으로 끌려 나오지 않는다.
 *
 * ─ ⚠ 스펙 정정: `sheetGroupOrder` 가 비었을 때 ────────────────────────────────
 * E27-SPEC §2 R1-2 는 「학습지 픽이 0이면 sheetGroupOrder 가 비어 그룹 순서 = 첫
 * 등장 순서 → **기존과 완전히 동일**」이라고 단언하는데, 그 도출은 **거짓이다**.
 * 규칙 1)의 그룹핑은 무조건이라 그룹 **순서**가 첫 등장 순서여도 각 그룹이
 * **연속으로 뭉쳐진다** — 실측(`.tmp-worksheet-compose/_e27-u3-order.mjs` 케이스
 * ④, 가드 제거 시 RED): 체크 순서 `P2,P1,P2` 가
 * `P2,P2,P1` 로 재배열됐다. 「완전히 동일」이 성립하는 것은 사용자의 체크 순서가
 * 이미 지문별로 연속일 때뿐이다.
 *
 * 그래서 **명시 조기 반환**을 둔다: `sheetGroupOrder.length === 0` 이면 원본 참조를
 * 그대로 돌려준다. 이유는 두 가지다.
 *  · 이 함수의 존재 이유가 「문항을 **학습지 그룹 순서에** 맞추는 것」인데, 맞출
 *    학습지가 0장이면 맞출 대상 자체가 없다.
 *  · 학습지 픽 0(또는 픽 전량이 passageId 미상)이면 인쇄 스트림에서 문항은 전부
 *    **꼬리**로 가고 그 꼬리 순서는 체크 순서다. 여기서 조용히 뭉치면 화면 배지와
 *    인쇄 꼬리 순서가 갈린다 — 「체크 순서 = 인쇄 순서」 최상위 불변식 위반.
 * 이 가드가 곧 스펙이 **말하려던** 무회귀 보장이다. 걷어내지 마라
 * (타입 에러 0 · 인쇄물에서만 발견).
 */
export function withPassageGroupedQuestionOrder(
  picked: ReadonlyMap<string, PickedQuestionMeta>,
  sheetGroupOrder: readonly string[],
): ReadonlyMap<string, PickedQuestionMeta> {
  if (picked.size < 2) return picked;
  // ⚠ 위 「스펙 정정」 절 — 맞출 학습지 그룹이 0개면 **손대지 않는다**.
  //   문항 전량이 꼬리로 가는 상태이고, 그 꼬리 순서는 체크 순서여야 한다. 지우지 마라.
  if (sheetGroupOrder.length === 0) return picked;

  const groups = new Map<string, string[]>();
  for (const [id, meta] of picked) {
    // `??` 가 아니라 `||` 다 — 빈 문자열과 undefined 를 **같은** 꼬리 그룹으로 모아야
    // 한다(`??` 는 빈 문자열을 통과시켜 꼬리 그룹이 둘로 갈린다).
    const key = meta.passageId || "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(id);
    else groups.set(key, [id]);
  }

  const order: string[] = [];
  const seen = new Set<string>();
  // ① 학습지 그룹 순서 우선. 꼬리 그룹("")은 여기서 절대 집어 올리지 않는다.
  for (const key of sheetGroupOrder) {
    if (key === "" || seen.has(key) || !groups.has(key)) continue;
    seen.add(key);
    order.push(key);
  }
  // ② 학습지가 없는 지문은 첫 등장 순서로 그 뒤에.
  for (const key of groups.keys()) {
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }
  // ③ 지문 미상 문항은 언제나 맨 꼬리.
  if (groups.has("")) order.push("");

  const nextKeys: string[] = [];
  for (const key of order) {
    const bucket = groups.get(key);
    if (!bucket) continue;
    for (const id of bucket) nextKeys.push(id);
  }

  let i = 0;
  let same = true;
  for (const id of picked.keys()) {
    if (nextKeys[i] !== id) {
      same = false;
      break;
    }
    i += 1;
  }
  if (same) return picked;

  const next = new Map<string, PickedQuestionMeta>();
  for (const id of nextKeys) {
    const meta = picked.get(id);
    if (meta !== undefined) next.set(id, meta);
  }
  return next;
}

// ============================================================================
// [E30 §4-2 · §4-3 · §4-4] 같은 지문 안의 학습지 문서 3종 정렬·동반 픽
//
// 실전 학습지(PRIME_PRACTICE)가 기본 PRIME 의 **자식 문서**로 분리되면서, 한 지문
// 카드 안에 학습지 행이 최대 3줄(기본 / 실전 / 파이널)이 된다. 사용자 요구는
// 「기본 학습지를 추가하고 실전 학습지를 추가하도록」 — 즉 **기본이 언제나 앞**이다.
// 그 규칙의 정본을 여기 두는 이유는 이 파일이 존재하는 이유와 같다: 목록 정렬 ·
// 픽 커밋 · 그룹 정렬 **3곳**이 같은 규칙을 써야 하는데, 복제본은 조용히 갈린다.
// ============================================================================

/**
 * 같은 지문 안의 학습지 문서 인쇄/표시 랭크. 미지 마커는 꼬리.
 *
 * 왜 필요한가: 병합 목록의 기존 정렬은 `createdAt` **내림차순**이라, 나중에 만든
 * 실전이 카드 안에서 기본 **위**에 그려진다. 그리고 「전체 선택」·마키가 담는 순서 =
 * **DOM 순서**(composer-list-pane.tsx 계약)라, 그대로 두면 사용자 요구가 화면에서부터
 * 뒤집힌 채 시작한다.
 *
 * ⚠ 랭크는 **결정론적**이어야 한다(같은 입력 → 언제나 같은 시퀀스). 이 값을 읽는
 *   `withPassageGroupedOrder`(studio-home-client.tsx)의 규칙 ④ 「시퀀스 동일 시 원본
 *   참조 반환」이 정렬 effect 의 무한루프를 막는 유일한 장치인데, 랭크가 흔들리면
 *   2패스째에 수렴하지 못한다 — 그 고장은 **에러 0 · 콘솔 0 · 화면만 멈춘다**.
 * ⚠ 미지 마커를 9(꼬리)로 보내되 **버리지는 않는다**. 표시부는 미지 마커를 원문
 *   폴백으로 그리는 계약(SHEET_PLAN_LABEL)이라, 정렬에서 증발시키면 화면에 있는 행이
 *   인쇄에서 사라진다.
 */
export const SHEET_PLAN_RANK: ReadonlyMap<string, number> = new Map([
  [PRIME_REPORT_MARKER, 0],
  [PRACTICE_REPORT_MARKER, 1],
  [FINAL_REPORT_MARKER, 2],
  [KO_PRIME_REPORT_MARKER, 3],
]);

/** planMarker → 랭크. 미지 마커는 꼬리(9). 목록·픽·정렬 3곳이 이 함수 하나를 쓴다. */
export function sheetPlanRank(marker: string): number {
  return SHEET_PLAN_RANK.get(marker) ?? 9;
}

/**
 * [E30 §4-4 D-COMPANION] 실전/파이널 학습지를 담을 때 같은 지문의 기본 학습지를
 * **앞쪽에** 동반 삽입한다.
 *
 * ══ 왜 체크박스 `disabled` 가 아니라 이것인가 ═══════════════════════════════════
 * `disabled` 는 **방어가 아니라 장식**이다 — `DragSelect` 의 히트 수집은
 * `root.querySelectorAll("[data-drag-item-id]")` + 순수 rect 비교라 `disabled`·가시성·
 * `inert` 를 **일절 보지 않는다**(components/ui/drag-select.tsx). 게다가
 * `cursor-not-allowed` 를 주면 `CONTROL_CURSOR_VALUES` 에 걸려 **그 행에서 마키를 시작할
 * 수 없게** 된다(E28 계기 함정 2와 같은 계통). → 막지 말고 **커밋 시점에 동반한다**.
 *
 * @param added   커밋될 added 배열(입력 순서 = 담기 순서).
 * @param allRows 전체 모집단(필터·상한 적용 **전**) — 접힌 카드·가려진 행도 대상이어야
 *   한다. 병합 목록에서는 `mergedRows`(전체)이지 `visibleRowByKey` 가 **아니다**:
 *   그것은 「마키가 닿지 못한 것은 권한 밖」이라는 **제거 권한 축소**용이지 담기 축소용이
 *   아니다. 좁혀 넘기면 접힌 카드의 기본 행을 못 찾아 규칙 3(무동작)으로 조용히 새어
 *   「실전만 담긴 픽」이 만들어진다.
 *   ⚠ **학습지 행만** 넘겨라 — 문항 행은 `planMarker` 축이 없다.
 * @param picked  현재 픽 Map 의 키 집합(reportId) — 이미 담긴 기본은 다시 넣지 않는다
 *   (재삽입 = 순서 뒤집힘. 픽 Map 의 **삽입 순서가 곧 인쇄 순서**다 — E27 R1-0).
 *
 * 규칙:
 *  1. `added` 를 순회하며 `planMarker !== "PRIME"` 인 학습지를 만나면, 같은 `passageId`
 *     의 `planMarker === "PRIME"` 행을 `allRows` 에서 찾아 **그 항목 바로 앞에** 삽입한다.
 *  2. 이미 `picked` 에 있거나 이번 `added` 에 이미 들어 있으면 삽입하지 않는다.
 *  3. 기본 행이 `allRows` 에 **없으면**(레거시 파이널 고아 3건 등) 아무것도 하지 않는다 —
 *     조용히 실패하지 말고 **호출부가 그 사실을 카운트해 고지에 쓴다**(§4-5).
 *     여기서 throw 하거나 항목을 드롭하지 마라: 파이널은 기본 없이도 성립하는 문서다.
 *  4. 입력과 결과 시퀀스가 같으면 **입력 참조를 그대로 반환**한다(불필요한 커밋 방지).
 *
 * 규칙 4 의 구현 메모: 이 함수는 **삽입만** 하고 재정렬·제거를 하지 않으므로
 * 「시퀀스 동일」 ⟺ 「한 건도 삽입하지 않음」이다. 그래서 배열 비교 없이 `inserted`
 * 플래그로 판정한다 — 등가이고 O(1) 이다. 재정렬을 여기 더하면 이 등가가 깨지니,
 * 그때는 시퀀스 비교로 바꿔야 한다.
 *
 * ⚠ 재정렬을 여기서 하지 마라. `added` 안에서 실전이 기본보다 앞서 있는 경우(예:
 *   사용자가 실전을 먼저 체크하고 기본을 나중에 체크)는 규칙 2 에 걸려 **손대지 않는다**.
 *   그 축의 정본은 `withPassageGroupedOrder`(§4-3 D-ORDER-1)의 그룹 내부 랭크 정렬이고,
 *   재정렬 지점을 둘로 늘리는 것이 바로 「배지 1,2,3 인데 인쇄는 3,1,2」의 재발 제조법이다.
 *
 * ⚠ 결과를 `latchPickedCards(added)` 에도 **그대로** 넘겨라 — 동반 픽된 카드가 펴진다.
 *   단 E28 픽 래치의 `prev.has(pid)` 가드(「손으로 접은 카드는 픽이 늘어도 접힌 채」)를
 *   우회하지 마라(우회 = E28 C1 증상 재발).
 */
export function withBasicCompanions<
  T extends { planMarker: string; passageId: string; reportId: string },
>(
  added: readonly T[],
  allRows: readonly T[],
  picked: ReadonlySet<string>,
): readonly T[] {
  if (added.length === 0) return added;

  // 규칙 2 의 「이번 added 에 이미 들어 있는가」 — reportId 기준.
  const addedIds = new Set<string>();
  for (const it of added) addedIds.add(it.reportId);

  // `allRows` 는 지문 300 × 문서 3 규모라 매번 선형 탐색하면 최악 O(n·m) 이다.
  // 동반이 실제로 필요할 때만 인덱스를 만든다(비-PRIME 픽이 0건이면 비용 0).
  let basicByPassage: Map<string, T> | null = null;
  const findBasic = (passageId: string): T | undefined => {
    if (basicByPassage === null) {
      basicByPassage = new Map<string, T>();
      for (const row of allRows) {
        if (row.planMarker !== PRIME_REPORT_MARKER) continue;
        // 지문당 PRIME 은 1행이 정본(DB 실측: (passageId, generationPlan) 625 그룹 전부
        // n_rows=1). 그래도 **첫 행 고정**으로 결정론을 못박는다 — 나중 행으로 덮이면
        // 같은 입력이 다른 결과를 내고 규칙 4 의 수렴 전제가 흔들린다.
        if (!basicByPassage.has(row.passageId)) {
          basicByPassage.set(row.passageId, row);
        }
      }
    }
    return basicByPassage.get(passageId);
  };

  const insertedIds = new Set<string>();
  const out: T[] = [];
  let inserted = false;

  for (const it of added) {
    // 빈 passageId 는 「지문 미상」이지 「같은 지문」이 아니다 — 빈 키끼리 매칭시키면
    // 남의 지문 기본 행을 끌어와 담는다(문항 축이 `""` 를 꼬리 그룹으로 격리하는 것과
    // 같은 이유). `!it.passageId` 로 빈 문자열·undefined 를 함께 거른다.
    if (it.planMarker !== PRIME_REPORT_MARKER && it.passageId) {
      const basic = findBasic(it.passageId);
      if (
        basic !== undefined &&
        !picked.has(basic.reportId) &&
        !addedIds.has(basic.reportId) &&
        !insertedIds.has(basic.reportId)
      ) {
        // 규칙 1 — **그 항목 바로 앞에** 삽입한다(뒤가 아니다).
        insertedIds.add(basic.reportId);
        out.push(basic);
        inserted = true;
      }
      // else = 규칙 2(이미 담김) 또는 규칙 3(기본 행 부재) → 무동작.
    }
    out.push(it);
  }

  // 규칙 4 — 삽입 0건이면 입력 참조 그대로.
  if (!inserted) return added;
  return out;
}
