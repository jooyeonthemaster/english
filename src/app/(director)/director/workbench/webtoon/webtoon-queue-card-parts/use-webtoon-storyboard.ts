"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isPersistedStoryboard,
  type PersistedWebtoonStoryboard,
} from "@/lib/webtoon-storyboard/types";

// ============================================================================
// 상세 미리보기가 열릴 때 연출 노트(스토리보드)를 지연 로드한다.
// 목록 API 는 storyboard JSON 을 싣지 않으므로(무겁다 — 스펙 §4) 단건 GET 으로 받는다.
// ============================================================================

export type StoryboardLoadState =
  | { status: "idle" }
  | { status: "loading" }
  /** storyboard === null → 레거시(스토리보드 없이 만든) 행. */
  | { status: "ready"; storyboard: PersistedWebtoonStoryboard | null }
  | { status: "error" };

type FetchResult =
  | { key: string; ok: true; storyboard: PersistedWebtoonStoryboard | null }
  | { key: string; ok: false };

interface WebtoonDetailResponse {
  storyboard?: unknown;
  webtoon?: { storyboard?: unknown } | null;
  error?: string;
}

async function fetchStoryboard(
  webtoonId: string,
  signal: AbortSignal,
): Promise<PersistedWebtoonStoryboard | null> {
  const res = await fetch(`/api/webtoons/${encodeURIComponent(webtoonId)}`, {
    cache: "no-store",
    signal,
  });
  const json = (await res.json().catch(() => null)) as WebtoonDetailResponse | null;
  if (!res.ok || !json) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  // 최상위 storyboard 를 우선하고, 없으면 webtoon 행의 컬럼을 본다(두 모양 모두 수용).
  const raw = json.storyboard !== undefined ? json.storyboard : json.webtoon?.storyboard;
  return isPersistedStoryboard(raw) ? raw : null;
}

/**
 * @param enabled false 면 요청하지 않는다(목록이 이미 레거시 행이라고 알려준 경우).
 * 요청 키(id+재시도 횟수)가 바뀌면 이전 요청을 abort 하고, 결과는 키가 일치할
 * 때만 채택한다 — 로딩 상태는 effect 안 동기 setState 없이 키 불일치로 유도한다.
 */
export function useWebtoonStoryboard(webtoonId: string, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);
  const requestKey = enabled ? `${webtoonId}#${attempt}` : null;

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    fetchStoryboard(webtoonId, controller.signal)
      .then((storyboard) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, ok: true, storyboard });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey, ok: false });
      });
    return () => controller.abort();
  }, [requestKey, webtoonId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let state: StoryboardLoadState;
  if (!requestKey) state = { status: "idle" };
  else if (!result || result.key !== requestKey) state = { status: "loading" };
  else if (result.ok) state = { status: "ready", storyboard: result.storyboard };
  else state = { status: "error" };

  return { state, retry };
}
