/**
 * Fresh v7 semantic holdout.
 *
 * BLINDING BOUNDARY
 * -----------------
 * This file was authored before opening any v4-v6 audit script, result, audit
 * narrative, or unit-test body.  Only production validator filenames/exports
 * and the externally supplied semantic audit brief were available.  The cases
 * therefore encode human semantic oracles, not regex-shaped expectations.
 *
 * `expectedFlag: true` means the named fatal split must fire.  `false` means
 * the text is a legitimate look-alike and the split must stay silent.
 */

const cases = [];

function add(id, family, expectedFlag, rationale, input) {
  cases.push({ id, family, expectedFlag, rationale, input });
}

// ---------------------------------------------------------------------------
// 1. Blank explanation: narrative/procedural circled numbering vs option refs.
// ---------------------------------------------------------------------------

const blankStepPositive = [
  "① 먼저 글의 대조 축을 확인한다. ② 이어 빈칸 앞뒤의 인과를 연결한다. ③ 그래서 변화의 지속성이 정답이다.",
  "① 도입부에서 연구 조건을 찾는다. ② 결과 문장의 역접을 해석한다. ③ 두 단서를 합치면 정답이 결정된다.",
  "① 주어가 가리키는 집단을 확정한다. ② 그 집단의 행동 변화를 추적한다. ③ 마지막으로 빈칸에 결론을 넣는다.",
  "① 첫 문장의 문제 상황을 읽는다. ② 중간 사례가 어떤 원리를 보이는지 묶는다. ③ 그 원리를 답으로 택한다.",
  "① 반복되는 핵심어를 표시한다. ② 반대 방향의 표현을 제거한다. ③ 남은 의미를 빈칸에 대입한다.",
  "① 실험의 독립 변인을 확인한다. ② 관찰된 차이의 방향을 비교한다. ③ 그 차이를 설명하는 표현이 정답이다.",
  "① 화자의 초기 기대를 파악한다. ② however 뒤의 전환을 읽는다. ③ 수정된 판단을 답으로 정한다.",
  "① 사례 둘의 공통점을 추출한다. ② 공통점이 뒷받침하는 일반화를 만든다. ③ 그 일반화로 빈칸을 완성한다.",
  "① 원인에 해당하는 문장을 찾는다. ② 결과에 해당하는 문장을 대응시킨다. ③ 둘 사이의 관계를 답에 반영한다.",
  "① 정의 문장을 기준점으로 삼는다. ② 후속 예시가 정의에 맞는지 검토한다. ③ 정의를 재진술한 선택지를 고른다.",
  "① 부정어의 범위를 확인한다. ② 비교 대상의 차이를 계산한다. ③ 범위를 보존한 표현을 정답으로 삼는다.",
  "① 시간 순서를 정리한다. ② 이전 상태와 이후 상태를 대비한다. ③ 변화의 방향을 나타낸 답을 넣는다.",
  "① 필자의 평가 기준을 찾는다. ② 각 사례를 그 기준에 대입한다. ③ 평가를 가장 정확히 압축한 답을 선택한다.",
  "① 대명사의 선행사를 확정한다. ② 선행사에 귀속되는 속성을 모은다. ③ 그 속성의 결론을 빈칸에 배치한다.",
  "① 질문이 요구하는 논리 수준을 정한다. ② 세부 사실과 중심 추론을 분리한다. ③ 중심 추론만 담은 답을 고른다.",
  "① 조건절의 제한을 읽는다. ② 제한이 적용되는 결과를 찾는다. ③ 조건을 빠뜨리지 않은 표현으로 완성한다.",
];

