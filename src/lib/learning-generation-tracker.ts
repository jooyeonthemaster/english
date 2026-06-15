"use client";

import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 학습자료(학습지) 생성 전역 트래커
//
// 학습지 생성(generate-learning)은 서버 잡 테이블 없이 클라이언트 fetch 로
// 진행된다. 페이지를 이동해도 fetch 자체는 계속 돌지만 컴포넌트 로컬 큐는
// 사라지므로, 다른 워크벤치 화면(예: 문제 생성)에서 "이 지문은 지금 학습자료
// 생성중" 임을 보여주려면 모듈 스코프 스토어가 필요하다. SPA 내 네비게이션
// 동안 살아있고, 하드 리로드 시에는 fetch 도 함께 끊기므로 상태 소실이 곧
// 실제 상태와 일치한다.
// ─────────────────────────────────────────────────────────────────────────────

export interface LearningGenerationTask {
  id: string;
  passageId: string;
  passageTitle: string;
  category: string;
  status: "generating" | "done" | "error";
  startedAt: number;
}

// 완료/실패한 태스크가 인디케이터에서 잠깐 보였다가 사라지는 유예 시간.
const SETTLED_PURGE_DELAY_MS = 4000;

const tasks = new Map<string, LearningGenerationTask>();
const listeners = new Set<() => void>();

const EMPTY_TASKS: LearningGenerationTask[] = [];
let snapshot: LearningGenerationTask[] = EMPTY_TASKS;

function emit() {
  snapshot = Array.from(tasks.values());
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY_TASKS;
}

export function beginLearningGenerationTask(
  task: Omit<LearningGenerationTask, "status" | "startedAt">,
) {
  tasks.set(task.id, { ...task, status: "generating", startedAt: Date.now() });
  emit();
}

export function settleLearningGenerationTask(
  id: string,
  status: "done" | "error",
) {
  const task = tasks.get(id);
  if (!task) return;
  tasks.set(id, { ...task, status });
  emit();
  setTimeout(() => {
    if (tasks.get(id)?.status === status) {
      tasks.delete(id);
      emit();
    }
  }, SETTLED_PURGE_DELAY_MS);
}

/** 현재 진행/방금 완료된 학습자료 생성 태스크 목록. */
export function useLearningGenerationTasks(): LearningGenerationTask[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
