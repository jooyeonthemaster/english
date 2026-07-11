"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 문항 본문 뷰(TabletQuestionView, 표시 전용)
//
// StudentSafeQuestion(W1 화이트리스트 페이로드)만으로 시험지 충실 렌더.
// 배치 규칙(paper-builder question-body-layout 의 stem/body 분리 미러):
//  - 발문(stem) = questionText 첫 단락. safeData.direction 이 별도 존재하고
//    stem 과 다르면 direction 을 먼저 보여준다(중복이면 생략).
//  - safeData 에 구조화 본문(지문/요약/단락)이 있으면 questionText 잔여(body)는
//    같은 내용의 직렬화본이므로 생략(이중 렌더 방지). 없으면 body 를 그대로 렌더.
//  - passageContent(원문 지문 관계)는 "원문 참조" 유형에서만 박스로 —
//    빈칸추론처럼 마스킹본이 본선인 유형에서 원문을 노출하지 않는다.
// 정오·정답 데이터는 이 컴포넌트 props 에 구조적으로 존재하지 않는다(§6-1).
// ============================================================================

import { createContext, memo, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  StudentSafeData,
  StudentSafeQuestion,
} from "@/lib/exam-scoring/student-safe";
import { EXAM_FONT } from "./exam-markup";
import { renderExamInline } from "./exam-inline";

// 렌더 변형 — "card"(한 문제씩, 앱 카드) | "paper"(시험지 보기, 얇은 지문 박스·
// 양끝맞춤). 모드A/모드B가 동일 본문 컴포넌트를 공유하되 컨테이너 룩만 달리한다
// (본문·마커 렌더는 완전 동일 → 두 모드 콘텐츠 픽셀 일치 보장, 설계 §결정2).
export type QuestionViewVariant = "card" | "paper";
const VariantContext = createContext<QuestionViewVariant>("card");

// 원문 지문(passage 관계)이 시험지 표면인 유형 — question-body-layout 의
// INLINE_SOURCE + 요약/주제문 계열. 그 외 유형의 passageContent 는 렌더하지 않는다.
const PASSAGE_CONTENT_SUBTYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "WORD_ORDER",
  "SYNONYM",
  "SUMMARY_COMPLETE",
  "SUMMARY_COMPLETE_MC",
  "SUMMARY_WRITING",
  "TOPIC_SENTENCE_WRITING",
]);

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitStemAndBody(questionText: string): { stem: string; body: string } {
  const normalized = (questionText || "").replace(/\r/g, "").trim();
  if (!normalized) return { stem: "", body: "" };
  const blocks = normalized.split(/\n{2,}/);
  return {
    stem: (blocks[0] || "").trim(),
    body: blocks.slice(1).join("\n\n").trim(),
  };
}

// ── 표시 조각 ────────────────────────────────────────────────────────────────

/** 지문/요약 등 시험지 박스 — EXAM_FONT. paper 변형은 얇은 테두리·양끝맞춤. */
function ExamBox({
  label,
  children,
  tone = "outline",
}: {
  label?: string;
  children: ReactNode;
  tone?: "outline" | "muted";
}) {
  const isPaper = useContext(VariantContext) === "paper";
  return (
    <div
      className={cn(
        isPaper ? "rounded-sm border px-2.5 py-1.5" : "rounded-lg border p-4",
        tone === "muted"
          ? "border-[#E5E8EB] bg-[#F7F8FA]"
          : isPaper
            ? "border-[#B0B8C1] bg-white"
            : "border-[#D5DAE0] bg-white",
      )}
    >
      {label && (
        <p
          className={cn(
            "font-semibold text-[#4E5968]",
            isPaper ? "mb-0.5 text-[9px]" : "mb-2 text-xs",
          )}
        >
          {label}
        </p>
      )}
      <div
        className={cn(
          "whitespace-pre-wrap text-[#191F28]",
          isPaper
            ? "text-justify text-[9.5px] leading-[1.45]"
            : "text-[15px] leading-[1.9]",
        )}
        style={{ fontFamily: EXAM_FONT }}
      >
        {children}
      </div>
    </div>
  );
}

