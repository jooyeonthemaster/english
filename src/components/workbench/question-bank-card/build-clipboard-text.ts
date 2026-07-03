// @ts-nocheck
// 문제 카드 → 클립보드 직렬화 (평문 text/plain + 서식 text/html).
// 카드가 화면에 그리는 것과 동일한 표시 프리미티브(repairGrammarCorrectionQuestionText·
// formatStoredQuestionCorrectAnswer·option-display)를 재사용해 "보이는 그대로"를 복사한다.
//   - text/html 은 시험지 DOCX/HWPX 와 동일한 인라인 서식 마커(parseFormattedText 어휘:
//     <b>·<u>·__밑줄볼드__·_____빈칸·동그라미숫자·(A)마커)를 <b>/<u> 로 변환해, 한글/워드에
//     붙여넣을 때 볼드·밑줄이 유지되게 한다.
//   - "문제만"(includeAnswer=false): displayQuestionText 는 학생 안전 텍스트이며(요약문/주제문
//     영작 등은 정답계열이 questionText 직렬화에 애초 미포함 — SW-LEAK-1), 정답/해설을 붙이지
//     않으므로 답이 새지 않는다.
//   - "문제＋해설"(includeAnswer=true): 위에 [정답]·[해설]·[핵심 포인트]를 덧붙인다.

import { parseJSON } from "../shared/helpers";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import {
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  grammarMarkerDisplayLabel,
} from "@/components/exams/paper-builder/option-display";
import type { QuestionBankItem } from "./types";

function optionLine(
  label: string,
  text: string,
  subType: string | null,
): string {
  // 어법 판단(GRAMMAR_ERROR)만 라벨을 원형숫자(①)로 — 카드/시험지 렌더와 동일.
  const displayLabel =
    subType === "GRAMMAR_ERROR" ? grammarMarkerDisplayLabel(label) : label;
  return `${displayLabel ?? ""} ${text ?? ""}`.trim();
}

// keyPoints 는 문자열 또는 JSON 배열 문자열/배열로 저장될 수 있어 안전 정규화.
function formatKeyPoints(raw: unknown): string {
  if (!raw) return "";
  if (Array.isArray(raw)) {
    return raw
      .map((k) => String(k).trim())
      .filter(Boolean)
      .map((k) => `· ${k}`)
      .join("\n");
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          return arr
            .map((k) => String(k).trim())
            .filter(Boolean)
            .map((k) => `· ${k}`)
            .join("\n");
        }
      } catch {
        /* fall through — treat as plain text */
      }
    }
    return s;
  }
  return "";
}

// 문제/정답/해설을 "블록" 배열로 수집 — 평문·HTML 두 직렬화가 공유한다.
// 각 블록은 마커가 살아있는 평문 문자열(줄바꿈 \n 포함)이다.
function collectClipboardBlocks(
  q: QuestionBankItem,
  includeAnswer: boolean,
): string[] {
  const blocks: string[] = [];

  const questionText = repairGrammarCorrectionQuestionText({
    subType: q.subType,
    questionText: q.questionText,
    structuredData: q.structuredData,
  });
  if (questionText && questionText.trim()) blocks.push(questionText.trim());

  // 선지(MC) — 지문 마커형(어법·어휘·삽입·무관)은 마커가 지문에 있으므로 목록을 붙이지 않는다
  // (카드의 shouldRenderOptionListForSubtype 게이트와 동일).
  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const showOptions = !q.subType || shouldRenderOptionListForSubtype(q.subType);
  if (showOptions && options.length > 0) {
    const lines = options.map((opt, i) =>
      optionLine(
        opt.label,
        optionDisplayTextForSubtype(q.subType, i, opt.text),
        q.subType,
      ),
    );
    blocks.push(lines.join("\n"));
  }

  if (includeAnswer) {
    const answer = formatStoredQuestionCorrectAnswer(q);
    if (answer && String(answer).trim()) {
      blocks.push(`[정답] ${String(answer).trim()}`);
    }
    const ex = q.explanation;
    if (ex) {
      if (ex.content && ex.content.trim()) {
        blocks.push(`[해설] ${ex.content.trim()}`);
      }
      const kp = formatKeyPoints(ex.keyPoints);
      if (kp) blocks.push(`[핵심 포인트]\n${kp}`);
    }
  }

  return blocks;
}

