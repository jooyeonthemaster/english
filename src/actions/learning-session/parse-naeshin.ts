// ---------------------------------------------------------------------------
// NaeshinQuestion → SessionQuestion 변환 helpers (server-internal, no
// "use server" directive — pure functions, imported by session actions).
// ---------------------------------------------------------------------------

import type { LearningCategory } from "@/lib/learning-constants";
import type { SessionQuestion } from "@/lib/learning-types";

export interface NaeshinQuestionRow {
  id: string;
  type: string;
  subType: string | null;
  learningCategory: string;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  explanation: { content: string; keyPoints: string | null } | null;
}

/** options 정규화 — AI 출력이 여러 형태로 올 수 있음
 *  1) [{label:"A", text:"..."}]  → 정상
 *  2) {"A":"...", "B":"..."}     → 객체 형태
 *  3) ["A. ...", "B. ..."]       → 문자열 배열 */
export function normalizeOptions(raw: unknown): { label: string; text: string }[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    // [{label, text}] 형태
    if (typeof raw[0] === "object" && raw[0] !== null && "label" in raw[0] && "text" in raw[0]) {
      return raw as { label: string; text: string }[];
    }
    // ["A. ...", "B. ..."] 문자열 배열
    if (typeof raw[0] === "string") {
      return raw.map((s: string, i: number) => {
        const match = s.match(/^([A-Z])[.:]\s*(.*)/);
        if (match) return { label: match[1], text: match[2] };
        return { label: String.fromCharCode(65 + i), text: s };
      });
    }
    // ["A: ...", ...] 형태
    if (typeof raw[0] === "string") {
      return raw.map((s: string, i: number) => ({
        label: String.fromCharCode(65 + i),
        text: String(s),
      }));
    }
  }
  // {"A":"...", "B":"..."} 객체 형태
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return Object.entries(raw).map(([label, text]) => ({
      label,
      text: String(text),
    }));
  }
  return null;
}

