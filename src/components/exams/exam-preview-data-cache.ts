// ============================================================================
// 시험지 미리보기 데이터 캐시 — 목록 카드 썸네일(ExamCardPaperPreview)과 카드 인쇄 대화상자
// (ExamPrintDialog)가 getExamPreviewData 결과를 **공유**한다.
//
// 왜: 보이는 카드는 썸네일이 이미 같은 데이터(submissions 제외, 큰 시험지는 약 1MB)를 받아 둔다.
// 인쇄 클릭 때 이를 재사용하면 네트워크가 0 이고, 같은 시험지 요청이 진행 중이면 그 프라미스에 합류한다.
//
// 규칙:
//  · 키 = examId + version(목록의 updatedAt). 버전이 다르면 새로 받는다(시험지 편집이 updatedAt 을 올린다 —
//    인쇄 · 내보내기 집계는 26-09-30부터 올리지 않는다, src/lib/exams/exam-print-count.ts).
//  · 끝난 결과는 TTL 3분 — 문제은행에서 문항을 고쳐도 exam.updatedAt 은 그대로라 신선도 상한을 시간으로
//    둔다(신선도 상한 — docs/EXAM-PRINT-PIPELINE.md §2). 만료된 결과는 조회 때마다 걷어 낸다.
//  · 상한 48건(LRU). 12건이면 카드가 수십 장인 목록에서 스크롤만 해도 보이는 카드의 결과가 밀려나
//    인쇄 클릭이 다시 받는다(26-09-30 실측 — 84장 목록, 썸네일 45건). 마운트된 카드는 썸네일이 같은
//    객체를 들고 있어 캐시가 쥐는 추가 메모리는 화면에서 사라진 카드분뿐이고, 그것도 TTL 로 끝난다.
//  · 실패(throw)와 null(없음 · 권한 없음)은 캐시하지 않는다.
//  · 【우선순위】 Next 서버 액션은 클라이언트 큐에서 **한 번에 하나씩** 나간다(next 16 app-router-instance
//    runRemainingActions). 썸네일(low)이 화면의 카드 수만큼 한꺼번에 큐에 들어가 있으면 인쇄(high)
//    요청이 그 뒤에 줄 서 수십 초를 기다렸다(26-09-30 개발 서버 실측 — 썸네일 12건 뒤 43초). 그래서
//    low 는 이 모듈이 **한 건씩만** 서버 액션 큐로 흘려 보내고, high 는 즉시 보낸다 → 인쇄는 진행 중인
//    썸네일 1건 뒤에만 선다. 서버 액션이 원래 직렬이라 썸네일 처리량은 그대로다.
// 모듈 전역 상태라 탭(문서) 단위로 산다. 클라이언트 컴포넌트 전용.
// ============================================================================

import { getExamPreviewData } from "@/actions/exams";

export type ExamPreviewData = NonNullable<Awaited<ReturnType<typeof getExamPreviewData>>>;
export type ExamPreviewPriority = "high" | "low";

const TTL_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 48;

interface CacheEntry {
  key: string;
  promise: Promise<ExamPreviewData | null>;
  /** 결과가 도착한 시각(대기 · 진행 중이면 null) — TTL 기준 */
  settledAt: number | null;
  /** 서버 액션을 보냈는가 */
  started: boolean;
  /** 지금 바로 보낸다(대기 중이면 high 로 승격) */
  startNow: () => void;
}

// examId → 엔트리(시험지당 최신 버전 1건). Map 삽입 순서 = LRU 순서(앞이 가장 오래됨).
const entries = new Map<string, CacheEntry>();
// low 대기열 — 한 번에 하나만 서버 액션 큐로 보낸다.
const lowQueue: CacheEntry[] = [];
let lowInFlight = false;

/** 버전 정규화 — Date · ISO 문자열 · 없음을 같은 키로 맞춘다. */
function versionKey(version: string | Date | null | undefined): string {
  if (version == null) return "";
  if (version instanceof Date) return String(version.getTime());
  const parsed = Date.parse(version);
  return Number.isNaN(parsed) ? version : String(parsed);
}

function isFresh(entry: CacheEntry, now: number): boolean {
  return entry.settledAt === null || now - entry.settledAt < TTL_MS;
}

function pruneExpired(now: number) {
  for (const [examId, entry] of entries) {
    if (!isFresh(entry, now)) entries.delete(examId);
  }
}

function touch(examId: string, entry: CacheEntry) {
  entries.delete(examId);
  entries.set(examId, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest); // 대기자는 자기 프라미스를 쥐고 있어 영향 없다(대기열의 요청도 그대로 나간다)
  }
}

function pumpLow() {
  while (!lowInFlight && lowQueue.length > 0) {
    const next = lowQueue.shift()!;
    if (next.started) continue; // high 로 승격돼 이미 나갔다
    lowInFlight = true;
    next.startNow();
    next.promise.then(release, release);
  }
}

function release() {
  lowInFlight = false;
  pumpLow();
}

function createEntry(examId: string, key: string): CacheEntry {
  let resolve!: (value: ExamPreviewData | null) => void;
  let reject!: (error: unknown) => void;
  const entry: CacheEntry = {
    key,
    promise: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    settledAt: null,
    started: false,
    startNow: () => {
      if (entry.started) return;
      entry.started = true;
      getExamPreviewData(examId).then(
        (data) => {
          if (entries.get(examId) === entry) {
            if (data) entry.settledAt = Date.now();
            else entries.delete(examId);
          }
          resolve(data);
        },
        (error: unknown) => {
          if (entries.get(examId) === entry) entries.delete(examId);
          reject(error);
        },
      );
    },
  };
  return entry;
}

/**
 * 미리보기 데이터(ExamDetail 형태, submissions 빈 배열)를 캐시에서 받거나 새로 받는다.
 * null = 시험지가 없거나 이 학원 것이 아니다. 네트워크 · 서버 오류는 reject 한다(캐시 안 함).
 * priority: 썸네일은 "low"(한 건씩), 사용자가 기다리는 인쇄는 "high"(즉시 · 대기 중인 같은 요청은 승격).
 */
export function loadExamPreviewData(
  examId: string,
  version?: string | Date | null,
  priority: ExamPreviewPriority = "high",
): Promise<ExamPreviewData | null> {
  const key = `${examId}@${versionKey(version)}`;
  pruneExpired(Date.now());
  const hit = entries.get(examId);
  if (hit && hit.key === key) {
    touch(examId, hit);
    if (priority === "high") hit.startNow();
    return hit.promise;
  }

  const entry = createEntry(examId, key);
  touch(examId, entry);
  if (priority === "high") {
    entry.startNow();
  } else {
    lowQueue.push(entry);
    pumpLow();
  }
  return entry.promise;
}

/** 시험지가 바뀐 것을 아는 호출부(편집 저장 등)가 캐시를 버린다. */
export function invalidateExamPreviewData(examId: string) {
  entries.delete(examId);
}
