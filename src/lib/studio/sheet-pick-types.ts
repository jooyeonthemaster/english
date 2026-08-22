// ============================================================================
// 학습지 조판 픽 메타 정본 (docs/class-studio-spec.md §3.10.21 E21-5)
//
// 「학습지 조판」은 도시에 Sec「학습지」행(passage-dossier-pane.tsx)과 「학습지 조판」
// 뷰 병합 목록 행(composer-list-pane.tsx) **두 표면**에서 발사되지만, 체크 상태는
// 오케스트레이터(studio-home-client.tsx:1409-1414 주석 — 우측 본문이 aside/드로어
// 2트리에 렌더되어 별개 인스턴스가 되므로 상태는 반드시 상위 소유)가 하나로
// 소유한다. 그 `pickedSheets: Map<reportId, SheetPickMeta>`(삽입 순서 = 조판 순서)의
// 값 타입이 이 파일이다 — 두 표면이 각자 다른 모양을 밀어 넣으면 조판 헤더 칩과
// 문서 로더(actions/studio/worksheet-docs.ts)가 서로 다른 물건을 가리킨다.
//
// 순수 타입만 — **런타임 import 0**. 서버 액션 파일에서 이 타입을 재수출하지 마라:
// 행 컴포넌트는 클라이언트라 액션 모듈을 타고 prisma 가 번들에 딸려온다
// (dossier-types.ts 가 같은 이유로 존재한다 — 그 파일 1-3행 주석 참조).
// ============================================================================

/**
 * 조판 대기열에 담긴 학습지 1건의 최소 식별 정보.
 *
 * 필드는 **두 표면이 이미 갖고 있는 값**만으로 채울 수 있게 골랐다(신규 질의 0):
 * - 「학습지 조판」 뷰 병합 목록 행: `StudioClassWorksheetRow`
 *   (actions/studio/worksheets.ts:29-41)가 6필드를 그대로 갖고 있어 부분집합 복사로 끝난다.
 * - 도시에 Sec「학습지」행: `DossierSheetRow`(lib/studio/dossier-types.ts:83-91)에는
 *   passageId/passageTitle 이 없다 — 도시에는 지문 1건 스코프라 `data.passage.id`·
 *   `data.passage.title`(actions/studio/dossier.ts:500-506)에서 채운다.
 *
 * `pages`(수 MB)는 절대 싣지 않는다 — 문서 본문은 조판 시점에 getStudioWorksheetDocs
 * 가 reportId 로만 가져온다(§12 슬림 계약, dossier-types.ts:81 과 동일 규약).
 */
export interface SheetPickMeta {
  /** PassageReport.id — Map 키이자 문서 로더 입력 정본 */
  reportId: string;
  /**
   * 이 보고서가 매달린 지문 id. 저장 PATCH 경로
   * `/api/workbench/passage-reports/prime/{passageId}` 와 모바일 배포
   * (StudioDeployInput.passageId)가 **reportId 가 아니라 이 값**으로 흐른다.
   * save-as 가 사본마다 새 passage 를 만들므로(save-as/route.ts:188 tx.passage.create)
   * **save-as 사본**은 원본과 passageId 가 다르다 — 행마다 따로 들고 있어야 한다.
   *
   * ⚠ (E27 정정) 이 문장의 구판은 「PRIME_KO/PRIME_FINAL 행은 원본과 passageId 가 다르다」
   *   였는데 **거짓**이다. 정상 생성 경로는 marker 만 갈라 **같은 passageId 로 upsert** 한다
   *   (`prime/[passageId]/route.ts:102-110` `where: { passageId, generationPlan: marker }`).
   *   passageId 가 갈리는 것은 save-as 사본뿐이고, 사본은 Question 도 StudioClassPassage
   *   링크도 복제하지 않아 클래스 병합 목록에 애초에 뜸지 않는다.
   *   DB 실측(2학년 클래스, `.tmp-worksheet-compose/_e27-db-fixture.mts`): PRIME + PRIME_FINAL
   *   2행이 같은 passageId(`cmst52g9f…`), contentHash 중복 그룹 0건.
   *   이 사실이 **E27 지문 단위 인터리브의 그룹핑 키 근거**다(§3.10.26 R1-1) — 구판
   *   문장을 그대로 믿으면 「같은 지문의 학습지 2장이 서로 다른 그룹으로 갈린다」고 오판한다.
   */
  passageId: string;
  /** 보고서 제목(문서 칩 라벨) */
  title: string;
  /** 지문 제목 — 문서 칩 보조 라벨. 제목이 겹치는 사본 구분용 */
  passageTitle: string;
  /** "PRIME" | "PRIME_KO" | "PRIME_FINAL" — 미지 마커는 표시부가 원문 폴백.
   *  배포 가능 판정은 sheet-deploy-eligibility.ts 1곳에서만 한다. */
  planMarker: string;
  /** "DRAFT" | "PUBLISHED" | "ARCHIVED" — DB 컬럼은 String(schema 주석 계약) */
  status: string;
}