const blankStepNegative = [
  "정답은 ④이다. ①은 원인을 결과로 뒤집고, ②는 범위를 지나치게 넓히며, ③은 글에 없는 대상을 넣고, ⑤는 반대 의미다.",
  "②가 정답이다. 선택지 ①과 ③은 시간 방향이 반대이고, ④와 ⑤는 핵심 조건을 누락한다.",
  "정답 선택지 ⑤는 두 사례의 공통 원리를 보존한다. 반면 ①·②는 한 사례만, ③·④는 지엽 정보만 반영한다.",
  "③이 빈칸의 인과를 정확히 잇는다. ①은 원인만, ②는 결과만 말하며, ④와 ⑤는 인과 자체를 부정한다.",
  "선택지 ①이 정답이다. ②는 비교 대상을 바꾸고, ③은 정도를 과장하며, ④와 ⑤는 논점을 벗어난다.",
  "정답은 ②번이다. ①번은 부정어의 범위를 오독했고, ③번부터 ⑤번까지는 필자의 결론과 양립하지 않는다.",
  "④를 고른다. ①과 ⑤는 글보다 강한 단정이고, ②와 ③은 변화 이전의 상태를 묘사한다.",
  "⑤번이 알맞다. ①번은 행위자를 바꾸고, ②번은 조건을 지우며, ③번과 ④번은 결과의 방향을 뒤집는다.",
  "정답 ③은 however 이후의 판단을 반영한다. 오답 ①·②는 전환 이전에 머물고, ④·⑤는 근거가 없다.",
  "①이 가장 적절하다. ②와 ④는 예시를 일반 원리로 오인하고, ③과 ⑤는 원리와 예시의 관계를 거꾸로 잡았다.",
  "정답은 선택지 ④다. ①은 대상, ②는 시점, ③은 원인, ⑤는 결과를 각각 잘못 설정했다.",
  "②번은 정의를 정확히 재진술한다. ①·③은 일부만 담고, ④·⑤는 정의와 충돌하는 속성을 추가한다.",
  "⑤가 정답이며 ①은 과소 일반화, ②는 과대 일반화, ③은 인과 전도, ④는 무관한 사례에 해당한다.",
  "③번을 택해야 한다. ①번과 ②번은 주체가 다르고, ④번과 ⑤번은 핵심 술어가 반대다.",
  "정답 ①은 제한 조건까지 유지한다. ②·③은 제한을 빼고, ④·⑤는 제한을 모든 상황으로 확대한다.",
  "④번이 답이다. ①번은 단순 반복, ②번은 사실 오류, ③번은 논리 비약, ⑤번은 반대 결론이다.",
];

blankStepPositive.forEach((text, index) =>
  add(
    `v7-blank-step-pos-${String(index + 1).padStart(2, "0")}`,
    "blank_explanation_step_numbering",
    true,
    "Circled numerals organize the solver's reasoning steps, so they are prohibited narrative step numbering.",
    { explanation: text },
  ),
);
blankStepNegative.forEach((text, index) =>
  add(
    `v7-blank-step-neg-${String(index + 1).padStart(2, "0")}`,
    "blank_explanation_step_numbering",
    false,
    "Every circled numeral denotes an answer choice; no procedural step numbering is present.",
    { explanation: text },
  ),
);

// ---------------------------------------------------------------------------
// 2. Blank paraphrase: exact answer residue vs genuinely different wording.
// ---------------------------------------------------------------------------

const residueSeeds = [
  ["institutional memory", "organizational retention", "The committee preserved its procedures through"],
  ["selective attention", "focused perception", "The observers missed peripheral cues because of"],
  ["delayed reciprocity", "later mutual repayment", "Cooperation survived the interval through"],
  ["ecological resilience", "environmental recovery capacity", "The marsh returned after repeated shocks because of"],
  ["distributed authority", "shared decision power", "The network avoided a single bottleneck through"],
  ["moral licensing", "ethical self-permission", "One earlier good act encouraged later indulgence through"],
  ["predictive uncertainty", "forecast ambiguity", "The wide confidence band reflected"],
  ["cultural transmission", "intergenerational learning", "The custom persisted without written rules through"],
  ["strategic ambiguity", "deliberate vagueness", "The diplomat retained room to maneuver by using"],
  ["collective vigilance", "group alertness", "The colony detected rare threats through"],
  ["cognitive offloading", "external memory support", "The checklist reduced working-memory demands through"],
  ["temporal discounting", "devaluation of later rewards", "The preference for an immediate gain revealed"],
  ["contextual adaptation", "adjustment to local conditions", "The protocol remained effective through"],
  ["resource partitioning", "division of ecological niches", "The competing species coexisted through"],
  ["procedural fairness", "equity of the process", "Participants accepted the loss when they perceived"],
  ["network redundancy", "duplicate connection paths", "The system continued after one link failed because of"],
];

