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
//   - 지문(clipboardPassageText): 유형별로 지문이 questionText 에 baked 되지 않는 경우
//     (출처지문형·국어·세트멤버)에 한해 leak-safe 하게 지문을 발문 뒤에 끼워 "지문이 딸려오게"
//     한다. embedded 유형은 마스킹 지문이 이미 questionText 안에 있어 아무것도 붙이지 않는다
//     (원본 raw 를 붙이면 정답 누출). 판정은 시험지 생성와 동일한 정책 헬퍼를 재사용한다.

import { parseJSON } from "../shared/helpers";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import {
  circleGrammarLabelMentions,
  formatMultiBlankOptionText,
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  grammarMarkerDisplayLabel,
} from "@/components/exams/paper-builder/option-display";
import { isKoQuestionType } from "@/lib/korean/registry";
import {
  koPaperRenderModel,
  koPassagePartText,
} from "@/components/exams/paper-builder/korean/ko-paper-adapter";
import {
  ANSWER_BEARING_SOURCE_SUBTYPES,
  QUESTION_PASSAGE_FLOW_RULES,
  questionHasEmbeddedPassage,
  shouldRenderSourcePassageInsideQuestion,
} from "@/components/exams/paper-builder/passage-policy";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { setMemberDisplayPassage } from "./set-member-passage";
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

// 오답 해설(선지별) — Record(영어)/배열([{label, explanation}], KO 봉투)/JSON 문자열
// 모두 수용(시험지 explanation-content 와 동일 정규화). 어법은 라벨·본문 라벨 참조를
// 원형숫자로 표시 변환.
function formatWrongOptionExplanations(
  raw: unknown,
  subType: string | null,
): string {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    try {
      parsed = JSON.parse(s);
    } catch {
      return "";
    }
  }
  if (!parsed || typeof parsed !== "object") return "";
  const record: Record<string, string> = Array.isArray(parsed)
    ? Object.fromEntries(
        parsed
          .filter(
            (e): e is { label: string; explanation: string } =>
              !!e &&
              typeof e === "object" &&
              typeof (e as { label?: unknown }).label === "string" &&
              typeof (e as { explanation?: unknown }).explanation === "string",
          )
          .map((e) => [e.label, e.explanation]),
      )
    : (parsed as Record<string, string>);
  const isGrammar = subType === "GRAMMAR_ERROR";
  return Object.entries(record)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([label, v]) => {
      const displayLabel = isGrammar ? grammarMarkerDisplayLabel(label) : label;
      const text = isGrammar ? circleGrammarLabelMentions(v.trim()) : v.trim();
      return `${displayLabel} ${text}`.trim();
    })
    .join("\n");
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

