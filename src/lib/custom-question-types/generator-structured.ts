import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { model as geminiModel, GEMINI_MODEL_ID } from "@/lib/ai";
import { recordAiCost } from "@/lib/platform-api-costs";

import {
  type FormatSpec,
  type MarkerStyle,
  markerLabels,
  CHOICE_LAYOUT_LABELS,
  MARKER_STYLE_LABELS,
  STIMULUS_FORM_LABELS,
  BOX_KIND_LABELS,
} from "./format-spec";
import {
  type LayoutDoc,
  composeQuestionTextFromLayoutDoc,
  flattenLayoutChoices,
  layoutBlockSchema,
  layoutChoiceItemSchema,
  LAYOUT_DOC_VERSION,
  normalizeMarkerToken,
  parseLayoutDoc,
} from "./layout-doc";
import type { CompiledCustomType } from "./types";

// ============================================================================
// 구조화 생성기(v2) — FormatSpec 계약 기반 LayoutDoc 생성
// ============================================================================
// v1(generateGeneric)은 평문 questionText 만 만들었다. v2 는:
//  1) FormatSpec 을 결정적 '형식 계약' 프롬프트로 컴파일하고
//  2) 블록 기반 구조 출력(LayoutDoc 호환)을 받아
//  3) 스펙 일치(선지 수/마커/빈칸/박스/페어 셀/정답 정합)를 코드로 검증하고
//  4) 실패 시 오류 피드백을 다음 시도 프롬프트에 주입(critique→repair)한다.
// 산출 question 은 questionText(DSL 평문) + structuredData.layout(고충실도) 둘 다 가진다.

const STRUCTURED_TIMEOUT_MS = 150_000;
const STRUCTURED_MAX_TOKENS = 26_000;
const STRUCTURED_MAX_RETRIES = 3;

// ── AI 출력 스키마(전 leaf .catch — Gemini 제약 미강제 방어) ──
const planItemSchema = z.object({
  label: z.string().max(40).catch("").default(""),
  discriminator: z.string().max(400).catch("").default(""),
  fitsContext: z.boolean().catch(false).default(false),
});

const verdictItemSchema = z.object({
  label: z.string().max(40).catch("").default(""),
  isCorrect: z.boolean().catch(false).default(false),
  why: z.string().max(2000).catch("").default(""),
});

const structuredOutputSchema = z.object({
  direction: z.string().max(2000).catch("").default(""),
  blocks: z.array(layoutBlockSchema).max(12).catch([]).default([]),
  choicePlan: z.array(planItemSchema).max(20).catch([]).default([]),
  choices: z.array(layoutChoiceItemSchema).max(20).catch([]).default([]),
  correctAnswer: z.string().max(4000).catch("").default(""),
  correctAnswers: z.array(z.string().max(40).catch("")).max(20).catch([]).default([]),
  optionVerdicts: z.array(verdictItemSchema).max(20).catch([]).default([]),
  subjectiveAnswer: z.string().max(4000).catch("").default(""),
  explanation: z.string().max(4000).catch("").default(""),
  keyPoints: z.array(z.string().max(600).catch("")).max(8).catch([]).default([]),
});
type StructuredOutput = z.infer<typeof structuredOutputSchema>;

// 라벨 정규화는 layout-doc.ts 의 normalizeMarkerToken(클라이언트 공용)을 사용한다.
const CIRCLED_NUM_CHARS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function collectCorrectLabels(out: StructuredOutput): string[] {
  const set = new Set<string>();
  const addToken = (raw: string) => {
    const circled = [...raw].filter((ch) => CIRCLED_NUM_CHARS.includes(ch));
    if (circled.length > 1) {
      for (const ch of circled) {
        const n = normalizeMarkerToken(ch);
        if (n) set.add(n);
      }
      return;
    }
    const n = normalizeMarkerToken(raw);
    if (n) set.add(n);
  };
  for (const v of out.correctAnswers) if (v.trim()) addToken(v);
  for (const part of out.correctAnswer.split(/[,、\s]+/)) if (part.trim()) addToken(part);
  return [...set];
}

// ───────────────────────── 형식 계약 프롬프트 ─────────────────────────