residueSeeds.forEach(([answer, paraphrase, lead], index) => {
  add(
    `v7-blank-residue-pos-${String(index + 1).padStart(2, "0")}`,
    "blank_paraphrase_residual_visibility",
    true,
    "The exact keyed answer remains visible outside the blank, making the inference answer mechanically exposed.",
    {
      answer,
      passage: `${lead} _____. A later annotation explicitly names the same mechanism ${answer}.`,
    },
  );
  add(
    `v7-blank-residue-neg-${String(index + 1).padStart(2, "0")}`,
    "blank_paraphrase_residual_visibility",
    false,
    "The passage contains only a semantic paraphrase, not the exact keyed answer string.",
    {
      answer,
      passage: `${lead} _____. A later annotation describes it instead as ${paraphrase}.`,
    },
  );
});

// ---------------------------------------------------------------------------
// 3. Grammar explanation: references to nonexistent vs extant item labels.
// ---------------------------------------------------------------------------

const nonexistentLabels = ["⑥", "⑦", "⑧", "⑨", "⑩", "(F)", "(G)", "ⓕ", "ⓖ", "㉥", "㉦", "[6]", "[7]", "vi", "vii", "여섯째 밑줄"];
const existingLabels = ["①", "②", "③", "④", "⑤", "(A)", "(B)", "(C)", "ⓐ", "ⓑ", "㉠", "㉡", "[1]", "[2]", "i", "셋째 밑줄"];

