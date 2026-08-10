"use client";

// ============================================================================
// 전역 fast(인라인) 생성 동시성 제한기.
//
// 문제 생성을 "돌려둔 채" 새 생성을 바로바로 시작할 수 있게 하려면(배치 간 락 해제),
// 동시에 떠 있는 fast 생성 요청 수를 "앱 전체"에서 묶어야 한다. 예전처럼 배치마다
// runWithConcurrency(units, 5) 를 쓰면, N개 배치가 겹쳐 돌 때 5×N 개가 한꺼번에 떠
// Gemini 레이트리밋/서버 과부하가 난다. 이 모듈이 모든 fast 생성의 단일 관문이다.
//
// 모듈 싱글톤(클라이언트 한 탭당 하나) — React 리렌더와 무관하게 in-flight 수를 유지.
// ============================================================================

// 동시성 상한은 use-generation-handlers 의 FAST_BATCH_CONCURRENCY 와 동일 규칙으로
// 직접 읽는다(그쪽을 import 하면 순환 의존이 생김 — handlers 가 이 모듈을 import 하므로).
function readMaxConcurrency(): number {
  const raw = process.env.NEXT_PUBLIC_WORKBENCH_FAST_BATCH_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(5, Math.floor(parsed)));
}

const MAX_CONCURRENCY = readMaxConcurrency();

let activeCount = 0;
const pending: Array<() => void> = [];

function pump() {
  while (activeCount < MAX_CONCURRENCY && pending.length > 0) {
    const start = pending.shift();
    if (!start) break;
    activeCount += 1;
    start();
  }
}

/**
 * task 를 전역 동시성 상한(FAST_BATCH_CONCURRENCY) 안에서 실행한다. 상한을 넘으면
 * 큐잉됐다가 슬롯이 비는 대로 실행된다. 반환 Promise 는 task 의 결과/오류를 그대로 전달.
 */
export function scheduleFastGeneration<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.push(() => {
      let settled: { ok: true; value: T } | { ok: false; error: unknown };
      task()
        .then(
          (value) => {
            settled = { ok: true, value };
          },
          (error) => {
            settled = { ok: false, error };
          },
        )
        .finally(() => {
          activeCount -= 1;
          pump();
          if (settled.ok) resolve(settled.value);
          else reject(settled.error);
        });
    });
    pump();
  });
}

// 낙관적 큐 아이템 id(tempId) 의 배치 토큰. Date.now() 는 같은 ms 에 연속으로 시작한
// 두 배치에서 충돌할 수 있어(특히 같은 지문+유형이 겹칠 때), 세션 단조 증가 카운터로
// 배치마다 전역 유일한 토큰을 발급한다.
let runTokenCounter = 0;
export function nextGenerationRunToken(): number {
  runTokenCounter += 1;
  return runTokenCounter;
}

// ── 변형본 제목 교차배치 예약 ───────────────────────────────────────────────
// 연속 생성 시, 직전 배치가 만든 변형본 제목이 아직 passages 목록에 반영되기 전이라도
// 다음 배치가 같은 제목을 또 만들지 않도록, 한 세션 동안 발급한 변형본 제목을 기억한다.
const reservedVariantTitles = new Set<string>();

export function getReservedVariantTitles(): Set<string> {
  return reservedVariantTitles;
}

export function reserveVariantTitle(title: string): void {
  reservedVariantTitles.add(title);
}
