import type { WebtoonStoryboard } from "@/lib/webtoon-storyboard/types";

// 스토리보드 레터링 힌트 — detect.ts 가 "이미지 모델이 깨뜨린 글자"를 찾아 바로잡는 순수 함수 모음.
//
// 스토리보드(v2)로 만든 웹툰은 이미지에 찍으라고 지시한 문자열을 정확히 안다. 인식 모델에게 그
// 목록을 주고 영역마다 두 값을 받는다.
//  - text          : 이미지에 실제로 찍힌 글자(글리프 그대로 — 깨졌으면 깨진 대로)
//  - intended_text : 그 영역이 원래 보여야 했던 기대 문자열(없으면 "")
// 둘이 글자 수준에서 다르면 깨진 레터링이다. 그 박스는 sourceText=찍힌 글자, text=기대 문자열,
// edited=true 로 만들어 편집기·배포본이 깨끗한 글자로 다시 그리게 한다(types.ts: 내보내기는 edited
// 박스만 새로 그린다). 예전처럼 text 에 기대 문자열만 받으면 목록엔 멀쩡한 글자가 보이는데 이미지엔
// 깨진 글자가 그대로 남아, 어느 말풍선이 깨졌는지조차 알 수 없었다.
// 모델의 짝짓기는 그대로 믿지 않는다 — 기대 목록에 실제로 있는 문자열이고, 찍힌 글자와 충분히
// 닮았고, 다른 기대 문자열보다 더 닮았을 때만 교정한다(멀쩡한 말풍선을 엉뚱한 대사로 덮지 않게).

// 힌트 상한 — 한 페이지 글자 예산(≤520자, webtoon-storyboard/rules.ts)을 넉넉히 덮는다.
const MAX_EXPECTED_TEXTS = 80;
const MAX_EXPECTED_TEXT_LEN = 200;

// 찍힌 글자와 기대 문자열의 최소 유사도(편집거리 기준 0~1). 이보다 멀면 "깨진 버전"이 아니라
// 다른 글자로 보고 손대지 않는다.
const MIN_FIX_SIMILARITY = 0.5;

/** 힌트 정리 — 문자열만, 공백 정리, 빈 값·중복·과대 길이 제외, 개수 상한. */
export function normalizeExpectedTexts(texts: readonly unknown[] | undefined): string[] {
  if (!texts?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of texts) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    // 너무 긴 문자열은 잘라 넣지 않는다 — 잘린 값은 "정확한 기대 문자열"이 아니다.
    if (!t || t.length > MAX_EXPECTED_TEXT_LEN || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_EXPECTED_TEXTS) break;
  }
  return out;
}

/**
 * 스토리보드(v2)로 생성된 웹툰에 찍히도록 지시된 글자 전부 — 캡션·말풍선·번역·효과음.
 * 컴파일러(webtoon-storyboard/compile.ts)가 이미지 프롬프트에 인용한 문자열 집합과 같다.
 * 제목(title)은 이미지에 찍지 않으므로 넣지 않는다. DB 에서 읽은 JSON 은 느슨한 가드만
 * 통과했으므로 패널·말풍선 모양을 한 번 더 확인한다.
 */
export function expectedLetteringFromStoryboard(storyboard: WebtoonStoryboard): string[] {
  const texts: unknown[] = [];
  for (const panel of storyboard.panels ?? []) {
    if (!panel || typeof panel !== "object") continue;
    texts.push(panel.caption);
    if (Array.isArray(panel.bubbles)) {
      for (const bubble of panel.bubbles) {
        if (bubble && typeof bubble === "object") texts.push(bubble.text, bubble.translation);
      }
    }
    texts.push(panel.sfx);
  }
  return normalizeExpectedTexts(texts);
}

/** 인식 프롬프트에 덧붙이는 힌트 블록. 응답 스키마에 intended_text 가 함께 있어야 한다(detect.ts). */
export function letteringHintPrompt(expectedTexts: readonly string[]): string {
  return `EXPECTED LETTERING (JSON array): ${JSON.stringify(expectedTexts)}
The image was generated to contain exactly these strings, but the image model sometimes garbles letters. For each region ALSO return "intended_text": the EXPECTED LETTERING entry this region was meant to show, copied exactly, or "" if it matches none.
Keep "text" a faithful glyph-for-glyph transcription of what is actually printed — if the lettering is misspelled or garbled, transcribe it garbled and never correct it in "text" (the correction belongs in "intended_text"). Report only regions you can actually see — never add a region for an expected string that is not visible.`;
}

/** 비교 키 — 글자·숫자만. 대소문자·공백·줄바꿈·문장부호·따옴표 모양 차이는 "깨짐"이 아니다. */
function letterKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 편집거리(레벤슈타인) 기반 유사도 0~1, 코드포인트 단위. */
function similarity(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      const substitution = prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1);
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, substitution);
    }
    prev = cur;
  }
  return 1 - prev[y.length] / longest;
}

/**
 * 깨진 레터링 교정 판정 — 다시 그릴 기대 문자열(스토리보드 원문 그대로)을 돌려주고, 아니면 null.
 * printed = 이미지에 찍힌 글자(모델 text), intended = 모델이 짝지은 기대 문자열(intended_text).
 */
export function resolveLetteringFix(
  printed: string,
  intended: unknown,
  expectedTexts: readonly string[],
): string | null {
  if (typeof intended !== "string" || expectedTexts.length === 0) return null;
  const intendedKey = letterKey(intended);
  const printedKey = letterKey(printed);
  if (!intendedKey || !printedKey || intendedKey === printedKey) return null;
  const keyed = expectedTexts.map((text) => {
    const key = letterKey(text);
    return { text, key, len: Array.from(key).length };
  });
  // 모델이 지어낸 문자열은 받지 않는다 — 기대 목록에 있는 원문만.
  const target = keyed.find((e) => e.key === intendedKey);
  if (!target) return null;
  // 찍힌 글자가 이미 다른 기대 문자열과 같다면 멀쩡한 말풍선이다(짝짓기만 틀렸다).
  if (keyed.some((e) => e.key === printedKey)) return null;
  const targetSimilarity = similarity(printedKey, intendedKey);
  if (targetSimilarity < MIN_FIX_SIMILARITY) return null;
  // 다른 기대 문자열이 더 닮았으면 짝짓기를 믿지 않는다. 길이 차만으로 상한이 정해지므로
  // (유사도 ≤ 1 − 길이차/긴 쪽) 그 상한으로도 못 넘는 후보는 편집거리를 계산하지 않는다.
  const printedLen = Array.from(printedKey).length;
  const closerElsewhere = keyed.some(
    (e) =>
      e.key &&
      e.key !== intendedKey &&
      1 - Math.abs(e.len - printedLen) / Math.max(e.len, printedLen) > targetSimilarity &&
      similarity(printedKey, e.key) > targetSimilarity,
  );
  return closerElsewhere ? null : target.text;
}
