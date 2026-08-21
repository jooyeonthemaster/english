// ============================================================================
// 빈칸 추론 KILLER 「대입 파손 선지」 0원 결정형 게이트 — LLM 콜 없음.
//
// 배경(26-08-21 실측): 사용자 반려 실물에서 오답 2개가 **내용을 읽기 전에** 죽었다.
//   캐리어: "Musical theater pieces are ___ because of the diminished emphasis
//            on dialogue and a significant emphasis on song and dance."
//   오답②: "... due to their brief dialogue"        → because of + due to 이중 인과
//   오답⑤: "... to compensate for the omitted ... songs" → 같은 문장의
//            "significant emphasis on song" 과 정면 모순
// 두 선지 모두 빈칸에 넣어 읽기만 해도 문장이 삐걱거려, 학생이 지문을 정독하지
// 않고 소거한다. 좋은 오답은 대입했을 때 문장이 매끄럽게 성립하고 지문을 읽어야만
// 틀린 것이 드러나야 한다.
//
// 임계 근거(실기출 실측): 수능·평가원 빈칸 224문항을 원 시험지 형태로 복원해
// 전수 검사한 결과 —
//   · 캐리어 문장에 인과 연결어가 있는 경우 자체가 17건(8%)
//   · 그중 **선지에도 인과 연결어가 들어가 충돌하는 경우는 0건(0.0%)**
// 평가원은 이 충돌을 단 한 번도 내지 않았다. 따라서 1건이라도 있으면 반려한다
// (같은 코퍼스 오반려율 0.0%).
//
// ⚠ 메시지는 그대로 [반려 재생성] 프롬프트의 피드백이 된다 — 어느 선지의 무엇이
//   왜 파손인지 적는다.
//
// 킬스위치: env QGEN_BLANK_KILLER_OPTION_GATE=off (재빌드 불필요).
// ============================================================================

import { normalizeWs, type MdBlankQuestion } from "./parser";

export function isBlankKillerOptionGateEnabled(): boolean {
  return (
    process.env.QGEN_BLANK_KILLER_OPTION_GATE?.trim().toLowerCase() !== "off"
  );
}

/** 인과 연결어 — 캐리어와 선지 양쪽에서 같은 집합으로 판정한다. */
const CAUSAL =
  /\b(?:because(?:\s+of)?|due\s+to|owing\s+to|thanks\s+to|as\s+a\s+result\s+of|on\s+account\s+of)\b/i;

/**
 * 빈칸이 들어갈 캐리어 문장을 지문에서 찾아 **빈칸 자리를 비운 채로** 돌려준다.
 *
 * ⚠ 비우는 것이 핵심이다(26-08-21 실측 버그): 지문은 정답이 채워진 상태이므로,
 *   정답 구 자체가 인과어를 품은 문항(2005_SN q26 정답 "owing to",
 *   2019_09 q34 정답 "… as a result of our own interpretations")에서 캐리어가
 *   자기 자신과 충돌한 것으로 오판해 실기출 2건을 오반려했다. 학생이 보는 것은
 *   정답이 아니라 빈칸이므로 그 구간을 제거하고 판정해야 한다.
 */
function findCarrierSentence(
  passage: string,
  originalExpression: string,
): string | null {
  const p = normalizeWs(passage);
  const o = normalizeWs(originalExpression);
  if (!p || !o) return null;
  const idx = p.indexOf(o);
  if (idx < 0) return null;
  // 문장 경계(.!? + 공백)로 자른다 — 약어 오분할은 이 검사에 영향이 없다.
  const sentences = p.split(/(?<=[.!?])\s+/);
  let acc = 0;
  for (const s of sentences) {
    const end = acc + s.length + 1;
    if (idx < end) return s.split(o).join(" ___ ");
    acc = end;
  }
  return null;
}

/**
 * 대입했을 때 파손되는 선지를 적발한다.
 *
 * 현재 구현하는 검사는 실기출에서 **0건**으로 확인된 것 하나뿐이다 —
 * 캐리어에 인과 연결어가 있는데 선지에도 인과 연결어가 있는 이중 인과.
 * (자기모순 검출은 의미 판정이 필요해 결정론 범위 밖이므로 프롬프트에 맡긴다.)
 *
 * @returns 파손 선지가 있으면 재생성 피드백 1건, 없으면 빈 배열.
 */
export function gateBlankKillerOptions(
  q: MdBlankQuestion,
  passage: string,
): string[] {
  if (!isBlankKillerOptionGateEnabled()) return [];
  const carrier = findCarrierSentence(passage, q.originalExpression);
  if (!carrier || !CAUSAL.test(carrier)) return [];

  const carrierCue = carrier.match(CAUSAL)?.[0] ?? "인과 연결어";
  const broken: string[] = [];
  for (const opt of q.options ?? []) {
    const text = normalizeWs(opt?.text);
    if (!text) continue;
    const hit = text.match(CAUSAL);
    if (hit) broken.push(`${opt.label} "${text.slice(0, 48)}…"(${hit[0]})`);
  }
  if (broken.length === 0) return [];

  return [
    `대입 파손 선지 ${broken.length}개 — 빈칸 문장이 이미 "${carrierCue}" 로 이유를 말하는데 선지가 다시 이유를 말해 이중 인과가 된다: ${broken.join(" · ")}. 학생이 지문을 읽지 않고 대입만으로 소거한다(수능·평가원 224문항에 이 충돌은 0건이다). 해당 선지에서 인과 표현을 빼고, 빈칸에 넣었을 때 문장이 매끄럽게 성립하도록 다시 써라.`,
  ];
}
