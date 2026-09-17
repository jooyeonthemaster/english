// ============================================================================
// 스튜디오 목록 조회 상태 타입 정본 (§3.10.23 E24 · U2/U5)
// ----------------------------------------------------------------------------
// 왜 판 파일이 아니라 lib 인가:
//   이 두 타입은 원래 `studio/workbench/class-questions-pane.tsx` ·
//   `studio/workbench/class-worksheets-pane.tsx` 가 각자 export 하던 것이다.
//   E24 가 그 두 판을 **삭제**한다(자산 뷰가 3필로 접히면서 목록판이
//   ComposerListPane 단일 인스턴스로 수렴 — E24-SPEC §1④).
//   **두 판이 삭제돼도 타입은 살아야 한다.** 타입을 판 파일에 얹어 둔 채로
//   판을 지우면 fetch 소유자(`library-pane.tsx`)와 렌더 소비자
//   (`composer-list-pane.tsx`)가 **동시에** 무너져, 같은 커밋의 다른 회귀를
//   전부 tsc 노이즈 뒤에 숨긴다.
//
// 이 파일의 지위:
//   `library-pane` 이 이 모양으로 상태를 **만들고**, `composer-list-pane` 이
//   이 모양을 **읽는다**. 두 파일의 유일한 접점이므로, 여기를 고치는 사람은
//   반드시 양쪽을 함께 고쳐야 한다. 어느 한쪽에 로컬 사본을 두지 마라 —
//   모양이 갈리는 순간 「스켈레톤이 안 걷힌다」류 결함이 조용히 열린다.
//
// ⚠ 이사 순서는 「① 이 파일 신설 → ② import 재조준 → ③ 판 파일 삭제」로
//   **강제**한다. 순서를 뒤집으면(판 먼저 삭제) tsc 가 붕괴한다.
// ============================================================================

import type { StudioClassQuestionRow } from "@/lib/studio/dossier-types";
import type { StudioClassWorksheetRow } from "@/actions/studio/worksheets";

/**
 * 문항 축 조회 상태 — `idle` 은 **뷰 최초 진입 전**이다(빈 결과가 아니다).
 * 이 구분이 목록판의 스켈레톤/빈 상태 분기를 가른다: `idle`·`loading` 은
 * 스켈레톤, `ready` + rows 0 만 「없습니다」다. 둘을 합치면 미조회가
 * 「0건」으로 위조돼 사용자가 자료 유실로 오해한다.
 */
export interface ClassQuestionsState {
  status: "idle" | "loading" | "error" | "ready";
  rows: StudioClassQuestionRow[];
  error?: string;
  /** 서버 상한 절단 여부 — 판이 각주로 고지한다(부재 ≠ 삭제) */
  truncated?: boolean;
}

/**
 * 학습지 축 조회 상태 — 위 문항 축과 **동형**을 유지한다(판이 두 축을 한
 * 목록에 병합하므로 모양이 갈리면 분기가 두 벌이 된다).
 */
export interface ClassWorksheetsState {
  status: "idle" | "loading" | "error" | "ready";
  rows: StudioClassWorksheetRow[];
  error?: string;
  /**
   * **E24 신설**(§1⑩). 서버가 `take: 300`/`take: 900` 으로 조용히 자르던 것을
   * 문항 축과 동형으로 고지한다. 「학습지 조판」이라는 전용 방을 만들어 놓고
   * 목록이 무고지로 잘리면 사용자는 절단이 아니라 **유실/버그로 해석**한다.
   * 옵셔널인 이유: 액션이 이 필드를 additive 로 얹는 중이라, 아직 없는 응답도
   * 안전하게 읽혀야 한다(호스트가 `?? false` 로 흡수).
   */
  truncated?: boolean;
}
