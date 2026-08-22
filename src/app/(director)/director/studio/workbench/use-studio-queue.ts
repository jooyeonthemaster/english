"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 생성 큐 엔진 (docs/class-studio-spec.md §3.7.2)
//
// usePassageQueue 를 **워크벤치당 정확히 1개** 인스턴스화한다(§12 폴러 1개 규칙 —
// 좌/중/하단이 각자 훅을 부르면 5초 폴링이 배수로 늘어 egress 폭탄 재현).
// cacheKey 는 `studio-analysis:${academyId}` — passages/create 계열(cacheKey
// `passage-analysis:${academyId}`)과 다른 키라 모듈 전역 캐시가 라우트 전환 시
// 상대 로컬 큐를 비우는 것은 알려진 트레이드오프(낙관 카드만 소실, 서버 잡은 폴링 복원).
//
// 발사 = 섹션 종량제(모듈 필요 섹션 합집합을 targetSections 로) — 프롬프트 config
// 의 targetSections 는 부재 시 body 에 실리지 않으므로 기존 정액 경로 무회귀(§11).
// 실전 문제(exam)는 분석 큐가 아니라 워크시트 라우트 동기 잡(§3.7.3)으로 따로 관리.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  usePassageQueue,
  type AnalysisPromptConfig,
  type QueuedPassage,
} from "@/hooks/use-passage-queue";
import {
  MODULE_REQUIRED_SECTIONS,
  isSectionBackedModuleId,
  type SectionBackedModuleId,
} from "@/lib/studio/module-sections";
import type { StudioModuleId } from "@/lib/studio/modules";
import {
  isStudioSheetVariant,
  sheetPromptFlags,
  type StudioSheetVariant,
} from "@/lib/studio/sheet-products";

/** 발사 시점의 워크벤치 컨텍스트 — 도크의 「바로 배포」가 소비한다(§3.7.2-②). */
export interface StudioQueueStamp {
  classId: string | null;
  modules: StudioModuleId[];
  /**
   * 학습지 상품 발사 표식(§3.10.19 E19-4, additive) — 「생성 중」 스트립 라벨이
   * "무엇을 만드는 중인가"를 말하려면 필요하다. 부재 = 구 섹션 종량제 발사
   * (스탬프 영속 복원분 포함 — 구 스탬프 무회귀).
   */
  sheet?: StudioSheetVariant;
}

export interface StudioLaunchPassage {
  id: string;
  title: string;
  content: string;
}

/** 실전 학습지(워크시트 라우트) 동기 잡 카드 상태(§3.7.3). */
export interface StudioWorksheetJob {
  passageId: string;
  title: string;
  status: "running" | "done" | "error";
  error?: string;
  classId: string | null;
  /**
   * 발사 시각(ms epoch) — 도시에 큐 스트립 경과 표시 재료(§3.10.11-c).
   * running 생성 시에만 기록한다 — 영속 복원분(done)은 스트립이 그리지
   * 않으므로(스트립은 running/error 만) 부재가 무해하다.
   */
  startedAt?: number;
}