export function parseNaeshinQuestion(
  q: NaeshinQuestionRow,
  fallbackCategory: LearningCategory,
  sentenceTranslations?: Map<string, string>
): SessionQuestion {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any> = {};
  try { data = JSON.parse(q.questionText); } catch { /* raw text fallback */ }

  const subType = q.subType ?? "";
  let questionText = "";
  let options: { label: string; text: string }[] | null = null;
  let correctAnswer = q.correctAnswer || "";
  let passageSnippet: string | undefined;

  switch (subType) {
    // ── VOCAB ────────────────────────────────
    case "WORD_MEANING":
      questionText = data.word
        ? `다음 문장에서 '${data.word}'의 의미로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`
        : `다음 단어의 의미로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "WORD_MEANING_REVERSE": {
      const korMeaning = data.koreanMeaning || data.meaning || "";
      questionText = korMeaning
        ? `'${korMeaning}'에 해당하는 영어 단어는?`
        : `다음에 해당하는 영어 단어는?`;
      options = normalizeOptions(data.options);
      break;
    }
    case "WORD_FILL":
      questionText = `빈칸에 들어갈 가장 알맞은 단어는?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "WORD_MATCH":
      questionText = "영어 단어와 한국어 뜻을 올바르게 연결하세요.";
      // pairs는 rawData로 전달
      break;
    case "WORD_SPELL": {
      const meaning = data.koreanMeaning || "";
      const hint = data.hint || "";
      const answer = data.correctAnswer || q.correctAnswer || "";
      const blanks = answer.length > hint.length ? "_".repeat(answer.length - hint.length) : "____";
      // correctAnswer(영단어)로 PassageAnalysis에서 포함 문장의 한국어 번역 찾기
      let contextLine = "";
      if (sentenceTranslations && sentenceTranslations.size > 0 && answer) {
        const answerLower = answer.toLowerCase();
        for (const [eng, kor] of sentenceTranslations) {
          if (eng.includes(answerLower)) {
            if (meaning) {
              // 정확 일치 먼저
              if (kor.includes(meaning)) {
                contextLine = kor.replace(meaning, `**${meaning}**`);
              } else {
                // 어근 매칭: "식별하다" → "식별" 추출 후 "식별하기는" 찾기
                const stem = meaning.replace(/(하다|되다|시키다|적인|적$)/g, "");
                if (stem.length >= 2) {
                  const regex = new RegExp(`(${stem}[가-힣]*)`, "g");
                  const match = kor.match(regex);
                  if (match) {
                    contextLine = kor.replace(match[0], `**${match[0]}**`);
                  } else {
                    contextLine = kor;
                  }
                } else {
                  contextLine = kor;
                }
              }
            } else {
              contextLine = kor;
            }
            break;
          }
        }
      }
      questionText = contextLine
        ? `강조된 단어를 영어로 입력하세요.\n\n${contextLine}\n\n힌트: ${hint}${blanks}`
        : `다음 뜻에 해당하는 영어 단어를 입력하세요.\n\n"${meaning}"\n\n힌트: ${hint}${blanks}`;
      correctAnswer = answer;
      break;
    }
    case "VOCAB_SYNONYM":
      questionText = data.word
        ? `'${data.word}'의 ${data.targetRelation === "synonym" ? "유의어" : "반의어"}로 가장 알맞은 것은?\n\n${data.contextSentence || ""}`
        : `다음 단어의 ${data.targetRelation === "synonym" ? "유의어" : "반의어"}는?\n\n${data.contextSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "VOCAB_DEFINITION":
      questionText = `다음 영어 정의에 해당하는 단어는?\n\n"${data.englishDefinition || ""}"`;
      options = normalizeOptions(data.options);
      // contextSentence에 정답이 포함되므로 지문 표시 안 함
      break;
    case "VOCAB_COLLOCATION":
      questionText = `빈칸에 들어갈 알맞은 단어는?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "VOCAB_CONFUSABLE":
      questionText = `빈칸에 들어갈 올바른 단어는?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;

    // ── INTERPRETATION ───────────────────────
    case "SENTENCE_INTERPRET":
      questionText = `다음 영어 문장의 해석으로 가장 알맞은 것은?\n\n${data.englishSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "SENTENCE_COMPLETE":
      questionText = `다음 한국어 해석에 맞는 영어 문장을 고르세요.\n\n${data.koreanSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "WORD_ARRANGE":
      questionText = `다음 한국어 뜻에 맞게 영어 단어/구를 배열하세요.\n\n${data.koreanSentence || ""}`;
      break;
    case "KEY_EXPRESSION":
      questionText = `빈칸에 들어갈 핵심 표현은?\n\n${data.sentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "SENT_CHUNK_ORDER":
      questionText = `다음 한국어 해석에 맞게 끊어읽기 순서를 배열하세요.\n\n${data.koreanHint || ""}`;
      break;

    // ── GRAMMAR ──────────────────────────────
    case "GRAMMAR_SELECT":
      questionText = `빈칸에 들어갈 올바른 문법 형태는?\n\n${data.sentence || data.contextSentence || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "ERROR_FIND":
      questionText = `다음 문장에서 문법 오류가 있는 단어를 찾으세요.\n\n${data.sentence || ""}`;
      correctAnswer = data.errorWord || q.correctAnswer || "";
      break;
    case "ERROR_CORRECT":
      questionText = `다음 문장의 밑줄 친 부분을 올바르게 고치세요.\n\n${data.sentence || ""}\n\n오류 부분: ${data.errorPart || ""}`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "GRAM_TRANSFORM":
      questionText = `다음 문장을 지시에 따라 전환하세요.\n\n${data.originalSentence || ""}\n\n[${data.instruction || data.grammarPoint || ""}]`;
      correctAnswer = data.correctAnswer || q.correctAnswer || "";
      break;
    case "GRAM_BINARY":
      questionText = `다음 문장의 문법이 맞으면 O, 틀리면 X를 선택하세요.\n\n${data.sentence || ""}`;
      options = [{ label: "O", text: "맞다" }, { label: "X", text: "틀리다" }];
      correctAnswer = data.isCorrect === true ? "O" : "X";
      break;

    // ── COMPREHENSION ────────────────────────
    case "TRUE_FALSE":
      questionText = `다음 진술이 지문 내용과 일치하면 O, 불일치하면 X를 선택하세요.\n\n${data.statement || ""}`;
      options = [{ label: "O", text: "일치" }, { label: "X", text: "불일치" }];
      correctAnswer = data.isTrue === true ? "O" : "X";
      passageSnippet = data.contextExcerpt;
      break;
    case "CONTENT_QUESTION":
      questionText = data.question || data.contextExcerpt || "다음 지문의 내용과 관련된 질문입니다.";
      options = normalizeOptions(data.options);
      passageSnippet = data.question ? data.contextExcerpt : undefined;
      break;
    case "PASSAGE_FILL":
      questionText = `빈칸에 들어갈 표현으로 가장 알맞은 것은?\n\n${data.excerpt || ""}`;
      options = normalizeOptions(data.options);
      break;
    case "CONNECTOR_FILL":
      questionText = `두 문장 사이에 들어갈 연결어로 가장 알맞은 것은?\n\n${data.sentenceBefore || ""}\n\n___________\n\n${data.sentenceAfter || ""}`;
      options = normalizeOptions(data.options);
      break;

    default:
      questionText = q.questionText;
      break;
  }

  if (!correctAnswer) correctAnswer = q.correctAnswer || "";

  // 특수 인터랙션용 rawData
  const specialSubTypes = ["WORD_MATCH", "WORD_ARRANGE", "SENT_CHUNK_ORDER", "ERROR_FIND"];
  const rawData = specialSubTypes.includes(subType) ? data : undefined;

  return {
    id: q.id,
    type: q.type,
    subType,
    learningCategory: (q.learningCategory || fallbackCategory) as LearningCategory,
    questionText,
    options,
    correctAnswer,
    includesPassage: !!passageSnippet,
    passageSnippet,
    rawData,
    explanation: q.explanation
      ? {
          content: q.explanation.content,
          keyPoints: q.explanation.keyPoints ? JSON.parse(q.explanation.keyPoints) : undefined,
        }
      : undefined,
  };
}