function describeChoiceContract(format: FormatSpec): string[] {
  const c = format.choices;
  if (!c.present || c.count <= 0 || format.answer.shape === "SHORT_ANSWER") {
    return ["- 선지 없음(서술형): choices 는 빈 배열로 둘 것."];
  }
  const labels = markerLabels(c.markerStyle as MarkerStyle, c.count);
  const lines = [
    `- 선지 정확히 ${c.count}개. 마커는 ${MARKER_STYLE_LABELS[c.markerStyle as MarkerStyle]} — 라벨을 순서대로 정확히 [${labels.join(" ")}] 로 쓸 것.`,
    `- 선지 배치: ${CHOICE_LAYOUT_LABELS[c.layout]} (렌더러가 처리 — 내용만 충실히).`,
  ];
  switch (c.itemPattern) {
    case "PAIR":
      lines.push(
        `- 각 선지는 2칸 페어: cells 배열에 정확히 2개 값${
          c.columnHeaders.length === 2 ? ` (${c.columnHeaders.join(" / ")} 순서)` : ""
        }. text 는 비워 둘 것.`,
      );
      break;
    case "TRIPLE":
      lines.push(
        `- 각 선지는 3칸 조합: cells 배열에 정확히 3개 값${
          c.columnHeaders.length === 3 ? ` (${c.columnHeaders.join(" / ")} 순서)` : ""
        }. text 는 비워 둘 것.`,
      );
      break;
    case "TABLE_ROW":
      lines.push(
        `- 선지는 표의 행: cells 배열에 정확히 ${Math.max(c.columnHeaders.length, 2)}개 셀 (열 헤더: ${c.columnHeaders.join(" / ") || "원본과 동일"}).`,
      );
      break;
    case "COMBINATION":
      lines.push(
        `- 각 선지는 기호 조합(예: "ⓐ, ⓒ"): 본문 마커들을 콤마로 조합한 text. 조합은 선지마다 서로 달라야 함.`,
      );
      break;
    case "SEQUENCE":
      lines.push(`- 각 선지는 순서 나열(예: "(A)-(C)-(B)"): text 에 하이픈 연결.`);
      break;
    default:
      lines.push("- 각 선지는 단일 텍스트(text 필드). cells 는 비울 것.");
  }
  if (c.pairSeparator.trim()) {
    lines.push(`- 페어/조합 구분자는 "${c.pairSeparator.trim()}" 를 그대로 사용.`);
  }
  if (c.language !== "mixed") {
    lines.push(`- 선지 내용 언어: ${c.language === "en" ? "영어" : "한국어"}.`);
  }
  if (c.notes.trim()) lines.push(`- 선지 형식 메모: ${c.notes.trim()}`);
  return lines;
}

function describeStimulusContract(format: FormatSpec): string[] {
  const s = format.stimulus;
  if (!s.present || s.form === "NONE") {
    return ["- 별도 자료(지문) 없음 — 발문과 선지/답란만으로 구성."];
  }
  const lines = [
    `- 자료 형태: ${STIMULUS_FORM_LABELS[s.form]}${s.boxed ? " (박스 안에)" : ""}${s.titleLine ? ", 내부 제목 줄 포함" : ""}. blocks 의 ${s.boxed ? 'kind="BOX"' : 'kind="TEXT"'} 블록으로 작성.`,
  ];
  if (s.paragraphLabels.count > 0) {
    const labels = markerLabels(s.paragraphLabels.style as MarkerStyle, s.paragraphLabels.count);
    lines.push(
      `- 자료를 ${s.paragraphLabels.count}개 분할 단락으로: kind="LABELED_PARAS" 블록, items 라벨 [${labels.join(" ")}]. `,
    );
  }
  if (s.underlineMarks.count > 0) {
    const labels = markerLabels(s.underlineMarks.labelStyle as MarkerStyle, s.underlineMarks.count);
    lines.push(
      `- 본문에 라벨 밑줄 정확히 ${s.underlineMarks.count}개: 각각 "${labels[0] ?? "ⓐ"} __표현__" 형태(마커 뒤 더블언더스코어 밑줄). 라벨 순서대로 [${labels.join(" ")}].${
        s.underlineMarks.target ? ` 밑줄 대상: ${s.underlineMarks.target}.` : ""
      }`,
    );
  }
  if (s.blanks.count > 0) {
    const labelPart =
      s.blanks.labelStyle !== "NONE"
        ? ` 각 빈칸 앞에 라벨 [${markerLabels(s.blanks.labelStyle as MarkerStyle, s.blanks.count).join(" ")}] 표기.`
        : "";
    lines.push(`- 본문 빈칸 정확히 ${s.blanks.count}개: _____ (밑줄 5개) 로 표기.${labelPart}`);
  }
  if (s.numberedSentences.present) {
    lines.push(`- 본문 문장 앞에 ${MARKER_STYLE_LABELS[s.numberedSentences.style as MarkerStyle]} 번호를 붙일 것.`);
  }
  if (s.bulletSections.present) {
    lines.push(
      `- 안내문 구조: 섹션 헤더 ${s.bulletSections.headerCount || "수 개"} + "${s.bulletSections.bulletMarker.trim() || "•"} " 불릿 줄. TEXT 블록 안에 줄바꿈으로.`,
    );
  }
  if (s.language !== "mixed") {
    lines.push(`- 자료 언어: ${s.language === "en" ? "영어" : "한국어"}.`);
  }
  if (s.notes.trim()) lines.push(`- 자료 형식 메모: ${s.notes.trim()}`);
  return lines;
}

