/**
 * Post-seal targeted supplement.
 *
 * These cases are deliberately NOT represented as blinded. They were authored
 * after the 224-case blind seal to isolate nearest-answer-object precision in
 * Korean summary directions. They are balanced and additive; they cannot
 * remove or override any sealed oracle or failure.
 */

const negativePairObjects = [
  "본문의 주장과 일치하는 (A)/(B) 표현 쌍을 고르시오.",
  "지문의 진술과 일치하는 두 빈칸 단어 조합을 선택하시오.",
  "글의 명제와 일치하는 (A), (B) 말의 짝을 찾으시오.",
  "본문의 옳은 주장이 되도록 빈칸 표현 쌍을 고르시오.",
  "지문의 사실인 진술이 되게 하는 단어 조합을 선택하시오.",
  "글의 주장과 일치하는 요약 빈칸 쌍을 판별하시오.",
  "본문의 진술이 사실인 문장이 되도록 (A)/(B) 짝을 찾으시오.",
  "지문의 명제가 옳은 요약이 되게 할 두 단어를 고르시오.",
  "글의 주장과 일치하는 두 표현의 조합을 선택하시오.",
  "본문의 사실인 진술을 만드는 (A)/(B) 쌍을 고르시오.",
  "지문의 옳은 주장을 완성하는 단어의 짝을 선택하시오.",
  "글의 명제를 사실인 요약으로 만드는 (A)/(B) 조합을 찾으시오.",
  "본문의 주장에 일치하는 두 빈칸 표현을 고르시오.",
  "지문의 진술에 일치하는 말의 쌍을 선택하시오.",
  "글의 명제에 일치하는 빈칸 조합을 판단하시오.",
  "본문의 옳은 주장을 이루는 (A)/(B) 짝을 가려내시오.",
];

const positiveClaimObjects = [
  "요약의 (A)/(B) 쌍과 별개로 본문의 주장 중 옳은 주장을 고르시오.",
  "두 빈칸 조합을 검토한 뒤 지문의 진술 중 사실인 진술을 선택하시오.",
  "요약 후보와 무관하게 글의 명제 중 옳은 명제를 찾으시오.",
  "(A), (B)를 먼저 읽고 본문의 주장 가운데 근거가 없는 주장을 고르시오.",
  "단어 쌍은 참고만 하고 지문의 진술 중 뒷받침되지 않는 진술을 선택하시오.",
  "요약 빈칸과 별도로 글의 명제 중 사실이 아닌 명제를 판별하시오.",
  "(A)/(B) 짝을 제시한 다음 본문의 주장 중 근거와 일치하는 주장을 찾으시오.",
  "두 단어 후보와 따로 지문의 진술 가운데 옳지 않은 진술을 고르시오.",
  "표현 조합을 읽되 글의 명제 중 증거가 지지하는 명제를 선택하시오.",
  "(A)/(B) 쌍 다음에 본문의 주장 중 사실인 주장을 고르시오.",
  "단어의 짝을 본 뒤 지문의 진술 중 옳은 진술을 선택하시오.",
  "빈칸 조합과 독립적으로 글의 명제 중 근거에 어긋나는 명제를 찾으시오.",
  "두 빈칸 표현 뒤에서 본문의 주장 중 일치하지 않는 주장을 고르시오.",
  "말의 쌍과 별개로 지문의 진술 중 근거가 부족한 진술을 선택하시오.",
  "요약 조합을 제외하고 글의 명제 중 사실이 아닌 명제를 판단하시오.",
  "(A)/(B) 짝과는 따로 본문의 주장 중 옳은 주장을 가려내시오.",
];

const cases = [
  ...positiveClaimObjects.map((direction, index) => ({
    id: `v7-summary-targeted-pos-${String(index + 1).padStart(2, "0")}`,
    family: "summary_mc_direction_answer_object",
    expectedFlag: true,
    rationale:
      "The direct object of the selection command is a claim/statement/proposition whose truth or evidential status is scored separately from any nearby summary pair.",
    input: {
      direction,
      summary: "A process (A) eventually produces outcome (B).",
      markerStyle: "explicit_AB",
    },
    provenance: "post_blind_targeted_supplement",
  })),
  ...negativePairObjects.map((direction, index) => ({
    id: `v7-summary-targeted-neg-${String(index + 1).padStart(2, "0")}`,
    family: "summary_mc_direction_answer_object",
    expectedFlag: false,
    rationale:
      "Claim/evidence language modifies the completed summary, while the direct object of the command is the (A)/(B) word pair; content-match fatal must abstain.",
    input: {
      direction,
      summary: "A process (A) eventually produces outcome (B).",
      markerStyle: "explicit_AB",
    },
    provenance: "post_blind_targeted_supplement",
  })),
];

if (cases.length !== 32) throw new Error(`Expected 32 supplemental cases, got ${cases.length}`);
if (new Set(cases.map((entry) => entry.id)).size !== cases.length) throw new Error("Duplicate id");
if (cases.filter((entry) => entry.expectedFlag).length !== 16) throw new Error("Positive imbalance");
if (cases.filter((entry) => !entry.expectedFlag).length !== 16) throw new Error("Negative imbalance");

export { cases };

