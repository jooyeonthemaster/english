// ============================================================================
// AI 지문 생성 — 마크다운 출력 형식 블록 (스트리밍 레인 전용)
//
// 유저 프롬프트(prompts.buildAuthoringUserPrompt) **뒤에** 붙여 출력 계약만
// 갈아끼운다. 시스템 프롬프트·난이도 표·골격·자료 블록·SELF-CHECK 는 JSON 레인과
// 바이트 단위로 같은 것을 쓴다 — 두 레인의 품질 차이가 "출력 형식"이라는 한 축으로만
// 설명되게 하기 위해서다(레인마다 다른 프롬프트를 두면 A/B 가 성립하지 않는다).
//
// 회귀 방지 계약
//  · 라벨 문자열은 parser.ts 의 MD_LABELS 가 정본이다. 여기서 손코딩하지 말 것 —
//    한쪽만 고치면 모델은 형식을 지켰는데 파서가 못 읽는 상태가 된다(원인 추적이
//    가장 어려운 종류의 실패).
//  · 시스템 프롬프트의 **절대규칙 7(Output ONLY the JSON object)** 과 정면 충돌하므로,
//    이 블록은 자기가 그 규칙을 대체한다고 명시적으로 선언한다. 선언을 빼면 모델이
//    두 지시 사이에서 임의로 절충해 JSON 과 마크다운을 섞어 뱉는다(실측 실패 모드).
//  · 자료 역할 지시문(ROLE_DIRECTIVES)은 `grammarSpots` · `usedWords` 같은 **JSON
//    필드명**으로 보고를 요구한다. 그 이름들을 라벨로 매핑해 주지 않으면 모델이
//    존재하지 않는 칸을 만들어 낸다.
// ============================================================================

import { MD_LABELS } from "./parser";

const L = MD_LABELS;

/**
 * 출력 형식 블록. 요청마다 바뀌지 않으므로 인자가 없다 — 프리픽스 캐시가
 * 갈라지지 않게 하는 것도 목적이다(자료 블록 최대 60,000자 뒤에 붙는다).
 */
export function buildAuthoringMdOutputBlock(): string {
  return [
    "# OUTPUT FORMAT — MARKDOWN, NOT JSON",
    "This section REPLACES absolute rule 7. Do not output JSON. Output exactly the three sections below, in this order, using these Korean label lines verbatim. Nothing before the first section, nothing after the last.",
    "",
    "## 설계",
    `${L.skeleton}: <the spine code you commit to, e.g. S10>`,
    `${L.grounding}: <a, b, or c from the GROUNDING section>`,
    `${L.thesis}: <the controlling idea, one English line>`,
    `${L.warrantA}: <first support — must not restate the thesis>`,
    `${L.warrantB}: <second support — a DIFFERENT kind of reason from ${L.warrantA}, not the same reason reworded>`,
    // ⚠️ 이 두 칸의 문안은 schema.ts 의 plan describe 와 **같은 뜻이어야 한다**
    //   (두 레인이 같은 설계를 쓴다는 이 파일의 전제). 옛 문안("where and how the
    //   spine turns" / "how the final sentence re-abstracts")은 모델에게 각각
    //   "전환 전용 문장을 써라"·"논지를 재진술해라"로 읽혀, 실측 4편 전부에서
    //   중반 스텁과 결론 2문장을 만들어 냈다. 한쪽만 되돌리면 그대로 재발한다.
    `${L.turn}: <WHERE the spine turns — name the sentence it happens INSIDE. Never add a sentence whose only job is to announce the turn>`,
    `${L.closingMove}: <what the final sentence ADDS — the consequence or scope the body earned, in different nouns from the thesis. Exactly one sentence, and nothing before it may state that conclusion first>`,
    "",
    "## 지문",
    `${L.title}: <a short English title, 8 words or fewer, no quotes>`,
    `${L.passage}:`,
    "<the full passage starts on this line>",
    "",
    "## 메타",
    `${L.topicLabel}: <지문 소재를 가리키는 짧은 한국어 라벨. 예: 습관 형성>`,
    `${L.koreanSummary}: <이 지문이 무엇에 관한 글인지 한국어 한 줄 요약>`,
    // ⚠️ 2요소다(옛 3요소 아님). 줄인 근거는 schema.ts 의 rationale 주석에 있다 —
    //   요약하면 "검증할 수 없는 모델의 주장은 화면에 싣지 않는다". 옛 ③(문항 유형
    //   추천)은 6편 중 5편이 마지막 문장을 빈칸 자리로 지목했고, 옛 ②의 관계 라벨은
    //   재진술·대칭 쌍까지 '독립 근거'로 만들었다. 되살리려면 검증 수단부터 만들 것.
    `${L.rationale}: <선생님께 드리는 한국어 설명. 두 가지만 이 순서로 각각 한 문장씩: ① 어떤 골격(S코드)으로 썼는지와 그 골격이 꺾이는 지점(몇 번째 문장 '안'에서 꺾이는지). ② 논지 문장이 몇 번째이고 그것을 떠받치는 문장이 몇 번째인지 — 번호만 대고 그 문장들의 관계에 이름을 붙이지 말 것('근거1·근거2', '독립적으로 뒷받침' 같은 라벨 금지). 이 지문으로 어떤 문항을 내면 좋을지는 적지 않는다.>`,
    `${L.grammarPoints}: <어법 자료를 받았을 때만: 의도해서 심은 어법 포인트의 한국어 라벨을 쉼표로. 받지 않았으면 '없음'>`,
    `${L.words}: <단어장 자료를 받았을 때만: 실제로 쓴 표제어를 원형으로 쉼표로. 받지 않았으면 '없음'>`,
    "",
    "## HOW TO WRITE IT",
    `- Write 설계 BEFORE the passage and never reorder the sections. The plan is what the passage follows, not a summary composed afterwards.`,
    `- The \`${L.passage}:\` label sits alone on its line; the passage begins on the NEXT line and runs to the \`## 메타\` heading. Plain text, ONE unbroken paragraph, no blank lines, no markdown, no bullets, no headings, no title line, no surrounding quotes (absolute rule 2 and its genre exceptions still apply).`,
    `- The material directives above name JSON fields. Map them to labels here: \`plan.skeleton\` → ${L.skeleton}; \`usedGrammarPoints\` and \`grammarSpots\` → ${L.grammarPoints} (Korean labels only, no spans); \`usedWords\` and \`vocabAnchors\` → ${L.words} (base forms only).`,
    `- Language (this replaces absolute rule 6): ${L.topicLabel} · ${L.koreanSummary} · ${L.rationale} · ${L.grammarPoints} are Korean. ${L.thesis} · ${L.warrantA} · ${L.warrantB} · ${L.turn} · ${L.closingMove} · ${L.title} · ${L.passage} · ${L.words} are English. ${L.skeleton} and ${L.grounding} are codes.`,
    "- Never invent another \"라벨:\" line, never repeat a label, and never write the word 정답 or a question anywhere — this task produces a passage only.",
    "- Do not count words, sentences, or anything else for the teacher. The server measures the passage; a number you write here is ignored.",
  ].join("\n");
}
