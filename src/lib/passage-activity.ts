// ============================================================================
// 지문 「생성 중」 활동 표식 — 호스트 중립 계약
//
// "이 지문에 대해 지금 무언가 생성되고 있다"를 지문 행/카드가 **스스로** 말하기
// 위한 최소 계약이다. 소비처는 PassageCardGrid 의 additive prop `rowActivity`
// (→ PassageListRow) 이고, 조립은 각 호스트(스튜디오 오케스트레이터 등)가 한다.
//
// ── 여기 넣지 않는 것 ──────────────────────────────────────────────────────
// 진행 **내역**(스트림 꼬리·경과 시계·난이도/플랜 배지·재시도)은 큐 스트립
// (studio/workbench/passage-dossier-pane.tsx)의 몫이고, 이 계약은 표식 하나다.
// 지문 목록은 가상화 없는 단일 리스트(수백 행 — passage-list-row.tsx 주석의
// 871ms 커밋 실측)라, 행마다 라이브 값을 들면 폴링·SSE 델타 틱이 그대로 목록
// 전체의 커밋 비용이 된다. **경과 시계를 여기 넣지 않은 것도 같은 이유다** —
// 초당 1회 갱신이 곧 초당 1회 목록 리렌더다.
//
// ⚠ 계약: 값 객체는 **잡의 생멸 시에만** 새로 만들어야 한다. 소비처가
//   memo(PassageListRow) 뒤에 있어서, 내용이 같은데 참조만 새로 나오면 memo 가
//   통째로 무력화된다(그리고 아무도 눈치채지 못한다). 조립부는 반드시
//   passageActivitySignature 로 시그니처 메모를 걸어 참조를 고정할 것.
// ============================================================================

/**
 * 무엇이 도는 중인가 — 라벨 **자구**는 호스트가 만들고, 이 축은 대표 선정
 * (한 지문에 여러 잡이 동시에 돌 때)과 톤 분기에만 쓴다.
 *   · sheet     — 학습지 계열(섹션 분석·학습지 3상품)
 *   · exam      — 실전 워크북(워크시트 라우트 동기 잡)
 *   · questions — 실전 문제(문항 세션 큐)
 */
export type PassageActivityKind = "sheet" | "exam" | "questions";

export interface PassageActivity {
  /** 대표 종류 — 동시 진행 시 KIND_RANK 우선순위로 하나만 남는다 */
  kind: PassageActivityKind;
  /** 행에 그대로 찍히는 짧은 자구 — 예: "기본 학습지 생성 중" */
  label: string;
  /** 이 지문에서 **동시에** 도는 잡 수. 1 이면 "외 N" 미표시 */
  jobs: number;
}

export type PassageActivityMap = ReadonlyMap<string, PassageActivity>;

/** 미전달 호스트·빈 상태용 참조 안정 빈 맵(매번 new Map() 금지 — memo 방어선) */
export const EMPTY_PASSAGE_ACTIVITY: PassageActivityMap = new Map();

/**
 * 대표 종류 우선순위(낮을수록 앞).
 *
 * 학습지(sheet)가 문항(questions)보다 앞인 이유: 학습지 발사는 지문당 활성 잡
 * 1개가 서버 보장이라 "이 지문이 지금 묶여 있다"는 사실을 가장 정확히 말하고,
 * 사용자가 그 위에 문항을 얹어 쏘는 순서라 나중 것이 먼저 것을 라벨에서
 * 밀어내면 진행 표시가 도중에 뒤바뀐 것처럼 보인다. exam 은 그 사이.
 */
const KIND_RANK: Record<PassageActivityKind, number> = {
  sheet: 0,
  exam: 1,
  questions: 2,
};

/** 조립 입력 — 호스트는 원천(큐/잡 배열)을 이 평면 항목으로만 펼치면 된다. */
export interface PassageActivityEntry {
  passageId: string;
  kind: PassageActivityKind;
  label: string;
}

/**
 * 평면 항목 → 지문별 표식. **원천(잡) 기준 1패스**라 O(잡)이다
 * (지문 목록을 돌며 잡 배열을 find 하는 O(지문×잡)이 아니다 — 목록이 수백
 * 행이고 잡은 보통 한 자릿수라 이 방향이 항상 싸다).
 *
 * 대표 = KIND_RANK 최소, 동률이면 **먼저 들어온 것**(호출부 순서가 곧 계약).
 * jobs = 그 지문의 전체 항목 수(종류 불문 — 사용자에게는 "몇 개가 도는가"가
 * 곧 정보다).
 */
export function collectPassageActivity(
  entries: Iterable<PassageActivityEntry>,
): Map<string, PassageActivity> {
  const map = new Map<string, PassageActivity>();
  for (const e of entries) {
    const prev = map.get(e.passageId);
    if (!prev) {
      map.set(e.passageId, { kind: e.kind, label: e.label, jobs: 1 });
      continue;
    }
    // 동률(<= 아님)에서 교체하지 않는다 — 먼저 들어온 것이 대표.
    const takeover = KIND_RANK[e.kind] < KIND_RANK[prev.kind];
    map.set(e.passageId, {
      kind: takeover ? e.kind : prev.kind,
      label: takeover ? e.label : prev.label,
      jobs: prev.jobs + 1,
    });
  }
  return map;
}

/**
 * 참조 고정용 시그니처 — 이 문자열이 같으면 직전 맵을 그대로 재사용한다
 * (studio-home-client 의 queueItemsSig·sessionQueueSig 와 동일 관용구).
 *
 * ⚠ 직렬화 대상은 전부 **잡 생멸 시에만 변하는 정적 값**이어야 한다. 라이브
 *   값(경과·스트림 꼬리)을 이 계약에 들이면 시그니처가 틱마다 흔들려 메모가
 *   사문화된다 — 그런 값은 애초에 PassageActivity 에 없다(파일 머리 주석).
 */
export function passageActivitySignature(map: PassageActivityMap): string {
  const parts: string[] = [];
  for (const [id, a] of map) parts.push(`${id}:${a.kind}:${a.jobs}:${a.label}`);
  // Map 삽입 순서는 원천 배열 순서(폴링마다 흔들릴 수 있다)라 정렬해 안정화.
  parts.sort();
  return parts.join("|");
}