// 카드가 화면에 지문을 보여주는 것과 동일하게, 클립보드에도 지문을 "딸려" 보낸다.
// 유형별로 지문 저장 위치가 달라 questionText 에 baked 되지 않는 유형(출처지문형·국어·
// 세트멤버)은 여기서 유형별 특성에 맞는 leak-safe 지문 텍스트를 만들어 붙인다. 반대로
// embedded 유형은 이미 마스킹된 지문이 questionText 에 들어 있으므로(원본 raw 를 붙이면
// 빈칸/마커가 채워진 정답이 새어 나감) null 을 돌려 아무것도 붙이지 않는다.
//   반환: 붙일 지문 텍스트(마커 __밑줄__ 유지) 또는 null(붙일 것 없음/이미 포함/누출 위험).
// 정책 판단은 시험지 생성와 동일한 헬퍼(passage-policy·ko-paper-adapter·
// source-passage-markers)를 재사용해 다운로드(한글/워드) 산출물과 정합을 맞춘다.
function clipboardPassageText(
  q: QuestionBankItem,
  includeAnswer: boolean,
): string | null {
  const subType = q.subType || "";
  const rawPassage = q.passage?.content?.trim() || "";

  // 1) 국어(KO) — 지문(model.passage.parts)만 추출한다. 【자료】(자체자료)·보기·조건은
  //    이미 serializeKoQuestion 이 questionText 에 넣으므로 재추출 금지(중복 방지).
  //    raw q.passage 는 KO_NS_CLOZE 등에서 정답 verbatim 을 담아 절대 쓰지 않는다 —
  //    마스킹·(가)(나) 병합이 끝난 렌더모델 지문만 사용한다.
  if (isKoQuestionType(subType)) {
    try {
      const model = koPaperRenderModel({
        sourceQuestion: {
          subType,
          structuredData: q.structuredData,
          questionText: q.questionText,
          passage: q.passage ? { content: q.passage.content } : null,
        },
      });
      const parts = model?.passage?.parts ?? [];
      const text = parts
        .map((p) => koPassagePartText(p).trim())
        .filter(Boolean)
        .join("\n\n")
        .trim();
      return text || null;
    } catch {
      return null;
    }
  }

  // 2) 장문 세트 멤버 — 지문이 questionText 에 baked 되지 않고 anchor(spans)로만
  //    저장된다. 복원 지문(밑줄/빈칸/마커 적용본)을 붙이되, embedded 유형인데 복원본이
  //    raw 원본과 같으면(spans 결손 → 마스킹 실패) 정답이 새므로 건너뛴다.
  if (q.inSet || q.setId) {
    const recon = setMemberDisplayPassage(q)?.trim() || "";
    if (!recon) return null;
    const embeddedFlow = QUESTION_PASSAGE_FLOW_RULES[subType] === "embedded";
    if (embeddedFlow && recon === rawPassage) return null; // 마스킹 실패 → 누출 방지
    if (ANSWER_BEARING_SOURCE_SUBTYPES.has(subType) && !includeAnswer) return null;
    return recon;
  }

  // 3) 영어 embedded — 마스킹 지문이 이미 questionText 에 있다(어법·빈칸·삽입·순서·
  //    어휘·함축·지칭·무관·문법수정·핵심빈칸·커스텀 등). 아무것도 붙이지 않는다(중복·누출 방지).
  if (
    questionHasEmbeddedPassage({
      subType,
      questionText: q.questionText,
      structuredData: q.structuredData,
      passage: { content: rawPassage },
    })
  ) {
    return null;
  }

  // 4) 영어 출처지문형(source) — 원본 지문을 붙인다(주제·요지·제목·내용일치·요약완성·
  //    요약영작·주제문영작·배열영작·동의어 등). 정답이 지문에 verbatim 인 answer-bearing
  //    (조건부영작·문장전환)은 문제만 모드에서 생략하고 문제＋해설에서만 포함한다.
  if (!rawPassage) return null;
  if (!shouldRenderSourcePassageInsideQuestion(subType)) return null;
  if (ANSWER_BEARING_SOURCE_SUBTYPES.has(subType) && !includeAnswer) return null;
  // WORD_ORDER/SENTENCE_TRANSFORM 은 대상 문장에 밑줄(__ __)을 입힌다(그 외 유형엔 no-op).
  return (
    formatSourcePassageForQuestionItems(rawPassage, [
      {
        questionText: q.questionText,
        sourceQuestion: {
          subType,
          questionText: q.questionText,
          structuredData: q.structuredData,
        },
      },
    ]).trim() || rawPassage
  );
}