nonexistentLabels.forEach((label, index) =>
  add(
    `v7-grammar-label-pos-${String(index + 1).padStart(2, "0")}`,
    "grammar_keypoint_nonexistent_label",
    true,
    "The explanation attributes its key point to a label absent from the declared five-item surface.",
    {
      declaredLabels: ["①", "②", "③", "④", "⑤"],
      explanation: `${label}의 형태가 핵심 오류이며 이를 고치면 문장의 구조가 성립한다.`,
    },
  ),
);
existingLabels.forEach((label, index) =>
  add(
    `v7-grammar-label-neg-${String(index + 1).padStart(2, "0")}`,
    "grammar_keypoint_nonexistent_label",
    false,
    "The referenced label is explicitly part of the declared item surface or an equivalent valid label style.",
    {
      declaredLabels:
        index < 5
          ? ["①", "②", "③", "④", "⑤"]
          : index < 8
            ? ["(A)", "(B)", "(C)", "(D)", "(E)"]
            : index < 11
              ? ["ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "㉠", "㉡"]
              : index < 14
                ? ["[1]", "[2]", "[3]", "[4]", "[5]"]
                : ["i", "ii", "iii", "iv", "v", "첫째 밑줄", "둘째 밑줄", "셋째 밑줄"],
      explanation: `${label}에서 주어와 동사의 수 일치를 확인하면 정답 근거가 분명해진다.`,
    },
  ),
);

// ---------------------------------------------------------------------------
// 4. Grammar terminology: objectively false definitions vs valid expert terms.
// ---------------------------------------------------------------------------

const terminologyPositive = [
  "수동태는 be동사와 현재분사를 결합해 만든다.",
  "조동사 must 뒤에는 반드시 to부정사가 온다.",
  "전치사 despite는 완전한 절을 직접 목적어로 취하는 종속접속사다.",
  "접속사 although 뒤에는 동사 없이 명사구만 와야 한다.",
  "동명사는 명사 역할만 하므로 목적어를 취할 수 없다.",
  "관계부사 where는 관계절 안에서 주어 역할을 한다.",
  "each가 주어이면 언제나 복수 동사를 써야 한다.",
  "been은 동사 be의 원형이다.",
  "현재완료는 had와 과거분사를 결합한 시제다.",
  "to는 모든 문장에서 전치사이므로 뒤에 명사만 올 수 있다.",
  "비교급은 형용사 앞에 most를 붙여 만든다.",
  "과거분사는 동사의 -ing형을 가리키는 명칭이다.",
  "가정법 과거의 if절에는 항상 will을 사용한다.",
  "간접의문문의 어순은 의문사 뒤에 조동사를 먼저 둔다.",
  "불가산명사는 관사 a와 결합해야만 단수 의미를 나타낸다.",
  "분사구문은 반드시 독립된 정형동사 두 개를 포함한다.",
];

const terminologyNegative = [
  "what절은 선행사를 내부에 포함하는 융합 관계절로 분석할 수 있다.",
  "요구·제안 동사 뒤 that절의 동사원형은 명령적 가정법으로 설명된다.",
  "It seems that the plan works에서 it은 외치된 절을 대신하는 형식 주어다.",
  "the data collected yesterday의 collected는 축약 관계절의 과거분사다.",
  "There appears to be a gap은 상승 구문으로 분석할 수 있다.",
  "A number of students는 의미와 통사적 수가 함께 복수 동사를 허가한다.",
  "They elected her chair에서 chair는 목적격 보어다.",
  "사역동사 made 뒤의 leave는 원형부정사 보어다.",
  "Never had we seen it처럼 부정 표현을 문두에 두면 주어-조동사 도치가 일어난다.",
  "only after the vote는 초점화된 제한 부사구다.",
  "keep working에서 keep은 동명사 보어를 취하는 연쇄동사로 기술할 수 있다.",
  "one of the books는 부분 구조이며 전치사구가 집합의 범위를 제한한다.",
  "Weather permitting은 명시적 주어를 지닌 독립 분사구문이다.",
  "It was Mina who solved it은 분열문으로서 Mina에 초점을 둔다.",
  "having been revised는 비정형절 안의 완료 수동 형태다.",
  "John, exhausted by the climb, paused에서 분사구는 보충적 수식어다.",
];

terminologyPositive.forEach((text, index) =>
  add(
    `v7-grammar-term-pos-${String(index + 1).padStart(2, "0")}`,
    "grammar_terminology_accuracy",
    true,
    "The sentence gives an objectively false definition or rule under standard English grammar.",
    { explanation: text },
  ),
);
terminologyNegative.forEach((text, index) =>
  add(
    `v7-grammar-term-neg-${String(index + 1).padStart(2, "0")}`,
    "grammar_terminology_accuracy",
    false,
    "The terminology is advanced but standard and accurately applied to the supplied construction.",
    { explanation: text },
  ),
);

// ---------------------------------------------------------------------------
// 5. Sentence order: unusable/label-contaminated paragraphs vs clean prose.
// ---------------------------------------------------------------------------

const orderPositive = [
  { A: "(A) The first team stored every observation.", B: "The second team checked the archive.", C: "Both teams then compared results." },
  { A: "The first signal reached the hub.", B: "(B) Engineers rerouted the remaining traffic.", C: "Service resumed within minutes." },
  { A: "The seeds absorbed water overnight.", B: "Roots emerged the next morning.", C: "(C) The shoots then turned toward the light." },
  { A: "[A] Residents mapped the flooded streets.", B: "They marked safe paths in blue.", C: "Volunteers distributed the updated map." },
  { A: "The curator inspected each fragment.", B: "[B] A conservator cleaned the damaged edges.", C: "The pieces were finally assembled." },
  { A: "Ⓐ The alarm sounded before dawn.", B: "The crew sealed the lower chamber.", C: "Pressure returned to a safe level." },
  { A: "The survey revealed a sharp decline.", B: "Ⓑ Analysts checked the sampling frame.", C: "A weighting error explained the pattern." },
  { A: "The lake froze unusually late.", B: "Biologists adjusted the field schedule.", C: "Ⓒ They collected the final sample in January." },
  { A: "", B: "The second paragraph contains a complete event.", C: "The third paragraph supplies its consequence." },
  { A: "The opening paragraph states a complete event.", B: "   ", C: "The closing paragraph supplies a complete result." },
  { A: "The opening paragraph introduces the experiment.", B: "The middle paragraph reports the measurement.", C: "\n\t" },
  { A: "Because the instrument failed during calibration", B: "The technicians replaced its sensor.", C: "The next reading was stable." },
  { A: "The council postponed the vote.", B: "While several members reviewed the new estimate", C: "They reconvened after lunch." },
  { A: "The orchard received less rain than expected.", B: "Growers installed temporary irrigation.", C: "Although the northern plots remained dry" },
  { A: "To compare the two migration routes", B: "Researchers tagged birds at both sites.", C: "The receivers logged their arrival times." },
  { A: "The editor accepted the revised argument.", B: "The author restored the missing citation.", C: "Which had been omitted from the first draft" },
];

const orderNegative = [
  { A: "The observatory detected a faint pulse.", B: "A second telescope confirmed its position.", C: "The team scheduled a longer observation." },
  { A: "Rain loosened the soil above the road.", B: "Sensors registered a small movement.", C: "Officials closed one lane as a precaution." },
  { A: "A librarian found the unsigned letter.", B: "The paper matched the archive's oldest batch.", C: "A watermark narrowed its date of origin." },
  { A: "The bakery changed the oven temperature.", B: "The crust became thinner and more even.", C: "Customers preferred the revised loaf." },
  { A: "A child noticed that the shadow had shifted.", B: "She marked its new edge with chalk.", C: "The marks formed a simple afternoon clock." },
  { A: "The river deposited silt near the bend.", B: "Reeds colonized the shallow bank.", C: "Their roots slowed the current further." },
  { A: "The software logged every failed request.", B: "Engineers grouped the failures by region.", C: "One damaged cable explained the cluster." },
  { A: "The museum dimmed the gallery lights.", B: "Pigment fading slowed during the next year.", C: "Conservators kept the new setting." },
  { A: "Several bees explored the new feeder.", B: "They returned to the hive before noon.", C: "More workers followed the same route later." },
  { A: "The clinic translated its reminder messages.", B: "More patients confirmed their appointments.", C: "Missed visits declined in the following month." },
  { A: "A storm removed the loose surface sand.", B: "Older footprints appeared underneath.", C: "Archaeologists documented them before sunset." },
  { A: "The panel compared three insulation samples.", B: "The recycled fiber retained the most heat.", C: "Builders selected it for the prototype." },
  { A: "The pianist slowed the difficult transition.", B: "Her left hand stopped anticipating the beat.", C: "She restored the original tempo gradually." },
  { A: "A farmer left one field untilled.", B: "Wildflowers returned along its margins.", C: "Pollinator counts rose across the property." },
  { A: "The satellite crossed the plume twice.", B: "Both passes showed the same concentration peak.", C: "Researchers ruled out a sensor artifact." },
  { A: "The school moved lunch thirty minutes later.", B: "Food waste fell during the trial week.", C: "Administrators extended the schedule change." },
];

orderPositive.forEach((paragraphs, index) =>
  add(
    `v7-order-pos-${String(index + 1).padStart(2, "0")}`,
    "sentence_order_paragraph_integrity",
    true,
    index < 8
      ? "A paragraph body contains an answer-section label, contaminating the reconstruction surface."
      : "At least one paragraph is empty or a dependent fragment and cannot stand as a reorderable paragraph.",
    { givenText: "A prior event establishes the shared context.", paragraphs },
  ),
);
orderNegative.forEach((paragraphs, index) =>
  add(
    `v7-order-neg-${String(index + 1).padStart(2, "0")}`,
    "sentence_order_paragraph_integrity",
    false,
    "All three paragraph bodies are nonempty, label-free, independent prose units.",
    { givenText: "A prior event establishes the shared context.", paragraphs },
  ),
);

// ---------------------------------------------------------------------------
// 6. Summary MC direction: selected semantic object, not keyword proximity.
// ---------------------------------------------------------------------------

const sourceFrames = [
  "본문상",
  "지문으로 볼 때",
  "글에 비추어",
  "제시 근거상",
  "본문의 근거에 따르면",
  "지문에 근거하여",
  "글이 제공한 정보만으로",
  "제시문을 기준으로",
];
const targetFrames = ["옳은 주장", "사실인 진술", "근거가 뒷받침하는 명제", "본문과 일치하는 설명"];
const targetActions = ["고르시오", "선택하시오", "찾으시오", "판별하시오"];

for (let group = 0; group < 4; group += 1) {
  sourceFrames.forEach((source, index) => {
    const target = targetFrames[group];
    const action = targetActions[(group + index) % targetActions.length];
    const direction =
      group === 0
        ? `${source} ${target}을 하나 ${action}.`
        : group === 1
          ? `${target}을 ${source} ${action}.`
          : group === 2
            ? `요약문 아래에 제시된 설명 중 ${source} ${target}을 ${action}.`
            : `※ 내용 확인 문항\n${source}, 다섯 진술 가운데 ${target}을 ${action}.`;
    add(
      `v7-summary-direction-pos-${String(group * 8 + index + 1).padStart(2, "0")}`,
      "summary_mc_direction_answer_object",
      true,
      "The commanded answer object is a truth/evidence claim, not a pair that completes two summary slots.",
      {
        direction,
        summary: index % 2 === 0 ? "현상 (A)는 장기적으로 (B)를 낳는다." : "현상은 ____를 거쳐 ____로 이어진다.",
        markerStyle: index % 2 === 0 ? "explicit_AB" : "unlabeled_two_blanks",
      },
    );
  });
}

const pairObjects = [
  "(A), (B)에 들어갈 표현의 쌍",
  "두 빈칸을 완성할 단어의 조합",
  "요약문의 두 자리에 놓일 말의 짝",
  "빈칸 두 곳에 알맞은 표현 한 쌍",
];
const pairActions = ["고르시오", "선택하시오", "찾으시오", "결정하시오"];

for (let group = 0; group < 4; group += 1) {
  sourceFrames.forEach((source, index) => {
    const object = pairObjects[group];
    const action = pairActions[(group + index) % pairActions.length];
    const direction =
      group === 0
        ? `${source} 요약문의 주장이 근거에 맞도록 ${object}을 ${action}.`
        : group === 1
          ? `요약문의 진술이 ${source} 타당해지게 하는 ${object}을 ${action}.`
          : group === 2
            ? `주장과 제시 근거의 관계를 보존하도록, ${source} ${object}을 ${action}.`
            : `※ 요약 완성\n${object}을 ${source} ${action}; 각 선택지는 하나의 짝이다.`;
    add(
      `v7-summary-direction-neg-${String(group * 8 + index + 1).padStart(2, "0")}`,
      "summary_mc_direction_answer_object",
      false,
      "Despite nearby claim/evidence/select words, the commanded answer object is unambiguously the two-slot completion pair.",
      {
        direction,
        summary: index % 2 === 0 ? "현상 (A)는 장기적으로 (B)를 낳는다." : "현상은 ____를 거쳐 ____로 이어진다.",
        markerStyle: index % 2 === 0 ? "explicit_AB" : "unlabeled_two_blanks",
      },
    );
  });
}

const familyRequirements = new Map([
  ["blank_explanation_step_numbering", { positive: 16, negative: 16 }],
  ["blank_paraphrase_residual_visibility", { positive: 16, negative: 16 }],
  ["grammar_keypoint_nonexistent_label", { positive: 16, negative: 16 }],
  ["grammar_terminology_accuracy", { positive: 16, negative: 16 }],
  ["sentence_order_paragraph_integrity", { positive: 16, negative: 16 }],
  ["summary_mc_direction_answer_object", { positive: 32, negative: 32 }],
]);

if (cases.length !== 224) throw new Error(`Expected 224 cases, got ${cases.length}`);
if (new Set(cases.map((entry) => entry.id)).size !== cases.length) throw new Error("Duplicate case id");

for (const [family, requirement] of familyRequirements) {
  const familyCases = cases.filter((entry) => entry.family === family);
  const positive = familyCases.filter((entry) => entry.expectedFlag).length;
  const negative = familyCases.filter((entry) => !entry.expectedFlag).length;
  if (positive !== requirement.positive || negative !== requirement.negative) {
    throw new Error(`${family}: expected ${JSON.stringify(requirement)}, got ${positive}/${negative}`);
  }
}

export { cases, familyRequirements };