function describeBoxContract(format: FormatSpec): string[] {
  if (format.boxes.length === 0) return [];
  return format.boxes.map((box) => {
    const parts = [
      `- ${BOX_KIND_LABELS[box.kind]} 박스(kind="${box.kind === "TABLE" ? "TABLE" : box.kind}")`,
    ];
    if (box.label.trim()) parts.push(`라벨 "${box.label.trim()}"`);
    if (box.itemCount > 0) parts.push(`항목 정확히 ${box.itemCount}개${box.ordered ? "(번호 매김)" : ""}`);
    if (box.columnHeaders.length > 0) parts.push(`열 헤더: ${box.columnHeaders.join(" / ")}`);
    if (box.notes.trim()) parts.push(box.notes.trim());
    return parts.join(", ") + ".";
  });
}

function describeAnswerContract(format: FormatSpec): string[] {
  const a = format.answer;
  if (a.shape === "SHORT_ANSWER") {
    const sub = a.subjective;
    const lines = [
      "- 서술형: choices 빈 배열, correctAnswer 비우고 subjectiveAnswer 에 모범답안.",
    ];
    if (sub.answerBlankCount > 0) {
      lines.push(
        `- 답 슬롯 ${sub.answerBlankCount}개: kind="ANSWER_FORM" 블록의 items 로 (라벨 ${
          sub.blankLabelStyle !== "NONE"
            ? `[${markerLabels(sub.blankLabelStyle as MarkerStyle, sub.answerBlankCount).join(" ")}]`
            : "번호"
        }). subjectiveAnswer 에는 슬롯별 정답을 라벨과 함께.`,
      );
    }
    if (sub.answerFormat.trim()) lines.push(`- 요구 답 형태: ${sub.answerFormat.trim()}`);
    if (sub.conditionsCount > 0) {
      lines.push(`- 조건 박스(kind="CONDITIONS") 항목 정확히 ${sub.conditionsCount}개.`);
    }
    return lines;
  }
  const phrase =
    a.correctCount >= 2
      ? `정답 정확히 ${a.correctCount}개(복수 정답 — 발문에서 '모두 고르시오' 등으로 안내하되 개수는 밝히지 말 것)`
      : "정답 정확히 1개";
  return [
    `- 객관식: ${phrase}. correctAnswer 에 정답 라벨(복수면 ", " 연결), correctAnswers 배열에도 모든 정답 라벨.`,
    "- optionVerdicts: emit 한 각 선지 라벨마다 정확히 1개 {label, isCorrect, why}. why 는 실제 선지 내용을 근거로.",
  ];
}

function buildFormatContract(format: FormatSpec): string {
  const stem = format.stem;
  const stemLines = [
    `- 발문 1개(direction). ${stem.language === "en" ? "영어로" : stem.language === "ko" ? "한국어로" : "원본과 같은 언어로"} 작성.`,
  ];
  if (stem.pattern.trim()) stemLines.push(`- 발문 패턴(이 틀을 유지): "${stem.pattern.trim()}"`);
  if (stem.negativeForm) stemLines.push("- 부정형 발문('틀린 것/적절하지 않은 것')을 유지할 것.");
  if (stem.emphasis.length > 0) stemLines.push(`- 발문 강조 토큰 유지: ${stem.emphasis.join(", ")}`);

  return [
    "## 형식 계약 (위반 시 전체 거부 — 아래 모든 항목을 정확히 지킬 것)",
    "### 발문",
    ...stemLines,
    "### 자료(blocks)",
    ...describeStimulusContract(format),
    ...describeBoxContract(format),
    "### 선지(choices)",
    ...describeChoiceContract(format),
    "### 정답/답안",
    ...describeAnswerContract(format),
    ...(format.layoutNotes.length > 0
      ? ["### 형식 디테일(반드시 반영)", ...format.layoutNotes.map((n) => `- ${n}`)]
      : []),
  ].join("\n");
}

