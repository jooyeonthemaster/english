// ============================================================================
// 웹툰 생성 요청 클라이언트 — POST /api/ai/webtoon/generate
// ----------------------------------------------------------------------------
// 생성 페이지(워크스페이스 → 생성)와 보관함 「다시 시도」가 같은 해석을 쓰도록
// 한곳에 둔다. 응답 해석 규칙:
//  · 서버는 지문마다 웹툰 행을 먼저 만들고, 디스패치(Trigger/로컬 워커)에 실패한
//    행은 곧바로 FAILED(+error)로 돌려준다 → 그 행은 "시작됨"으로 세지 않는다.
//  · 402(크레딧 부족)는 부족해지기 직전까지 만든 행을 queued 에 실어 보낸다.
// 예외를 던지지 않는다 — 실패는 error 문구로 돌려주고 토스트는 호출부가 띄운다.
// ============================================================================

import { friendlyWebtoonError } from "@/lib/webtoon-errors";
import type { WebtoonImagePlanId } from "@/lib/webtoon-models";
import type { WebtoonLanguageId, WebtoonStyleId } from "./webtoon-page-types";

interface QueuedItem {
  webtoonId: string;
  passageId: string;
  passageTitle: string;
  status: "PENDING" | "GENERATING" | "FAILED";
  error?: string;
}

interface GenerateResponse {
  ok?: boolean;
  error?: string;
  balance?: number;
  required?: number;
  queued?: QueuedItem[];
}

export interface WebtoonGenerateBody {
  passageIds: string[];
  style: WebtoonStyleId;
  language: WebtoonLanguageId;
  customPrompt: string;
  /** 미지정(undefined)이면 서버가 기본 등급으로 처리한다(레거시 행 재시도). */
  plan?: WebtoonImagePlanId;
}

export interface WebtoonGenerateResult {
  /** 서버가 만든 웹툰 행 수 — 디스패치 실패로 곧바로 FAILED 가 된 행 포함. */
  created: number;
  /** 실제로 생성이 시작된(FAILED 가 아닌) 행 수. */
  started: number;
  /** 교사에게 보여줄 실패 사유(요청 실패·크레딧 부족·디스패치 실패). 없으면 null. */
  error: string | null;
}

export async function requestWebtoonGeneration(
  body: WebtoonGenerateBody,
): Promise<WebtoonGenerateResult> {
  let res: Response;
  let data: GenerateResponse;
  try {
    res = await fetch("/api/ai/webtoon/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    data = (await res.json().catch(() => ({}))) as GenerateResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : "요청 실패";
    return { created: 0, started: 0, error: `생성 요청 실패: ${message}` };
  }

  const queued = Array.isArray(data.queued) ? data.queued : [];
  const failed = queued.filter((q) => q.status === "FAILED");
  const created = queued.length;
  const started = created - failed.length;

  let error: string | null = null;
  if (res.status === 402) {
    error = `크레딧이 부족합니다. 보유 ${data.balance ?? "?"} / 필요 ${
      data.required ?? "?"
    }.`;
  } else if (!res.ok || !data.ok) {
    error = `생성 요청 실패: ${data.error || `generate ${res.status}`}`;
  } else if (failed.length > 0) {
    // 디스패치 원문 오류(내부 정보)는 그대로 노출하지 않고 교사용 문구로 바꾼다.
    error = friendlyWebtoonError(failed[0].error ?? "");
  }

  return { created, started, error };
}
