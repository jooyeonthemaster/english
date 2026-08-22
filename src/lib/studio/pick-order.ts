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
// **런타임 의존 0 · JSX 0 · 부수효과 0.** 순수 함수만 둔다.
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