// ───────────────────────── 출력 골격 예시 ─────────────────────────
// 스펙만으로 생성할 때(원본 sourceLayout 부재·재시도) Gemini 가 blocks 구조를 못 잡고
// explanation 반복 루프에 빠지는 실패가 관측됐다(finishReason=length). 형식 계약에서
// 결정적으로 골격 JSON 을 만들어 보여 주면 구조 정합이 급격히 안정된다.
function buildOutputSkeleton(format: FormatSpec): string {
  const blocks: Array<Record<string, unknown>> = [];
  const s = format.stimulus;

  if (s.present && s.form !== "NONE") {
    if (s.paragraphLabels.count > 0) {
      blocks.push({
        kind: "LABELED_PARAS",
        items: markerLabels(s.paragraphLabels.style as MarkerStyle, s.paragraphLabels.count).map(
          (label) => ({ label, text: "<단락 내용>" }),
        ),
      });
    }
    const blankTokens =
      s.blanks.count > 0
        ? ` … ${markerLabels(
            s.blanks.labelStyle !== "NONE" ? (s.blanks.labelStyle as MarkerStyle) : "PAREN_ALPHA_UPPER",
            s.blanks.count,
          )
            .map((l) => (s.blanks.labelStyle !== "NONE" ? `${l} _____` : "_____"))
            .join(" … ")} …`
        : "";
    const underlineTokens =
      s.underlineMarks.count > 0
        ? ` … ${markerLabels(s.underlineMarks.labelStyle as MarkerStyle, s.underlineMarks.count)
            .map((l) => `${l} __<표현>__`)
            .join(" … ")} …`
        : "";
    blocks.push({
      kind: s.boxed ? "BOX" : "TEXT",
      text: `<${STIMULUS_FORM_LABELS[s.form]} 본문${underlineTokens}${blankTokens}>`,
    });
  }

  for (const box of format.boxes) {
    if (box.kind === "ANSWER_FORM") continue;
    const skeleton: Record<string, unknown> = { kind: box.kind };
    if (box.label.trim()) skeleton.label = box.label.trim();
    if (box.itemCount > 0) {
      skeleton.items = Array.from({ length: box.itemCount }, (_, i) => ({
        label: box.ordered ? `${i + 1}.` : "",
        text: "<항목>",
      }));
    } else if (box.kind === "TABLE") {
      skeleton.tableHeaders = box.columnHeaders.length ? box.columnHeaders : ["<열1>", "<열2>"];
      skeleton.tableRows = [["<셀>", "<셀>"]];
    } else {
      skeleton.text = "<내용>";
    }
    blocks.push(skeleton);
  }

  if (format.answer.shape === "SHORT_ANSWER" && format.answer.subjective.answerBlankCount > 0) {
    const labelStyle =
      format.answer.subjective.blankLabelStyle !== "NONE"
        ? (format.answer.subjective.blankLabelStyle as MarkerStyle)
        : "PAREN_ALPHA_UPPER";
    blocks.push({
      kind: "ANSWER_FORM",
      items: markerLabels(labelStyle, format.answer.subjective.answerBlankCount).map((label) => ({
        label,
        text: "",
      })),
    });
  }

  const isMc = format.answer.shape !== "SHORT_ANSWER" && format.choices.present && format.choices.count > 0;
  const cellCount =
    format.choices.itemPattern === "PAIR"
      ? 2
      : format.choices.itemPattern === "TRIPLE"
        ? 3
        : format.choices.itemPattern === "TABLE_ROW"
          ? Math.max(format.choices.columnHeaders.length, 2)
          : 0;
  const choices = isMc
    ? markerLabels(format.choices.markerStyle as MarkerStyle, format.choices.count).map((label) => ({
        label,
        text: cellCount > 0 ? "" : "<선지 내용>",
        cells: cellCount > 0 ? Array.from({ length: cellCount }, () => "<셀>") : [],
      }))
    : [];

  return JSON.stringify({ blocks, choices }, null, 1);
}

// ───────────────────────── 생성 프롬프트 ─────────────────────────

