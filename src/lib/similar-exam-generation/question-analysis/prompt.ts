import { QUESTION_TYPE_META } from "@/lib/question-schemas";

import { GENERATION_SUB_TYPES } from "../schemas";

// 빌트인 22유형 카탈로그(매칭용). GENERATION_SUB_TYPES(엔진이 받는 정식 ID)에
// 한정해 라벨·설명을 붙여 모델이 matchedType 을 고르게 한다.
function buildTypeCatalog(): string {
  return GENERATION_SUB_TYPES.map((id) => {
    const meta = QUESTION_TYPE_META[id];
    const label = meta?.label ?? id;
    const desc = meta?.description ?? "";
    return `- ${id} (${label}): ${desc}`;
  }).join("\n");
}

export interface QuestionAnalysisPromptInput {
  /** 텍스트로 들어온 문항(이미지 대신/병행). 없으면 첨부 이미지에서 읽는다. */
  inputText?: string;
  hasImages: boolean;
  targetQuestion?: {
    ordinal: number;
    total: number;
    questionNumber?: number | null;
  };
  schoolType?: string; // 예: "고등학교"
  gradeInfo?: string; // 예: "고3"
}

export function buildQuestionAnalysisPrompt({
  inputText: rawInputText,
  targetQuestion,
  hasImages,
  schoolType = "고등학교",
  gradeInfo = "",
}: QuestionAnalysisPromptInput): string {
  const sourceLine = hasImages
    ? "첨부된 이미지의 문항을 분석하세요."
    : "아래 [문항]을 분석하세요.";
  const targetInstruction = targetQuestion
    ? `## Target single-question mode
- The full page may contain ${targetQuestion.total} questions.
- Analyze ONLY target question ordinal ${targetQuestion.ordinal} of ${targetQuestion.total}${
        targetQuestion.questionNumber
          ? `, printed question number ${targetQuestion.questionNumber}`
          : ""
      }.
- Ignore all other questions except when their text is physically part of the target question.
- Return exactly one group with exactly one question.
- Preserve the target question's option count, answer count, blank count, labels, and [I]/[II] or (a)~(f) structure.
- If the target is a paired or multi-part question, keep every paired blank and every paired option in the analysis.
- questionNumber must be a normal integer from 1 to 500, or null. Never pad, repeat, or expand digits.
- Do not include source.boundingBox in this target single-question mode. The server will preserve the original full-page crop coordinates.
- If the crop clearly contains only part of a question because the rest is on another physical page, set source.completeness.isComplete=false and explain the missing parts.
- Before final output, check that options[].isCorrect, correctAnswerLabels, and multipleAnswers are mutually consistent.`
    : "";
  const effectiveInputText = targetInstruction
    ? [targetInstruction, rawInputText?.trim()].filter(Boolean).join("\n\n")
    : rawInputText;
  const inputText = effectiveInputText ?? "";
  const inputBlock = inputText.trim()
    ? `\n\n## 문항\n${inputText.trim()}`
    : "";
  const boundingBoxBlock = hasImages && !targetQuestion
    ? `

## Image Bounding Boxes
- For every question, fill source.boundingBox.
- Use normalized coordinates in 0..1 fractions: { "x": number, "y": number, "width": number, "height": number, "pageIndex": 0, "confidence": "high" | "medium" | "low" }.
- The attached image is already server-normalized to its upright visual orientation. Use the visible upright page, not raw EXIF/file orientation, as the coordinate system.
- The box must include the whole printed question block: question number, direction, passage, condition boxes, choices/options, answer box, visible underlines/marks, and any separated [I]/[II], (a)~(f), or example/choice box area belonging to that question.
- If one question continues across columns or has separated regions on the same page, use one generous bounding box covering the full union of the target question regions. Mark confidence "low" and explain the layout in extractionNotes when the crop may include neighboring text.
- Prefer a generous box over a tight one, but do not include neighboring questions unless they are physically part of the target question.
- x, y, width, and height must be ordinary decimals between 0 and 1. pageIndex must be 0 for one attached image.`
    : "";
  const inventoryBlock = hasImages && !targetQuestion
    ? `

## Question Inventory First
- Before writing groups[], fill inventory[] with every printed question marker visible on the physical page.
- Include complete questions, incomplete page fragments, and continuation fragments. This inventory is used to catch omitted questions.
- For bracket ranges such as [2-3], [6~7], or [12~13], create one inventory item for each question number in the range, even when they share one passage or one direction.
- For written-answer markers such as [서답형4], create one inventory item with label="[서답형4]" and questionNumber=null unless a normal printed number is also shown.
- Mark status="complete" only when the question's direction, required passage/body, options/answer box, and all referenced parts are visible on this same image.
- Mark status="incomplete_previous" or "fragment_previous" when only the tail of a previous-page question is visible.
- Mark status="incomplete_next" or "fragment_next" when the question starts on this page but essential text/options continue to the next physical page.
- Footer text such as "다음 장에 계속" is not enough by itself. Judge by whether the actual question structure is missing essential parts.
- The detailed groups[].questions must include every inventory item with status="complete" whenever possible. If an inventory item is omitted from groups[], explain why in its rationale.
- Fill inventory[].boundingBox generously for every inventory item, including shared-passage questions and same-page column continuations.`
    : "";
  const incompleteBlock = hasImages
    ? `

## Incomplete Physical-Page Questions
- Do not output questions whose essential parts are on a previous or next physical page.
- Footer text such as "다음 장에 계속" alone is never enough to mark a question incomplete.
- A same-page column continuation, such as left-bottom text continuing to right-top on the same image, is complete if all required parts are visible.
- If a question is included but any essential part is missing, set source.completeness.isComplete=false, requiresPreviousPage/requiresNextPage as appropriate, and list missingParts. The server will exclude it from generation.
- Decide completeness from the question's own structure: missing choices/options, missing [I]/[II], missing [A]/[B]/[C] paragraphs, missing (a)~(f) or (A)~(I) items, missing answer/condition box, or a passage that visibly starts/ends mid-question at the page edge.`
    : "";

  return `당신은 한국 ${schoolType} ${gradeInfo} 영어 시험 문항을 정밀 분석하는 전문가입니다.
${sourceLine} 목표는 이 문항과 "동형(同形)"의 새 문항을 만들 수 있을 만큼 **출제 의도와 구조를 최대한 많이** 추출하는 것입니다.

## 분석 원칙
- 문항이 **여러 개**거나 **한 지문에 여러 문항**이 묶여 있으면, 지문 단위로 그룹을 만들어 groups[]에 담으세요. 단일 문항이면 group 1개에 questions 1개.
- **지문 없는 문항**(예: "다음 단어 쌍 중 관계가 다른 하나는?"처럼 보기만 있는 문항)도 그대로 분석하세요. 이때 source.passageBased=false, source.passage=null, 그룹의 sharedStimulus=null.
- 원문을 **그대로** 추출하세요(발문·지문·보기·정답). 임의로 고치거나 번역하지 마세요.
- **보기 개수(optionCount)**, **정답 라벨 목록(correctAnswerLabels)**, **복수 정답 여부(multipleAnswers)**를 정확히 채우세요. 정답이 둘 이상이면 multipleAnswers=true.

## 각 문항에서 뽑을 것
1. source: 발문, 지문(있으면), 보기[](각 보기의 label·text·정답여부·근거), 보기개수, 정답 라벨[], 복수정답 여부, 원해설(있으면).
2. classification:
   - matchedType: 아래 빌트인 유형 중 가장 정확히 맞는 것 하나. 애매하면 matchConfidence를 medium/low로.
   - 빌트인 어디에도 안 맞으면 matchedType=null, isNovelType=true, noveltyNote에 이 유형이 무엇을 어떻게 묻는지 서술(나중에 커스텀 유형으로 활용).
   - **stimulusKind**(자료 형태): 읽기 지문 기반=PASSAGE / 지문 없이 출제되는 모든 형식(어휘 관계·단어 쌍, 자유 영작, 어법 변형 등)=NONE / 듣기(음성·대본)=LISTENING / 도표·그래프·그림·이미지 기반=VISUAL / 기타=OTHER. 듣기·도표/그림은 텍스트로 동형 생성이 불가하니 정확히 분류하세요. NONE 은 형식에 제한이 없습니다.
   - difficulty + 근거, points(있으면), typeSettings(어법 밑줄 개수 등 해당 시).
3. testingPoint: 이 문항이 평가하는 핵심(무엇을 묻는가) + 관련 스킬[].
4. transformation: 출제자가 원문에서 **무엇을 어떻게 바꿔** 함정/정답을 만들었는지. 어법·어휘 변형이면 changedSpans에 {from(원래), to(바뀐 것), rule(규칙)}로. 변형이 없으면 applied=false.
5. reproductionSpec: 동형 문항 생성 시 그대로 따라야 할 발문/보기/정답 형식과 구조.
6. variationAxes: 출제 의도를 유지하면서 바꿀 수 있는 부분(소재/표현/함정 위치 등).
7. extractionNotes: 불확실하거나 특이한 점.

## 빌트인 유형 카탈로그 (matchedType 후보)
${buildTypeCatalog()}
${inventoryBlock}
${boundingBoxBlock}
${incompleteBlock}
${inputBlock}

정확히 스키마 형식으로만 출력하세요.`;
}
