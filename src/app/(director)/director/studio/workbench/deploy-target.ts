// ============================================================================
// 클래스 스튜디오 워크벤치 — 배포 대상·생성 큐 공유 계약 (docs/class-studio-spec.md §3.10.9)
//
// 좌측 레일(클래스+학생 체크)과 우측 도시에(배포 실행대·생성 스트립)를 잇는
// 순수 타입 파일 — 런타임 코드 없음. 조립은 전부 오케스트레이터
// (studio-home-client) 소유이고, 소비처(passage-dossier-pane·dossier-deploy-inline)
// 는 읽기 전용이다.
// ============================================================================

/** 좌측 레일 체크 상태를 배포 실행대가 소비하는 형태로 접은 것 — 오케스트레이터 조립 */
export interface StudioDeployTarget {
  classId: string;
  className: string;
  /** 체크 확정 학생(로스터 로드 완료 후) — 배포 버튼은 loading 동안 비활성 */
  studentIds: string[];
  /** = studentIds.length */
  count: number;
  /** 로스터 전체 수(미로드면 클래스 studentCount) */
  total: number;
  /** count < total — 레일에서 대상이 좁혀져 있음 */
  partial: boolean;
  /** 로스터 로딩 중(클래스 선택 즉시 자동 로드라 짧다) */
  loading: boolean;
}

/** 큐 스트립 v2 배지(§3.10.11-c) — 항목 생멸 시에만 변하는 정적 메타.
 *  라이브(초당) 값은 절대 넣지 않는다 — 시그니처 메모(queueItemsSig)에 직렬화되므로
 *  틱마다 변하는 값이 섞이면 memo(PassageDossierAccordion) 방어선이 무너진다. */
export interface DossierQueueBadges {
  /** 유형 라벨 — 2+ 유형이면 "어법 판단 외 2유형" 접기(오케스트레이터 조립) */
  type?: string;
  /** 총 문항 수(문항 항목 전용) */
  count?: number;
  /** "BASIC" | "INTERMEDIATE" | "KILLER" — 표시부가 라벨·톤 해석(킬러=rose) */
  difficulty?: string;
  /** 생성 플랜 — 프리미엄만 violet 배지, 일반은 미표시(소음 억제) */
  plan?: "STANDARD" | "PREMIUM";
}

/** 도시에 카드 「생성 중」 스트립 항목 — 오케스트레이터가 3원천(모듈 분석 큐·
 *  실전 워크북 잡·문항 세션 큐)을 접는다. 표시 전용 — 재시도·발사는 발사 지점 소관. */
export interface DossierQueueItem {
  /** 잡/큐 항목 id — 리스트 키. 스트림 스토어 키(streamKey)와 동일 문자열을 쓴다 */
  id: string;
  kind: "modules" | "exam" | "questions";
  /** 예: "어휘·빈칸 복원 생성 중" | "실전 워크북 생성 중" | "문제 3유형 생성 중" */
  label: string;
  status: "running" | "error";
  /** 정적 보조 라벨(오류 메시지 등 — 항목 생멸 시에만 변동, 라이브 stage 는
   *  스트림 스토어 경유) — 없으면 미표시 */
  detail?: string;
  /**
   * 스트림 스토어 구독 키(§3.10.11-b) — 있으면 표시부가 QueueStreamLine 을 이
   * 키로 마운트해 라이브 꼬리를 그린다. 스냅샷 자체는 여기 싣지 않는다(위 배지
   * 주석과 같은 이유 — 라이브 값은 스토어 구독으로만 흐른다).
   */
  streamKey?: string;
  /** 정적 배지 메타 — 문항 항목의 유형·수·난이도·플랜 */
  badges?: DossierQueueBadges;
  /** 발사 시각(ms epoch) — 표시부 경과시간(mm:ss) 재료. 라이브 값 아님 */
  startedAt?: number;
}