function buildStructuredPrompt(args: {
  spec: CompiledCustomType;
  format: FormatSpec;
  passage: string;
  gradeInfo: string;
  retryErrors: string[];
}): string {
  const { spec, format } = args;
  const passageBlock = spec.passageBased
    ? `## 새 지문 (이 지문으로 출제)\n${args.passage}`
    : `## 참고 지문 (이 유형은 지문 필수 아님 — 필요시만 활용)\n${args.passage}`;

  const invariantBlock = spec.invariants.length
    ? `## 반드시 보존 (유형의 본질)\n${spec.invariants.map((i) => `- ${i}`).join("\n")}`
    : "";
  const variableBlock = spec.variableAxes.length
    ? `## 매번 새로 (원본의 특정 단어/문장/소재 재사용 금지)\n${spec.variableAxes.map((v) => `- ${v}`).join("\n")}`
    : "";
  const usableTunable = spec.tunableParams.filter((p) => p.max > p.min);
  const tunableBlock = usableTunable.length
    ? `## 유형 수치 규칙\n${usableTunable.map((p) => `- ${p.label}: 정확히 ${p.value}개`).join("\n")}`
    : "";

  const sourceExample = spec.sourceLayout
    ? `## 원본 예시의 형식(이 모양 그대로, 내용은 새로)\n${composeQuestionTextFromLayoutDoc(spec.sourceLayout)}${
        spec.sourceLayout.choices
          ? `\n${flattenLayoutChoices(spec.sourceLayout.choices)
              .map((o) => `${o.label} ${o.text}`)
              .join("\n")}`
          : ""
      }`
    : "";

  const retryBlock = args.retryErrors.length
    ? `\n## 직전 시도가 거부된 이유 (이번에 반드시 모두 수정)\n${args.retryErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  const isMc = format.answer.shape !== "SHORT_ANSWER" && format.choices.present && format.choices.count > 1;

  return [
    `당신은 한국 고등학교 ${args.gradeInfo} 영어 시험 출제 전문가입니다.`,
    "아래 [유형 정의]와 [형식 계약]에 충실히 따라 동형(同形) 문항 1개를 만드세요.",
    "",
    spec.prompt,
    "",
    invariantBlock,
    variableBlock,
    tunableBlock,
    "",
    buildFormatContract(format),
    "",
    passageBlock,
    "",
    sourceExample,
    retryBlock,
    "## 출력 blocks/choices 골격 (정확히 이 구조로 — 꺾쇠 <> 자리만 실제 내용으로 채울 것)",
    buildOutputSkeleton(format),
    "",
    "## 출력 규칙 (순서대로)",
    "- direction: 발문.",
    '- blocks: 위 골격 그대로. 본문 밑줄은 __텍스트__, 라벨 밑줄은 "ⓐ __텍스트__" 형태, 빈칸은 _____ (밑줄 5개). 선지를 blocks 에 넣지 말 것. blocks 는 최소 1개.',
    isMc
      ? `- choicePlan: 선지를 쓰기 전에 ${format.choices.count}개 계획. discriminator 는 항목끼리 명확히 달라야 하고, fitsContext=true 는 정확히 ${format.answer.correctCount}개.`
      : "- choicePlan: (서술형이면 빈 배열)",
    "- choices: 형식 계약의 라벨/구조대로.",
    isMc
      ? "- correctAnswer/correctAnswers/optionVerdicts: 형식 계약대로. optionVerdicts 의 isCorrect=true 는 correctAnswer 와 정확히 일치."
      : "- subjectiveAnswer: 모범답안을 **한 번만, 2줄 이내로**(반복 출력 절대 금지).",
    "- explanation: 전체 총평 3문장 이내(선지별 근거는 optionVerdicts 에). keyPoints: 3개 이내.",
    "- blocks 의 text/items 에는 **학생에게 인쇄되어 보일 자료만** 넣을 것 — 교사 설명·풀이 안내·\"~해 봅시다\" 식 나레이션 금지(그런 내용은 explanation 으로).",
    "- 같은 문장/구를 두 번 이상 반복 출력하지 말 것(반복 루프 금지).",
    "- 원본 예시의 지문/문장/소재를 그대로 베끼지 말고, 제공된 새 지문으로 동형 재현.",
    "- Markdown code fence·raw JSON·정답 누출을 학생용 텍스트(direction/blocks/choices)에 넣지 말 것.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ───────────────────────── 검증 ─────────────────────────

function allBlockText(out: StructuredOutput): string {
  return out.blocks
    .map((b) =>
      [
        b.text,
        b.items.map((i) => `${i.label} ${i.text}`).join("\n"),
        b.tableRows.map((r) => r.join(" ")).join("\n"),
      ].join("\n"),
    )
    .join("\n");
}

export function validateStructuredOutput(
  format: FormatSpec,
  out: StructuredOutput,
): string[] {
  const errors: string[] = [];
  const isMc = format.answer.shape !== "SHORT_ANSWER" && format.choices.present && format.choices.count > 0;

  if (!out.direction.trim()) errors.push("direction(발문)이 비어 있습니다.");

  // ── 선지 구조 ──
  if (isMc) {
    const expectLabels = markerLabels(format.choices.markerStyle as MarkerStyle, format.choices.count);
    if (out.choices.length !== format.choices.count) {
      errors.push(`선지 ${out.choices.length}개 — 계약은 정확히 ${format.choices.count}개.`);
    } else {
      const normalizedExpect = expectLabels.map(normalizeMarkerToken);
      out.choices.forEach((c, i) => {
        if (normalizeMarkerToken(c.label) !== normalizedExpect[i]) {
          errors.push(`선지 ${i + 1}의 라벨 "${c.label}" — 계약 라벨은 "${expectLabels[i]}".`);
        }
      });
    }
    const cellCount =
      format.choices.itemPattern === "PAIR"
        ? 2
        : format.choices.itemPattern === "TRIPLE"
          ? 3
          : format.choices.itemPattern === "TABLE_ROW"
            ? Math.max(format.choices.columnHeaders.length, 2)
            : 0;
    if (cellCount > 0) {
      out.choices.forEach((c, i) => {
        const cells = c.cells.map((v) => v.trim()).filter(Boolean);
        if (cells.length !== cellCount) {
          errors.push(`선지 ${i + 1}: cells ${cells.length}칸 — 계약은 ${cellCount}칸.`);
        }
      });
    } else {
      out.choices.forEach((c, i) => {
        if (!c.text.trim() && c.cells.filter((v) => v.trim()).length === 0) {
          errors.push(`선지 ${i + 1}의 내용이 비어 있습니다.`);
        }
      });
    }

    // ── 정답 정합(라벨 픽 게이트) ──
    const optionLabels = new Set(out.choices.map((c) => normalizeMarkerToken(c.label)));
    if (optionLabels.size !== out.choices.length) errors.push("선지 라벨이 중복/비어 있습니다.");
    const correctLabels = collectCorrectLabels(out);
    if (correctLabels.length !== format.answer.correctCount) {
      errors.push(`정답 라벨 ${correctLabels.length}개 — 계약은 ${format.answer.correctCount}개.`);
    }
    const missing = correctLabels.filter((l) => !optionLabels.has(l));
    if (missing.length) errors.push(`정답 라벨이 선지에 없음: ${missing.join(", ")}`);

    if (out.optionVerdicts.length === 0) {
      errors.push("optionVerdicts 가 비어 있습니다.");
    } else {
      const verdictSet = new Set(out.optionVerdicts.map((v) => normalizeMarkerToken(v.label)));
      const covers =
        verdictSet.size === optionLabels.size && [...optionLabels].every((l) => verdictSet.has(l));
      if (!covers) errors.push("optionVerdicts 가 선지와 1:1 대응하지 않습니다.");
      const verdictCorrect = out.optionVerdicts
        .filter((v) => v.isCorrect)
        .map((v) => normalizeMarkerToken(v.label));
      if (verdictCorrect.length !== format.answer.correctCount) {
        errors.push(`해설 정답 표시 ${verdictCorrect.length}개 — 계약은 ${format.answer.correctCount}개.`);
      }
      const correctSet = new Set(correctLabels);
      if (!verdictCorrect.every((l) => correctSet.has(l))) {
        errors.push("optionVerdicts 의 정답 표시가 correctAnswer 와 불일치.");
      }
    }
    if (out.choicePlan.length > 0) {
      const fits = out.choicePlan.filter((p) => p.fitsContext).length;
      if (fits !== format.answer.correctCount) {
        errors.push(`choicePlan 정답 후보 ${fits}개 — 계약은 ${format.answer.correctCount}개.`);
      }
    }
  } else {
    if (out.choices.length > 0) errors.push("서술형 계약인데 choices 가 비어 있지 않습니다.");
    if (!out.subjectiveAnswer.trim()) errors.push("subjectiveAnswer(모범답안)가 비어 있습니다.");
  }

  // ── 자료 구조 ──
  const bodyText = allBlockText(out);
  const s = format.stimulus;
  if (s.present && s.form !== "NONE" && out.blocks.length === 0) {
    errors.push("자료 블록(blocks)이 비어 있습니다.");
  }
  if (s.blanks.count > 0) {
    const blanks = bodyText.match(/_{3,}/g)?.length ?? 0;
    // 라벨 밑줄(__x__)은 _{3,} 에 안 걸리므로 순수 빈칸만 카운트된다.
    if (blanks !== s.blanks.count) {
      errors.push(`본문 빈칸(_____) ${blanks}개 — 계약은 정확히 ${s.blanks.count}개.`);
    }
  }
  if (s.underlineMarks.count > 0) {
    const labels = markerLabels(s.underlineMarks.labelStyle as MarkerStyle, s.underlineMarks.count);
    const missingMarks = labels.filter((l) => l && !bodyText.includes(l));
    if (missingMarks.length > 0) {
      errors.push(`본문 라벨 밑줄 마커 누락: ${missingMarks.join(" ")}`);
    }
    const underlineCount = bodyText.match(/__[^_]+__/g)?.length ?? 0;
    if (underlineCount < s.underlineMarks.count) {
      errors.push(
        `본문 밑줄(__…__) ${underlineCount}개 — 계약은 ${s.underlineMarks.count}개 이상(마커마다 1개).`,
      );
    }
  }
  if (s.paragraphLabels.count > 0) {
    const parasBlock = out.blocks.find((b) => b.kind === "LABELED_PARAS");
    const got = parasBlock?.items.filter((i) => i.text.trim()).length ?? 0;
    if (got !== s.paragraphLabels.count) {
      errors.push(`분할 단락 ${got}개 — 계약은 ${s.paragraphLabels.count}개(LABELED_PARAS 블록).`);
    }
  }
  for (const box of format.boxes) {
    if (box.kind === "ANSWER_FORM") continue;
    const match = out.blocks.find(
      (b) => b.kind === box.kind || (box.label.trim() && b.label.trim() === box.label.trim()),
    );
    if (!match) {
      errors.push(`${BOX_KIND_LABELS[box.kind]} 박스가 없습니다(kind="${box.kind}").`);
      continue;
    }
    if (box.itemCount > 0) {
      const got = match.items.filter((i) => i.text.trim()).length;
      if (got !== box.itemCount) {
        errors.push(`${BOX_KIND_LABELS[box.kind]} 항목 ${got}개 — 계약은 ${box.itemCount}개.`);
      }
    }
  }
  if (format.answer.shape === "SHORT_ANSWER" && format.answer.subjective.conditionsCount > 0) {
    const cond = out.blocks.find((b) => b.kind === "CONDITIONS");
    const got = cond?.items.filter((i) => i.text.trim()).length ?? 0;
    if (got !== format.answer.subjective.conditionsCount) {
      errors.push(`조건 ${got}개 — 계약은 ${format.answer.subjective.conditionsCount}개.`);
    }
  }

  // ── 누출/래퍼 게이트 ──
  const visible = [out.direction, bodyText, out.choices.map((c) => `${c.text} ${c.cells.join(" ")}`).join("\n")].join("\n");
  if (/```|"questions"\s*:|<\/?html|End of Response/i.test(visible)) {
    errors.push("코드펜스/JSON/래퍼 텍스트가 학생용 본문에 섞였습니다.");
  }

  return errors;
}