// 중복 판정용 정규화 — [라벨] 접두·(A)~(E)/원문자 마커·__밑줄__/빈칸선·공백을 지워
// "같은 문장"을 지문 블록과 나머지 블록 사이에서 비교한다(마커 스타일이 달라도 동일 문장으로
// 인식). SENTENCE_TRANSFORM 의 [원문]·세트멤버의 단일 문장 폴백처럼, 붙인 지문에 이미 통째로
// 들어 있는 문장을 별도 블록으로 또 내보내지 않도록 걸러내는 데 쓴다.
function dedupKey(text: string): string {
  return text
    .replace(/^\s*\[[^\]]+\]\s*/, "") // 선두 [원문]/[영작할 우리말] 등 라벨
    .replace(/\([A-Ea-e]\)/g, " ") // (A)~(E) 마커 라벨(문법수정·요약 등)
    // 그 외 구두점·마커·__밑줄__·_____ 빈칸선·원문자를 전부 공백으로 — 단어 시퀀스만 비교해
    // 마커 스타일·구두점 간격 차이(예: "vacuum__." vs "vacuum.")로 매칭이 어긋나지 않게 한다.
    .replace(/[^0-9A-Za-z가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// 문제/정답/해설을 "블록" 배열로 수집 — 평문·HTML 두 직렬화가 공유한다.
// 각 블록은 마커가 살아있는 평문 문자열(줄바꿈 \n 포함)이다.
function collectClipboardBlocks(
  q: QuestionBankItem,
  includeAnswer: boolean,
): string[] {
  const blocks: string[] = [];

  const questionText = (
    repairGrammarCorrectionQuestionText({
      subType: q.subType,
      questionText: q.questionText,
      structuredData: q.structuredData,
    }) || ""
  ).trim();

  // 지문 부착(유형별 leak-safe). null 이면 기존 동작(questionText 단일 블록) 그대로 —
  // embedded 유형은 회귀 0. 지문을 붙일 땐 발문(첫 블록) 다음에 끼워
  // [발문] → [지문] → [나머지 보기/조건/해석/요약문…] 순으로 만든다(시험지 DOCX 순서와 동일).
  const passageText = clipboardPassageText(q, includeAnswer);
  if (questionText) {
    if (passageText) {
      // KO 는 【 헤더 경계로만 분할한다 — 보기/자료/조건 박스 안의 빈 줄이 \n\n 로 쪼개져
      // 박스가 두 블록으로 갈라지는 회귀를 막는다. 영어는 기존 \n\n 블록 경계.
      const isKo = (q.subType || "").startsWith("KO_");
      const qtBlocks = (
        isKo ? questionText.split(/\n(?=【)/) : questionText.split(/\n\n/)
      )
        .map((b) => b.trim())
        .filter(Boolean);
      if (qtBlocks.length > 0) {
        blocks.push(qtBlocks[0]);
        blocks.push(passageText);
        // 붙인 지문에 이미 통째로 들어 있는 문장(=[원문] 블록, 세트멤버 단일 문장 폴백 등)은
        // 중복이므로 나머지 블록에서 제거한다(카드/시험지 렌더처럼 지문 한 번만).
        const passageKey = dedupKey(passageText);
        for (const b of qtBlocks.slice(1)) {
          const key = dedupKey(b);
          if (key.length > 12 && passageKey.includes(key)) continue;
          blocks.push(b);
        }
      } else {
        blocks.push(passageText);
      }
    } else {
      blocks.push(questionText);
    }
  } else if (passageText) {
    blocks.push(passageText);
  }

  // 선지(MC) — 지문 마커형(어법·어휘·삽입·무관)은 마커가 지문에 있으므로 목록을 붙이지 않는다
  // (카드의 shouldRenderOptionListForSubtype 게이트와 동일).
  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const showOptions = !q.subType || shouldRenderOptionListForSubtype(q.subType);
  if (showOptions && options.length > 0) {
    const lines = options.map((opt, i) =>
      optionLine(
        opt.label,
        // 다중 빈칸(BLANK_INFERENCE) 조합 선지: 클립보드는 흐름 텍스트라 컬럼
        // 정렬(HTML 그리드의 (A)/(B) 헤더 행)이 불가 — 인라인 라벨 근사가 실용적.
        q.subType === "BLANK_INFERENCE"
          ? formatMultiBlankOptionText(opt.text)
          : optionDisplayTextForSubtype(q.subType, i, opt.text),
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
      // 어법(GRAMMAR_ERROR)만 해설 산문의 "(A)" 라벨을 원형숫자(①)로 —
      // 카드 팝오버·시험지 해설과 동일 표시 규약(데이터는 (A) 유지).
      const prose = (t: string) =>
        q.subType === "GRAMMAR_ERROR" ? circleGrammarLabelMentions(t) : t;
      if (ex.content && ex.content.trim()) {
        blocks.push(`[해설] ${prose(ex.content.trim())}`);
      }
      const kp = formatKeyPoints(ex.keyPoints);
      if (kp) blocks.push(`[핵심 포인트]\n${prose(kp)}`);
      // 오답 해설(선지별) — 26-07-06 실측: 복사/다운로드 전 경로에서 통째 누락되던 섹션.
      const woe = formatWrongOptionExplanations(
        ex.wrongOptionExplanations,
        q.subType ?? null,
      );
      if (woe) blocks.push(`[오답 해설]\n${woe}`);
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
