"use client";

import {
  WEBTOON_FONT_LIST,
  ensureWebtoonFont,
  familyFromStack,
} from "@/lib/webtoon-text/fonts";
import type { WebtoonTextBox } from "@/lib/webtoon-text/types";

// 자막 편집기 서체 로딩 — 박스가 쓰는 카탈로그 서체를 캔버스가 재고 그리기 전에 실제로 올린다.
//
// ensureWebtoonFont 만으로는 새로고침 직후를 못 막는다.
//  1) Google Fonts 서체는 <link> 스타일시트로 붙는데, 그 CSS 가 도착하기 전의 document.fonts.load
//     는 맞는 @font-face 가 없어 빈 결과로 곧바로 끝난다 → 스타일시트가 끝날 때까지 기다린다.
//  2) 한글 Google Fonts 는 unicode-range 조각으로 나뉘어, 글자 없이 부르면 공백 조각만 받는다
//     → 실제로 그릴 글자를 함께 넘긴다.
// 네트워크가 멈춰도 편집기 열기·배포가 매달리지 않게 전체를 상한 시간으로 자르고 실패는 삼킨다
// (최악이어도 예전처럼 대체 글꼴로 그려질 뿐이다).

const FONT_LOAD_CAP_MS = 5_000;

const WEIGHTS_BY_FAMILY = new Map(WEBTOON_FONT_LIST.map((f) => [f.family, f.weights] as const));

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** 이 서체의 @font-face 를 담은 <link>(개별 또는 카탈로그 전체 묶음)가 아직 로딩 중이면 끝날 때까지. */
function stylesheetsSettled(family: string): Promise<void> {
  const pending = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[data-webtoon-font]"),
  ).filter((link) => {
    const key = link.getAttribute("data-webtoon-font");
    return (key === family || key === "__all__") && !link.sheet;
  });
  return Promise.all(
    pending.map(
      (link) =>
        new Promise<void>((resolve) => {
          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

async function loadFamily(family: string, text: string): Promise<void> {
  await ensureWebtoonFont(family); // CSS 주입(자체 호스팅 서체는 여기서 바로 로드된다)
  await stylesheetsSettled(family);
  const weights = WEIGHTS_BY_FAMILY.get(family) ?? [];
  const sample = ` ${[...new Set(text)].join("")}`;
  await Promise.all(
    (weights.length ? weights : [400]).map((w) =>
      document.fonts.load(`${w} 24px "${family}"`, sample).catch(() => []),
    ),
  );
}

/**
 * 서체들을 불러온다 — family → 그 서체로 그릴 글자. Pretendard 는 앱 전역이라 건너뛴다.
 * 상한 시간 안에 끝나며 거부(reject)되지 않는다.
 */
export function loadWebtoonFonts(textByFamily: ReadonlyMap<string, string>): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  const jobs: Promise<void>[] = [];
  textByFamily.forEach((text, family) => {
    if (family && family !== "Pretendard") {
      jobs.push(loadFamily(family, text).catch(() => undefined));
    }
  });
  if (jobs.length === 0) return Promise.resolve();
  return Promise.race([Promise.all(jobs).then(() => undefined), wait(FONT_LOAD_CAP_MS)]);
}

/** 박스들이 쓰는 카탈로그 서체 전부를, 각 서체로 그릴 글자와 함께 불러온다. */
export function loadBoxFonts(boxes: readonly WebtoonTextBox[]): Promise<void> {
  const textByFamily = new Map<string, string>();
  for (const box of boxes) {
    const family = familyFromStack(box.fontFamily);
    textByFamily.set(family, (textByFamily.get(family) ?? "") + box.text);
  }
  return loadWebtoonFonts(textByFamily);
}