// ───────────────────────── 조립 ─────────────────────────

export interface StructuredGenerationResult {
  question: Record<string, unknown>;
  layout: LayoutDoc;
  validationErrors: string[];
  llmAttempts: number;
}

function assembleQuestion(
  spec: CompiledCustomType,
  format: FormatSpec,
  out: StructuredOutput,
): { question: Record<string, unknown>; layout: LayoutDoc } {
  const isMc = format.answer.shape !== "SHORT_ANSWER" && format.choices.present && format.choices.count > 0;

  const answerLineCount =
    format.answer.shape === "SHORT_ANSWER" || format.answer.shape === "MIXED"
      ? format.answer.subjective.answerLineCount
      : 0;

  const layout: LayoutDoc = parseLayoutDoc({
    version: LAYOUT_DOC_VERSION,
    direction: out.direction.trim(),
    blocks: out.blocks,
    choices: isMc
      ? {
          markerStyle: format.choices.markerStyle,
          layout: format.choices.layout,
          itemPattern: format.choices.itemPattern,
          pairSeparator: format.choices.pairSeparator,
          columnHeaders: format.choices.columnHeaders,
          items: out.choices,
        }
      : null,
    answerLineCount,
  });

  const questionText = composeQuestionTextFromLayoutDoc(layout);
  const options = layout.choices ? flattenLayoutChoices(layout.choices) : [];

  const correctAnswers = out.correctAnswers.map((v) => v.trim()).filter(Boolean);
  const correctAnswer = isMc
    ? out.correctAnswer.trim() || correctAnswers.join(", ")
    : out.subjectiveAnswer.trim();

  // 선지별 근거(wrongOptionExplanations 계약: label→근거)
  const wrongOptionExplanations: Record<string, string> = {};
  for (const v of out.optionVerdicts) {
    if (v.label.trim() && v.why.trim()) wrongOptionExplanations[v.label.trim()] = v.why.trim();
  }

  const question: Record<string, unknown> = {
    _typeId: "CUSTOM_LAYOUT",
    subType: "CUSTOM_LAYOUT",
    questionText,
    layout,
    correctAnswer,
    explanation: out.explanation.trim(),
    keyPoints: out.keyPoints.filter((k) => k.trim()),
    difficulty: spec.difficulty,
    _genericCustom: true,
    _customLayout: true,
  };
  if (isMc && options.length > 0) question.options = options;
  if (correctAnswers.length > 0) question.correctAnswers = correctAnswers;
  if (Object.keys(wrongOptionExplanations).length > 0) {
    question.wrongOptionExplanations = wrongOptionExplanations;
  }
  if (!isMc && out.subjectiveAnswer.trim()) question.modelAnswer = out.subjectiveAnswer.trim();

  return { question, layout };
}

