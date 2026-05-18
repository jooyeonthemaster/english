/** Tokens we advise the caller to set on the Gemini call. */
export const OCR_GENERATION_CONFIG = {
  temperature: 0,
  topK: 1,
  topP: 0,
  maxOutputTokens: 8192,
} as const;

/**
 * Google Gemini API — structured(JSON) 모드에서 JSON 강제용 generation config.
 * Trigger.dev worker 가 이 값을 extend 해서 generateText / generateContent 호출 시 사용한다.
 *
 * `responseSchema` 는 Gemini API provider(ai-sdk, @google/genai 등) 마다 형태가 다르므로
 * 여기서는 주입하지 않고 `responseMimeType` 만 강제한다. 필요 시 worker 쪽에서
 * 이 객체를 spread 해서 `responseSchema` 를 덧붙여 쓰면 된다.
 */
export const STRUCTURED_OCR_GENERATION_CONFIG = {
  ...OCR_GENERATION_CONFIG,
  responseMimeType: "application/json",
} as const;
