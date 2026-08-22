// ============================================================================
// E27 조판 목차 · 스크롤 채널 — **순수 타입 계약** (`.tmp-worksheet-compose/E27-SPEC.md` §4)
//
// 이 파일이 존재하는 이유는 하나다: 조판 표면(`sheet-compose-surface.tsx`) · 편집기
// (`AnalysisReportEditor.tsx`) · 목차 팝오버(`section-outline-popover.tsx`) 세 파일이
// **서로를 import 하지 않고** 같은 모양을 공유해야 하기 때문이다. 표면이 편집기 타입을
// 가져오면 클라이언트 번들이 서로를 끌어당기고, 팝오버가 표면 타입을 가져오면
// prisma 가 딸려 오는 경로가 열린다(`sheet-pick-types.ts` 가 같은 이유로 존재한다).
//
// **런타임 import 0 · 값 export 0.** 타입만 둔다.
// ============================================================================

/**
 * 조판 목차의 항목 1건.
 *
 * `kind:"doc"` 은 학습지 문서, `kind:"question"` 은 조판에 얹은 시험지 문항이다.
 * 두 축을 한 배열에 섞는 이유는 인쇄 순서가 실제로 섞여 있기 때문이다
 * (지문 그룹 안에서 「학습지들 → 그 지문 문제들」).
 */
export type ComposeOutlineEntry =
  | {
      kind: "doc";
      /** React key 겸 프로브 식별자. 학습지는 reportId 를 그대로 쓴다. */
      key: string;
      /**
       * 부착 문서의 docKey. **`null` 이면 활성(편집 중) 문서**다.
       * 활성 문서는 합성 스트림에서 접미가 없어 표면이 앵커 id 를 알 수 없으므로,
       * 편집기가 `composed.flowItems` 에서 첫 아이템을 해석한다(E27-SPEC R3-2).
       */
      docKey: string | null;
      /** 문서 제목(1줄) */
      label: string;
      /** 보조 라벨 — 플랜 마커("기본"/"파이널" 등) */
      sub?: string;
      /** 지금 편집 중인 문서인가(목차에서 「편집 중」 배지) */
      active?: boolean;
    }
  | {
      kind: "question";
      key: string;
      /**
       * 스크롤 앵커 = 문항 논리 블록 id(`qb-{questionId}` — `question-ids.ts` questionOrderId).
       * 문항은 표면이 순수 문자열로 정확히 계산할 수 있어 docKey 우회가 필요 없다.
       */
      blockId: string;
      /** 문항 유형 라벨 */
      label: string;
      sub?: string;
      /** 인쇄 순서 번호(1..N) — 목차 배지 */
      no: number;
    };

/** 지문 1건 = 목차의 한 그룹. 그룹 순서가 곧 인쇄 순서다. */
export interface ComposeOutlineGroup {
  /** React key — passageId */
  key: string;
  /** 그룹 머리 라벨 */
  passageTitle: string;
  entries: ComposeOutlineEntry[];
}

/**
 * 편집기에 보내는 스크롤 대상.
 * - `block` : 논리 블록 id 를 표면이 이미 아는 경우(문항).
 * - `doc`   : 문서의 첫 아이템으로. `docKey:null` = 활성 문서.
 */
export type ComposeScrollTarget =
  | { kind: "block"; id: string }
  | { kind: "doc"; docKey: string | null };

/**
 * 표면 → 편집기 스크롤/글로우 요청.
 *
 * **`nonce` 원시값만 effect deps 에 넣어야 한다.** 이 객체를 deps 에 그대로 넣으면
 * 요청이 없을 때도 참조가 매 렌더 바뀌어 문서 전체 재측정(실측 489ms)이 돈다.
 * 같은 대상을 다시 요청하려면 nonce 만 올린다(사내 선례: `vocabTestActivateNonce`).
 */
export interface ComposeScrollRequest {
  target: ComposeScrollTarget;
  nonce: number;
}