/** [보기]/[배열 단어] 칩 나열 — 표시 전용(미끼 식별 신호 없음) */
function ChipRow({ label, chips }: { label: string; chips: string[] }) {
  const isPaper = useContext(VariantContext) === "paper";
  return (
    <div
      className={cn(
        "border border-[#E5E8EB] bg-[#F7F8FA]",
        isPaper ? "rounded-sm p-1.5" : "rounded-lg p-3",
      )}
    >
      <p
        className={cn(
          "font-semibold text-[#4E5968]",
          isPaper ? "mb-1 text-[9px]" : "mb-2 text-xs",
        )}
      >
        {label}
      </p>
      <ul className={cn("flex flex-wrap", isPaper ? "gap-1" : "gap-1.5")}>
        {chips.map((chip, index) => (
          <li
            key={`${chip}-${index}`}
            className={cn(
              "border border-[#E5E8EB] bg-white text-[#191F28]",
              isPaper
                ? "rounded px-1.5 py-0.5 text-[9px]"
                : "rounded-md px-2.5 py-1 text-sm",
            )}
            style={{ fontFamily: EXAM_FONT }}
          >
            {chip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── safeData → 구조화 본문 블록들 ────────────────────────────────────────────

function renderSafeDataBlocks(
  subType: string,
  data: StudentSafeData,
  passageContent: string | undefined,
  bodySuppressed: boolean,
  isPaper: boolean,
): ReactNode[] {
  // 시험지 보기: 실제 시험지 밀도(~10.5px)로 압축 — 태블릿 2열 셀에 지문+선지가
  // 한눈에 들어오게. 카드(한 문제씩)는 기존 15px 유지.
  const bodyClass = isPaper
    ? "text-[9.5px] leading-[1.45]"
    : "text-[15px] leading-[1.9]";
  const blocks: ReactNode[] = [];
  const safePassage =
    data.passageWithBlank ??
    data.passageWithMarkers ??
    data.passageWithNumbers ??
    data.passageWithUnderline;

  // 주어진 문장(문장삽입/순서) — 지문보다 위(시험지 배치 미러)
  if (data.givenSentence) {
    blocks.push(
      <ExamBox key="given" label="주어진 문장">
        {renderExamInline(data.givenSentence, subType)}
      </ExamBox>,
    );
  }

  if (safePassage) {
    blocks.push(
      <ExamBox key="passage">{renderExamInline(safePassage, subType)}</ExamBox>,
    );
  } else if (passageContent && PASSAGE_CONTENT_SUBTYPES.has(subType)) {
    blocks.push(
      <ExamBox key="source-passage">
        {renderExamInline(passageContent, subType)}
      </ExamBox>,
    );
  }

  // 순서배열 (A)(B)(C) 단락
  if (data.paragraphs && data.paragraphs.length > 0) {
    blocks.push(
      <div key="paragraphs" className={isPaper ? "space-y-1" : "space-y-2"}>
        {data.paragraphs.map((paragraph) => (
          <div
            key={paragraph.label}
            className={cn(
              "border border-[#D5DAE0] bg-white",
              isPaper ? "rounded-sm px-2.5 py-1.5" : "rounded-lg p-4",
            )}
          >
            <p
              className={cn("whitespace-pre-wrap text-[#191F28]", bodyClass)}
              style={{ fontFamily: EXAM_FONT }}
            >
              <span className="mr-1.5 font-semibold">{paragraph.label}</span>
              {renderExamInline(paragraph.text, subType)}
            </p>
          </div>
        ))}
      </div>,
    );
  }

  // 지문 박스에 밑줄이 없을 때만 밑줄 대상 표현을 별도 표기(중복 방지)
  const underlinedTarget =
    data.underlinedExpression ??
    data.underlinedWord ??
    data.underlinedPronoun ??
    data.targetWord;
  if (!safePassage && underlinedTarget) {
    blocks.push(
      <p
        key="underlined-target"
        className={cn("text-[#191F28]", bodyClass)}
        style={{ fontFamily: EXAM_FONT }}
      >
        밑줄 친 표현:{" "}
        <u className="underline decoration-[1.5px] underline-offset-4">
          {underlinedTarget}
        </u>
      </p>,
    );
  }

  if (data.koreanGloss) {
    blocks.push(
      <ExamBox key="gloss" label="[해석]" tone="muted">
        {data.koreanGloss}
      </ExamBox>,
    );
  }

  if (data.summaryWithBlanks) {
    blocks.push(
      <ExamBox
        key="summary"
        label={subType === "TOPIC_SENTENCE_WRITING" ? "[주제문]" : "[요약문]"}
      >
        {renderExamInline(data.summaryWithBlanks, subType)}
      </ExamBox>,
    );
  }

  if (data.wordBank && data.wordBank.length > 0) {
    blocks.push(<ChipRow key="word-bank" label="[보기]" chips={data.wordBank} />);
  }
  if (data.scrambledWords && data.scrambledWords.length > 0) {
    blocks.push(
      <ChipRow key="scrambled" label="[배열 단어]" chips={data.scrambledWords} />,
    );
  }

  if (data.referenceSentence) {
    blocks.push(
      <ExamBox key="reference" label="[참고 문장]">
        {renderExamInline(data.referenceSentence, subType)}
      </ExamBox>,
    );
  }
  if (data.originalSentence) {
    blocks.push(
      <ExamBox key="original" label="[원문]">
        {renderExamInline(data.originalSentence, subType)}
      </ExamBox>,
    );
  }

  if (data.conditions && data.conditions.length > 0) {
    blocks.push(
      <div
        key="conditions"
        className={cn(
          "border border-[#E5E8EB] bg-[#F7F8FA]",
          isPaper ? "rounded-sm p-1.5" : "rounded-lg p-3",
        )}
      >
        <p
          className={cn(
            "font-semibold text-[#4E5968]",
            isPaper ? "mb-0.5 text-[9px]" : "mb-2 text-xs",
          )}
        >
          &lt;조건&gt;
        </p>
        <ul className={isPaper ? "space-y-0.5" : "space-y-1"}>
          {data.conditions.map((condition, index) => (
            <li
              key={index}
              className={cn(
                "leading-relaxed text-[#191F28]",
                isPaper ? "text-[9.5px]" : "text-sm",
              )}
              style={{ fontFamily: EXAM_FONT }}
            >
              · {condition}
            </li>
          ))}
        </ul>
      </div>,
    );
  }

  if (data.contextHint) {
    blocks.push(
      <p
        key="context-hint"
        className={cn(
          "leading-relaxed text-[#4E5968]",
          isPaper ? "text-[9.5px]" : "text-sm",
        )}
      >
        {data.contextHint}
      </p>,
    );
  }

  // 어법고침 밑줄 구간 — questionText 본문(마킹 지문)이 렌더되면 중복이라 생략
  if (bodySuppressed && data.underlinedSegments && data.underlinedSegments.length > 0) {
    blocks.push(
      <div key="segments" className={isPaper ? "space-y-0.5" : "space-y-2"}>
        {data.underlinedSegments.map((segment) => (
          <p
            key={segment.label}
            className={cn("text-[#191F28]", bodyClass)}
            style={{ fontFamily: EXAM_FONT }}
          >
            <span className="mr-1.5 font-semibold">{segment.label}</span>
            <u className="underline decoration-[1.5px] underline-offset-4">
              {segment.displayedText}
            </u>
          </p>
        ))}
      </div>,
    );
  }

  return blocks;
}

// ── 공개 컴포넌트 ────────────────────────────────────────────────────────────

export const TabletQuestionView = memo(function TabletQuestionView({
  safe,
  variant = "card",
}: {
  safe: StudentSafeQuestion;
  variant?: QuestionViewVariant;
}) {
  const isPaper = variant === "paper";
  const data = safe.safeData ?? {};
  const { stem, body } = splitStemAndBody(safe.questionText);

  // 구조화 본문이 있으면 questionText 잔여(body)는 같은 내용의 직렬화본 — 생략.
  const hasStructuredBody = Boolean(
    data.passageWithBlank ||
      data.passageWithMarkers ||
      data.passageWithNumbers ||
      data.passageWithUnderline ||
      data.summaryWithBlanks ||
      (data.paragraphs && data.paragraphs.length > 0),
  );
  const showBody = Boolean(body) && !hasStructuredBody;

  // direction 이 발문(stem)과 사실상 동일하면 중복 렌더하지 않는다.
  const direction =
    safe.direction &&
    normalizeForCompare(safe.direction) !== normalizeForCompare(stem)
      ? safe.direction
      : "";

  return (
    <VariantContext.Provider value={variant}>
      <div className={isPaper ? "space-y-1.5" : "space-y-4"}>
        {direction && (
          <p
            className={cn(
              "font-medium leading-relaxed text-[#191F28]",
              isPaper ? "text-[9.5px]" : "text-[15px]",
            )}
            style={{ fontFamily: EXAM_FONT }}
          >
            {direction}
          </p>
        )}
        {stem && (
          <p
            className={cn(
              "whitespace-pre-wrap font-medium leading-relaxed text-[#191F28]",
              isPaper ? "text-[10px]" : "text-[15px]",
            )}
            style={{ fontFamily: EXAM_FONT }}
          >
            {renderExamInline(stem, safe.subType)}
          </p>
        )}

        {showBody && (
          <p
            className={cn(
              "whitespace-pre-wrap text-[#191F28]",
              isPaper
                ? "text-justify text-[9.5px] leading-[1.45]"
                : "text-[15px] leading-[1.9]",
            )}
            style={{ fontFamily: EXAM_FONT }}
          >
            {renderExamInline(body, safe.subType)}
          </p>
        )}

        {renderSafeDataBlocks(
          safe.subType,
          data,
          safe.passageContent,
          !showBody,
          isPaper,
        )}

        {safe.questionImage && (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 저장 이미지(치수 미상) 원본 렌더
          <img
            src={safe.questionImage}
            alt="문항 이미지"
            className="max-w-full rounded-lg border border-[#E5E8EB]"
          />
        )}
      </div>
    </VariantContext.Provider>
  );
});