/** FormatSpec 계약 기반 구조화 생성 — 검증 실패 시 오류 피드백을 다음 시도에 주입. */
export async function generateStructuredFromSpec(args: {
  spec: CompiledCustomType;
  format: FormatSpec;
  passage: string;
  gradeInfo?: string;
  academyId?: string | null;
}): Promise<StructuredGenerationResult> {
  const retryErrors: string[] = [];
  let lastError: unknown;

  for (let attempt = 0; attempt < STRUCTURED_MAX_RETRIES; attempt += 1) {
    try {
      const prompt = buildStructuredPrompt({
        spec: args.spec,
        format: args.format,
        passage: args.passage,
        gradeInfo: args.gradeInfo ?? "",
        retryErrors,
      });
      const result = await generateObject({
        model: geminiModel,
        schema: structuredOutputSchema,
        maxOutputTokens: STRUCTURED_MAX_TOKENS,
        abortSignal: AbortSignal.timeout(STRUCTURED_TIMEOUT_MS),
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 4096 } } },
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      });
      await recordAiCost({
        sourceType: "CUSTOM_QTYPE_AI",
        sourceDetail: "structured-generation",
        academyId: args.academyId,
        model: GEMINI_MODEL_ID,
        operationType: "CUSTOM_QTYPE_GEN",
        usage: result.usage,
      });
      const out = result.object;

      const errors = validateStructuredOutput(args.format, out);
      if (errors.length > 0) {
        retryErrors.splice(0, retryErrors.length, ...errors);
        // 진단용: 모델이 '무엇을' 보냈는지 머리 부분을 남긴다(빈 배열 연속 실패 원인 추적).
        console.warn(
          `[CUSTOM-TYPE-STRUCTURED] attempt ${attempt} outHead=${JSON.stringify(out).slice(0, 400)}`,
        );
        throw new Error(`구조화 생성 형식 오류: ${errors.join(" / ")}`);
      }

      const { question, layout } = assembleQuestion(args.spec, args.format, out);
      if (!String(question.questionText ?? "").trim()) {
        throw new Error("구조화 생성 결과 questionText 가 비어 있습니다.");
      }
      return { question, layout, validationErrors: [], llmAttempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      let detail = error instanceof Error ? error.message : String(error);
      if (NoObjectGeneratedError.isInstance(error)) {
        detail = `${error.message} | finishReason=${error.finishReason ?? "?"} | rawHead=${(error.text ?? "").slice(0, 400)}`;
      }
      console.warn(`[CUSTOM-TYPE-STRUCTURED] attempt ${attempt} failed: ${detail}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("구조화 생성에 실패했습니다.");
}