export function buildQuestionClipboardText(
  q: QuestionBankItem,
  { includeAnswer }: { includeAnswer: boolean },
): string {
  return collectClipboardBlocks(q, includeAnswer).join("\n\n").trim();
}

// --------------------------------------------------------------------------
// HTML (서식 유지 붙여넣기용)
// --------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 인라인 서식 마커 → HTML. 시험지 DOCX(parseFormattedText)와 동일한 어휘/우선순위를 따른다.
//   <u>x</u> → 밑줄, <b>x</b> → 볼드, __x__/_x_ → 밑줄+볼드(마커 접두 분리),
//   _____ → 밑줄 빈칸, 동그라미숫자 → 볼드, (A)~(E) → 볼드.
function formatMarkersToHtml(text: string): string {
  const regex =
    /<u>(.*?)<\/u>|<b>(.*?)<\/b>|__([^_]+)__|_([^_]+)_|_{3,}|([①-⑳㉑-㉟㊱-㊿ⓐ-ⓩ])|\(([a-jA-J])\)/g;
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) out += escapeHtml(text.slice(lastIndex, m.index));

    if (m[1] != null) {
      out += `<u>${escapeHtml(m[1])}</u>`;
    } else if (m[2] != null) {
      out += `<b>${escapeHtml(m[2])}</b>`;
    } else if (m[3] || m[4]) {
      const word = m[3] || m[4];
      const circledPrefix = word.match(
        /^([①-⑳㉑-㉟㊱-㊿])\s(.+)$/,
      );
      if (circledPrefix) {
        out += `<b>${escapeHtml(circledPrefix[1])}</b> <u><b>${escapeHtml(circledPrefix[2])}</b></u>`;
      } else {
        const choicePrefix = word.match(/^\(([a-jA-J])\)\s(.+)$/);
        if (choicePrefix) {
          out += `<b>(${escapeHtml(choicePrefix[1])})</b> <u><b>${escapeHtml(choicePrefix[2])}</b></u>`;
        } else {
          out += `<u><b>${escapeHtml(word)}</b></u>`;
        }
      }
    } else if (m[5]) {
      out += `<b>${escapeHtml(m[5])}</b>`;
    } else if (m[6]) {
      out += `<b>(${escapeHtml(m[6])})</b>`;
    } else {
      // _____ 빈칸 — 밑줄 친 공백.
      out += `<u>${"&nbsp;".repeat(12)}</u>`;
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out += escapeHtml(text.slice(lastIndex));
  return out;
}

// 블록(줄바꿈 포함 평문) → HTML. 라벨([정답]·[해설]·[핵심 포인트])은 볼드 처리.
function blockToHtml(block: string): string {
  const labeled = block.match(/^(\[[^\]]+\])([\s\S]*)$/);
  const inner = labeled
    ? `<b>${escapeHtml(labeled[1])}</b>${lineToHtml(labeled[2])}`
    : lineToHtml(block);
  return inner;
}

function lineToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => formatMarkersToHtml(line))
    .join("<br>");
}

export function buildQuestionClipboardHtml(
  q: QuestionBankItem,
  { includeAnswer }: { includeAnswer: boolean },
): string {
  const blocks = collectClipboardBlocks(q, includeAnswer);
  const body = blocks
    .map((b) => `<div>${blockToHtml(b)}</div>`)
    .join('<div style="height:8px"></div>');
  // 맑은 고딕 — 시험지/문제 출력물 폰트와 통일(붙여넣기 초기 서식).
  return `<div style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11pt;line-height:1.6;color:#111">${body}</div>`;
}