export interface StudioQueueApi {
  /** 병합 큐(로컬 낙관 + 서버 잡 폴링) — 학원 전체 분석 잡이 보인다 */
  queue: QueuedPassage[];
  activeCount: number;
  /** passageId → 이 워크벤치에서 발사한 컨텍스트(다른 표면 발사 잡은 없음) */
  stamps: ReadonlyMap<string, StudioQueueStamp>;
  worksheetJobs: StudioWorksheetJob[];
  /**
   * 섹션 종량제 발사 — analyzing 지문은 걸러 반환(호출부가 토스트).
   * ⚠ §3.10.19 E19-0 으로 스튜디오 표면의 호출부는 사라졌지만 **삭제 금지**:
   * 영속 스탬프 복원분의 modules 배열 호환·§3.4 지문 스튜디오 표면이 존치한다.
   */
  launchModules: (
    passages: StudioLaunchPassage[],
    modules: SectionBackedModuleId[],
    classId: string | null,
  ) => { launched: number; skipped: string[] };
  /**
   * 학습지 3상품 발사(§3.10.19 E19-4) — **전체 분석 경로**다.
   * targetSections 를 싣지 않는 것이 계약: 실으면 fast 라우트가
   * finalOnepage/includeWorksheet 조합을 400 으로 막는다(route.ts:284-303).
   */
  launchSheets: (
    passages: StudioLaunchPassage[],
    variant: StudioSheetVariant,
    classId: string | null,
  ) => { launched: number; skipped: string[] };
  /** 실전 학습지 생성(+5크레딧, 리포트 선존재 필수 — 시트가 게이트) */
  launchWorksheet: (
    passage: { id: string; title: string },
    classId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  retryAnalysis: (passageId: string) => void;
}

const EMPTY_PROMPT: Omit<AnalysisPromptConfig, "targetSections"> = {
  customPrompt: "",
  focusAreas: [],
  targetLevel: "",
};

// ── 스탬프·실전 잡 영속 (2026-08-11 — "새로고침하니 큐가 다 사라졌다" 실사용 지적) ──
//
// 도크의 종결(완료/실패) 카드는 스탬프 있는 항목만 보여주는데, 스탬프가 메모리
// 뿐이면 새로고침에 증발해 방금 만든 학습의 「바로 배포」 동선이 끊긴다.
// localStorage 에 학원 단위로 영속하고, 오래된 항목은 48시간/최대 40건으로
// 걷어낸다(역사 전체가 "완료 N건"으로 쏟아지는 소음 방지 — 스탬프 필터 원칙 유지).

const STAMP_TTL_MS = 48 * 60 * 60 * 1000;
const STAMP_CAP = 40;

interface PersistedStudioQueue {
  stamps: Record<string, StudioQueueStamp & { at: number }>;
  /** running 은 저장하지 않는다 — 새로고침으로 요청이 죽은 상태라 거짓 표시가 된다 */
  worksheetJobs: (StudioWorksheetJob & { at: number })[];
}

function storageKeyFor(academyId: string): string {
  return `studio-queue-stamps:${academyId}`;
}

function loadPersisted(academyId: string): PersistedStudioQueue {
  const empty: PersistedStudioQueue = { stamps: {}, worksheetJobs: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(academyId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedStudioQueue>;
    const cutoff = Date.now() - STAMP_TTL_MS;
    const stamps: PersistedStudioQueue["stamps"] = {};
    for (const [pid, s] of Object.entries(parsed.stamps ?? {})) {
      if (s && typeof s.at === "number" && s.at >= cutoff && Array.isArray(s.modules)) {
        // sheet 는 additive — 미지 문자열이 스트립 라벨로 새지 않게 좁혀 담는다
        // (구 스탬프는 키 자체가 없어 undefined 로 남는다).
        stamps[pid] = isStudioSheetVariant(s.sheet) ? s : { ...s, sheet: undefined };
      }
    }
    // error 는 복원하지 않는다(§3.10 검수 L1-6): 도시에 「생성 중」 스트립에
    // 해제 수단 없는 과거 세션 실패가 최대 48시간 부활하던 원인. done 만 유지
    // (「바로 배포」 동선은 stamps 가 담당하므로 손실 없음).
    const worksheetJobs = (parsed.worksheetJobs ?? []).filter(
      (j) => j && typeof j.at === "number" && j.at >= cutoff && j.status === "done",
    );
    return { stamps, worksheetJobs };
  } catch {
    return empty;
  }
}

export function useStudioQueue({
  academyId,
  onJobsChanged,
}: {
  academyId: string;
  onJobsChanged?: () => void;
}): StudioQueueApi {
  const cacheKey = useMemo(() => `studio-analysis:${academyId}`, [academyId]);
  const { queue, activeCount, addManyToQueue, retryAnalysis } = usePassageQueue(
    undefined,
    { cacheKey, onJobsChanged },
  );

  // 스탬프는 렌더에 쓰이므로 state — 발사 직후 도크가 모듈 칩을 그린다.
  // 초기값은 영속본에서 복원(새로고침 후에도 완료 카드·바로 배포 동선 유지).
  const stampTimesRef = useRef<Map<string, number>>(new Map());
  const [stamps, setStamps] = useState<ReadonlyMap<string, StudioQueueStamp>>(() => {
    const persisted = loadPersisted(academyId);
    const map = new Map<string, StudioQueueStamp>();
    for (const [pid, s] of Object.entries(persisted.stamps)) {
      // sheet 를 함께 옮긴다(§3.10.19 E19-4) — 담을 때만 좁히고 꺼낼 때 버려서
      // loadPersisted 의 isStudioSheetVariant 좁힘(위 142행)이 여기까지 오지 못해
      // 사문이었다. 실측: 새로고침하면 큐 스트립이 「파이널 원페이지 생성 중」→
      // 「학습지 생성 중」으로 강등되고 실패 라벨도 3상품 구분을 잃었다.
      // 부재 시 키를 만들지 않는 스프레드 관용구 — 구 스탬프 무회귀(위 42행).
      map.set(pid, {
        classId: s.classId,
        modules: s.modules,
        ...(s.sheet ? { sheet: s.sheet } : {}),
      });
      stampTimesRef.current.set(pid, s.at);
    }
    return map;
  });
  // 실전 잡 최초 관측 시각(키=passageId) — stampTimesRef 와 동일 규약. 영속
  // effect 가 매 저장마다 at 을 now 로 재도장하면 저장이 있을 때마다 수명이
  // 연장돼 48h TTL 이 사문화되므로, 최초 시각을 여기 고정해 싣는다.
  const worksheetJobTimesRef = useRef<Map<string, number>>(new Map());
  const [worksheetJobs, setWorksheetJobs] = useState<StudioWorksheetJob[]>(() => {
    const persisted = loadPersisted(academyId).worksheetJobs;
    for (const j of persisted) worksheetJobTimesRef.current.set(j.passageId, j.at);
    return persisted;
  });
  const worksheetBusy = useRef<Set<string>>(new Set());

  // 변동 시 영속 — 최신순 캡(STAMP_CAP) 적용. running 실전 잡은 제외.
  useEffect(() => {
    try {
      const now = Date.now();
      const entries = [...stamps.entries()].map(([pid, s]) => {
        if (!stampTimesRef.current.has(pid)) stampTimesRef.current.set(pid, now);
        return [pid, { ...s, at: stampTimesRef.current.get(pid)! }] as const;
      });
      entries.sort((a, b) => b[1].at - a[1].at);
      const payload: PersistedStudioQueue = {
        stamps: Object.fromEntries(entries.slice(0, STAMP_CAP)),
        worksheetJobs: worksheetJobs
          .filter((j) => j.status !== "running")
          .slice(0, STAMP_CAP)
          .map((j) => {
            // at 은 최초 관측 시각 고정(부재 시에만 now 기록) — 매 저장 재도장은
            // 48h TTL 을 사문화한다(위 worksheetJobTimesRef 주석).
            if (!worksheetJobTimesRef.current.has(j.passageId)) {
              worksheetJobTimesRef.current.set(j.passageId, now);
            }
            return { ...j, at: worksheetJobTimesRef.current.get(j.passageId)! };
          }),
      };
      window.localStorage.setItem(
        storageKeyFor(academyId),
        JSON.stringify(payload),
      );
    } catch {
      /* 저장 실패해도 세션 내 동작은 유지 */
    }
  }, [academyId, stamps, worksheetJobs]);

  const launchModules = useCallback<StudioQueueApi["launchModules"]>(
    (passages, modules, classId) => {
      const backed = modules.filter(isSectionBackedModuleId);
      const targetSections = [
        ...new Set(backed.flatMap((m) => MODULE_REQUIRED_SECTIONS[m])),
      ];
      if (backed.length === 0 || targetSections.length === 0 || passages.length === 0) {
        return { launched: 0, skipped: [] };
      }
      // 지문당 활성 잡 1개(서버 보장) — 진행 중 항목은 발사 전에 걸러 알린다(§3.7.2).
      const busy = new Set(
        queue
          .filter((q) => q.status === "pending" || q.status === "analyzing")
          .map((q) => q.id),
      );
      const ready = passages.filter((p) => !busy.has(p.id));
      const skipped = passages.filter((p) => busy.has(p.id)).map((p) => p.title);
      if (ready.length > 0) {
        setStamps((prev) => {
          const next = new Map(prev);
          for (const p of ready) next.set(p.id, { classId, modules: [...backed] });
          return next;
        });
        void addManyToQueue(
          ready.map((p) => ({
            passage: { id: p.id, title: p.title, content: p.content },
            promptConfig: { ...EMPTY_PROMPT, targetSections },
          })),
          true,
        );
      }
      return { launched: ready.length, skipped };
    },
    [addManyToQueue, queue],
  );

  const launchSheets = useCallback<StudioQueueApi["launchSheets"]>(
    (passages, variant, classId) => {
      if (passages.length === 0) return { launched: 0, skipped: [] };
      // 지문당 활성 잡 1개(서버 보장) — launchModules 와 동일 필터.
      const busy = new Set(
        queue
          .filter((q) => q.status === "pending" || q.status === "analyzing")
          .map((q) => q.id),
      );
      const ready = passages.filter((p) => !busy.has(p.id));
      const skipped = passages.filter((p) => busy.has(p.id)).map((p) => p.title);
      if (ready.length > 0) {
        setStamps((prev) => {
          const next = new Map(prev);
          // modules: [] — 학습지 발사는 모듈 축이 아니다. 스트립 라벨은 sheet 가
          // 말하고, modules 필터(isSectionBackedModuleId)는 빈 배열로 통과한다.
          for (const p of ready) next.set(p.id, { classId, modules: [], sheet: variant });
          return next;
        });
        void addManyToQueue(
          ready.map((p) => ({
            passage: { id: p.id, title: p.title, content: p.content },
            // ⚠ targetSections 부재가 계약(E19-1) — 전체 분석 경로로만 흐른다.
            promptConfig: { ...EMPTY_PROMPT, ...sheetPromptFlags(variant) },
          })),
          true,
        );
      }
      return { launched: ready.length, skipped };
    },
    [addManyToQueue, queue],
  );

  const launchWorksheet = useCallback<StudioQueueApi["launchWorksheet"]>(
    async (passage, classId) => {
      if (worksheetBusy.current.has(passage.id)) {
        return { ok: false, error: "이미 실전 문제를 생성하고 있습니다." };
      }
      worksheetBusy.current.add(passage.id);
      // 재발사 = 새 잡이라 영속 수명(at)도 리셋한다 — 업데이터 밖에서 변이
      // (StrictMode 이중 호출 오염 방지 관용구).
      worksheetJobTimesRef.current.set(passage.id, Date.now());
      setWorksheetJobs((prev) => [
        {
          passageId: passage.id,
          title: passage.title,
          status: "running",
          classId,
          startedAt: Date.now(),
        },
        ...prev.filter((j) => j.passageId !== passage.id),
      ]);
      try {
        const res = await fetch(
          `/api/workbench/passage-reports/prime/${passage.id}/worksheet`,
          {
            method: "POST",
            credentials: "include",
            // 서버 상한(maxDuration 300s) 뒤에 스스로 끊는다 — 없으면 응답이
            // 오지 않는 연결에서 running 카드가 영원히 도는 유일한 종결 수단이
            // 사라진다(이 잡은 DB 폴링 복원 경로가 없어 카드 = 이 fetch 뿐이다).
            signal: AbortSignal.timeout(330_000),
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: string;
        };
        if (!res.ok) {
          const msg =
            res.status === 402
              ? "크레딧이 부족합니다."
              : data.details || data.error || "실전 문제 생성에 실패했습니다.";
          setWorksheetJobs((prev) =>
            prev.map((j) =>
              j.passageId === passage.id ? { ...j, status: "error", error: msg } : j,
            ),
          );
          return { ok: false, error: msg };
        }
        setWorksheetJobs((prev) =>
          prev.map((j) =>
            j.passageId === passage.id ? { ...j, status: "done" } : j,
          ),
        );
        setStamps((prev) => {
          const next = new Map(prev);
          const cur = next.get(passage.id);
          // 병합이라 기존 sheet 를 흘려보내면 안 된다(§3.10.19 E19-4) — 위 복원
          // 지점과 같은 스프레드 관용구로 함께 막는다. 현재 호출부 0건이라 잠복이나
          // 실전 문제 발사가 학습지 스탬프를 덮으면 스트립 라벨이 상품 정체를 잃는다.
          next.set(passage.id, {
            classId: cur?.classId ?? classId,
            modules: [...new Set([...(cur?.modules ?? []), "exam" as StudioModuleId])],
            ...(cur?.sheet ? { sheet: cur.sheet } : {}),
          });
          return next;
        });
        return { ok: true };
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === "TimeoutError"
            ? "생성 응답이 시간 안에 오지 않았습니다. 잠시 후 학습지 목록을 확인해 주세요."
            : "네트워크 오류로 생성에 실패했습니다.";
        setWorksheetJobs((prev) =>
          prev.map((j) =>
            j.passageId === passage.id ? { ...j, status: "error", error: msg } : j,
          ),
        );
        return { ok: false, error: msg };
      } finally {
        worksheetBusy.current.delete(passage.id);
      }
    },
    [],
  );

  return {
    queue,
    activeCount,
    stamps,
    worksheetJobs,
    launchModules,
    launchSheets,
    launchWorksheet,
    retryAnalysis,
  };
}
