"use client";

// ============================================================================
// 학생 시험 리포트 — 문항 상세보기(AI 0콜)
//
// 정오표 행의 '상세보기' → 서비스가 생성한 원본 문항을 시험지 생성 페이지와 동일한
// 렌더러(QuestionCard)로 그대로 띄운다. 좌: 문항(지문 포함) / 우: 채점·해설·출제분석
// 레일. 원본(review)이 없는 사진 업로드 리포트는 분석·발문만으로 우아하게 강등한다.
//
// 데이터는 전부 이미 저장/재조회된 값이다(LLM 호출 없음):
//  - 문항 전문/선지/지문/해설 = review(ExamReviewQuestion, INTERNAL 재조회)
//  - 출제 분석(의도/개념/함정) = analysis(QuestionAnalysis, examAnalysis 저장분)
//  - 학생 선택답/정답/판정 = response(StudentResponse) + examMap 정답
// 강사/원장 전용 화면이므로 정답·해설을 즉시 노출한다(학생 공개면 미사용).
//
// 2607 §9.2 증보:
//  - 「오답 선지 해설」 렌더. 서버(review-questions.ts)가 explanation.
//    wrongOptionExplanations 를 이미 내려주는데 화면이 통째로 버리고 있었다.
//  - 「이 문항 변형 만들기」(§8.3) — 오답에서 곧바로 같은 지문·같은 유형의 새
//    문항 생성으로 잇는다. studentId/studentName/examTitle 은 **옵셔널** props —
//    현행 호출처(analysis-step·verdict-board) 무변경으로도 컴파일·동작한다.
//
// 2607 검수 반영:
//  - 레일/좌측 컬럼이 실제로 스크롤되게 grid 행 트랙을 minmax(0,1fr) 로 고정.
//    (auto 트랙이 콘텐츠 높이로 자라 overflow-hidden 에 잘려 도달 불가였다)
//  - sticky 변형 CTA 바를 불투명 배경으로, 음수 하단 마진 제거.
//  - 유형 라벨을 QUESTION_TYPE_UI 카탈로그로 정규화(「어법판단」/「어법 판단」 혼재 해소).
//  - 오답 선지 해설 파싱 실패를 조용한 빈 상태로 두지 않고 사유를 노출.
//  - studentId 부재 시 배포 안내문을 사실에 맞게 교체.
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Info,
  Loader2,
  Lightbulb,
  RefreshCw,
  Route,
  Target,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  QuestionCard,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import type {
  ExamMapEntry,
  QuestionAnalysis,
  StudentResponse,
} from "@/lib/exam-report/types";
import type { ExamReviewQuestion } from "@/components/exam-report/ui-contracts";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import {
  buildVariantGenerateHref,
  filterVariantQuestions,
  parseChoiceOptions,
  resolveChoiceDisplay,
  saveVariantSeed,
  type VariantSeedQuestion,
} from "@/lib/question-variant";
import {
  SITTING_DETAIL_COPY,
  VARIANT_COPY,
  VARIANT_DISABLED_REASONS,
} from "@/lib/wording/director-glossary";
import { KIND_LABEL, STATUS_STYLE, choiceToCircled } from "./grading-shared";

interface QuestionDetailViewProps {
  entry: ExamMapEntry;
  response: StudentResponse;
  analysis: QuestionAnalysis | null;
  review: ExamReviewQuestion | null;
  reviewLoading: boolean;
  /** 페이로드 판별자 — INTERNAL(원본 재사용 가능) / OTHER(사진 업로드 등 강등) / null(프리페치 실패). */
  reviewSource: "INTERNAL" | "OTHER" | null;
  /** 프리페치가 실패(404/500/네트워크)했는가 — 정상 강등(OTHER)과 구분해 재시도 안내. */
  reviewError: boolean;
  /** 원본 재조회 재시도(프리페치 실패 복구). */
  onRetry?: () => void;
  position: { index: number; total: number };
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  // ── 변형 생성 컨텍스트(§8.3) — 전부 옵셔널(계약 유지) ────────────────────
  // analysis-step 이 넘기기 시작했지만 verdict-board 등 기존 호출처는 아직 안 넘긴다
  // — 옵셔널을 깨지 않는다. 없어도 CTA 는 동작하되, studentId 가 없으면 딥링크에
  // `?student=` 가 안 실리므로 하단 안내문이 「직접 고르세요」로 바뀐다(거짓 안내 방지).
  /** 로스터 귀속 학생 id — 생성 후 「과제 보내기」 프리셀렉트 축 */
  studentId?: string | null;
  studentName?: string | null;
  examTitle?: string | null;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

/** 원본 재조회 진행 중 표기 — 좌측 로딩 블록과 변형 CTA 가 같은 문장을 쓴다. */
const REVIEW_LOADING_TEXT = "원본 문항을 불러오는 중…";

/**
 * 생성 후 배포 안내 — 학생 귀속(studentId)이 있을 때만 「바로」가 참이다.
 * 로스터 귀속이 없는(구 데이터 / 호출처가 안 넘긴) 경우 프리셀렉트가 안 되므로
 * 화면이 거짓말하지 않도록 문장을 갈아 끼운다(검수 [16]).
 * TODO(감독): director-glossary.VARIANT_COPY 에 상수화 요청함.
 */
const VARIANT_HINT_NO_STUDENT = "생성 후 배포할 학생을 직접 고르세요";

/** 오답 선지 해설이 있는데 형식을 못 읽었을 때의 고지 — 조용한 빈 상태 금지. */
const WRONG_OPTIONS_PARSE_FAILED =
  "오답 선지 해설을 표시할 수 없는 형식입니다. 원본 문항에서 확인해 주세요.";

/** Rich HTML → 평문(태그 제거·엔티티 복원·줄바꿈 보존). */
function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** JSON 문자열 배열/배열 → 트림된 string[]. */
function parseStringArray(value: unknown): string[] {
  let arr: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
}

export interface WrongOptionNote {
  label: string;
  text: string;
}

/** 오답 선지 해설 파싱 결과 — 「없음」과 「있는데 못 읽음」을 화면이 구분해야 해서 분리한다. */
interface WrongOptionParseResult {
  rows: WrongOptionNote[];
  /** 원본에 값은 있었는데 한 건도 눕히지 못했다(형식 미지원·JSON 깨짐). */
  parseFailed: boolean;
}

/**
 * 오답 선지 해설 파싱. 저장 형태가 생성 파이프라인 세대별로 세 갈래라
 * (`{"1":"…"}` · `[{label,explanation}]` · `["…","…"]`) 화면이 형태에 의존하지
 * 않도록 여기서 한 배열로 눕힌다.
 *
 * 왜 실패를 따로 들고 나가나: 전에는 못 읽으면 빈 배열만 돌려줘 섹션이 통째로
 * 사라졌다 — 강사는 「이 문항엔 오답 해설이 없다」로 읽지만 사실은 서버가 보낸
 * 데이터를 화면이 버린 것이다. 거짓 빈 상태를 만들지 않도록 사유를 노출한다.
 */
function parseWrongOptions(value: unknown): WrongOptionParseResult {
  // 값 자체가 없으면 실패가 아니라 정상 부재다(섹션 미렌더).
  const hadValue =
    typeof value === "string" ? value.trim().length > 0 : value != null;
  if (!hadValue) return { rows: [], parseFailed: false };

  let parsed: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // JSON 이 아니면 통짜 문장일 수 있다 — 버리지 말고 라벨 없는 한 덩어리로 살린다.
      return { rows: [{ label: "", text: trimmed }], parseFailed: false };
    }
  }
  // 스칼라(문자열·숫자)나 null 로 파싱된 경우: 내용이 있으면 한 덩어리로 살리고,
  // 비었으면 「없음」으로 본다 — 여기서 parseFailed 를 켜면 `"null"`·`""` 같은
  // 저장값에 대해 거짓 경고를 띄우게 된다.
  if (parsed == null || typeof parsed !== "object") {
    const text = String(parsed ?? "").trim();
    return { rows: text ? [{ label: "", text }] : [], parseFailed: false };
  }

  const rows: WrongOptionNote[] = [];
  if (Array.isArray(parsed)) {
    parsed.forEach((row, i) => {
      // 문자열 배열형은 라벨이 없다 — 배열 순서를 선지 번호로 본다(생성 규약).
      if (typeof row === "string") {
        const text = row.trim();
        if (text) rows.push({ label: String(i + 1), text });
        return;
      }
      if (row == null || typeof row !== "object") return;
      const r = row as Record<string, unknown>;
      const label = String(r.label ?? r.option ?? r.choice ?? "").trim();
      const text = String(r.explanation ?? r.text ?? r.reason ?? "").trim();
      if (text) rows.push({ label: label || String(i + 1), text });
    });
    // 빈 배열은 「해설 없음」이지 파싱 실패가 아니다.
    return { rows, parseFailed: parsed.length > 0 && rows.length === 0 };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  for (const [label, raw] of entries) {
    const text = String(raw ?? "").trim();
    if (text) rows.push({ label: label.trim(), text });
  }
  return { rows, parseFailed: entries.length > 0 && rows.length === 0 };
}

/**
 * 선지 라벨 비교 키 — 같은 선지가 "1" · "①" · "(A)" 로 제각각 저장돼 있어
 * 학생이 고른 선지를 문자열 그대로 맞추면 거의 매번 빗나간다.
 */
function optionMatchKey(label: string | null | undefined): string {
  if (!label) return "";
  const trimmed = label.trim();
  const circledIndex = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".indexOf(trimmed);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return trimmed.replace(/[^0-9A-Za-z가-힣]/g, "").toUpperCase();
}

/** ExamReviewQuestion → QuestionCard 입력(해설은 우측 레일에서 별도 노출 → 카드에선 제거). */
function toCardItem(review: ExamReviewQuestion): QuestionCardItem {
  return {
    id: review.questionId,
    type: review.type,
    subType: review.subType,
    questionText: review.questionText,
    options: review.options,
    correctAnswer: review.correctAnswer,
    difficulty: review.difficulty,
    tags: review.tags,
    aiGenerated: review.aiGenerated,
    approved: review.approved,
    createdAt: review.createdAt as unknown as Date,
    structuredData: review.structuredData,
    passage: review.passage,
    // 해설은 우측 '해설' 카드가 원본으로 노출하므로 카드 내부 토글은 숨긴다.
    explanation: null,
    setId: review.setId,
    setLabel: review.setLabel,
  };
}

export function QuestionDetailView({
  entry,
  response,
  analysis,
  review,
  reviewLoading,
  reviewSource,
  reviewError,
  onRetry,
  position,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  studentId,
  studentName,
  examTitle,
}: QuestionDetailViewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 변형 CTA 보조문구를 aria-describedby 로 묶기 위한 고유 id(인스턴스 충돌 방지).
  const variantHintId = useId();

  // 오픈 시 패널로 초기 포커스, 언마운트 시 직전 포커스 요소로 복귀(WCAG 2.4.3).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // ESC 닫기 + ←/→ 문항 이동(입력 필드 제외) + Tab 포커스 트랩(배경 이탈 방지).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (activeEl === first || activeEl === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (!typing && e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (!typing && e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const status = STATUS_STYLE[response.status];
  const studentChoice = response.chosenChoice ?? response.aiRead?.chosenChoice ?? null;
  const studentAnswerText = response.studentAnswer ?? response.aiRead?.writtenAnswer ?? null;
  const correctText =
    entry.correctAnswer == null || entry.correctAnswer === ""
      ? "—"
      : entry.kind === "MC"
        ? choiceToCircled(entry.correctAnswer)
        : entry.correctAnswer;
  const difficultyLabel =
    (review?.difficulty && DIFFICULTY_LABEL[review.difficulty.toUpperCase()]) ??
    null;
  /**
   * 유형 라벨은 카탈로그(QUESTION_TYPE_UI)를 정본으로 삼는다 — examMap 의
   * entry.typeLabel 은 자유 문자열이라 「어법판단」처럼 붙여 쓴 표기가 섞여 들어오고,
   * 바로 아래 QuestionCard 는 카탈로그 라벨 「어법 판단」을 써서 한 화면에 두 표기가
   * 8px 간격으로 나란히 놓였다(검수 [37]·[126]). subType 이 없을 때만 원문 폴백.
   */
  const typeLabel =
    (review?.subType ? QUESTION_TYPE_UI[review.subType]?.label : null) ??
    (entry.typeLabel || "문항");

  const explanationText = stripHtml(review?.explanation?.content) || analysis?.explanation || "";
  // 배열 두 개는 아래 변형 시드 useMemo 의 의존성이라 신원을 고정해 둔다.
  const keyPoints = useMemo(
    () => parseStringArray(review?.explanation?.keyPoints),
    [review?.explanation?.keyPoints],
  );
  const wrongOptionResult = useMemo(
    () => parseWrongOptions(review?.explanation?.wrongOptionExplanations),
    [review?.explanation?.wrongOptionExplanations],
  );
  const wrongOptions = wrongOptionResult.rows;
  /** 학생이 실제로 고른 선지 — 오답 해설 목록에서 그 항목만 rose 로 짚는다 */
  const studentOptionKey = optionMatchKey(studentChoice);
  const keyConcepts = analysis?.keyConcepts ?? [];
  const traps = analysis?.trapDesign ?? [];
  const hasAnalysis =
    analysis != null &&
    analysis.analysisStatus === "OK" &&
    (analysis.intent ||
      analysis.examPoint ||
      analysis.solvingStrategy ||
      analysis.difficultyRationale ||
      traps.length > 0);

  const card = review ? toCardItem(review) : null;

  // ── 변형 문제 생성 시드(§8.3) ─────────────────────────────────────────────
  // 원본(review)이 없는 사진 업로드 리포트는 passageId·subType 이 비어 자격 판정에서
  // 걸러진다 — 버튼이 사라지는 대신 사유가 적힌 비활성 버튼으로 남는다.
  const variantSeedQuestion = useMemo<VariantSeedQuestion>(() => {
    // 정답 표기는 원본이 있으면 원본을, 없으면 채점 지도(entry)를 쓴다.
    const rawCorrect = review?.correctAnswer?.trim() || entry.correctAnswer || "";
    // 선지 축 통일 — 리포트 채점축("3")·문항 원본축("(C)")·화면 렌더축(③)이 서로
    // 달라 그대로 실으면 시드를 받는 쪽(스트립·원본 모달·생성 프롬프트)이 화면과
    // 매칭되지 않는 토큰을 읽게 된다. 원본 선지 목록으로 위치를 확정한다.
    const choices = parseChoiceOptions(review?.options);
    const correctForSeed = rawCorrect
      ? (resolveChoiceDisplay(rawCorrect, choices) ??
        (entry.kind === "MC" ? choiceToCircled(rawCorrect) : rawCorrect))
      : null;
    return {
      questionId: review?.questionId ?? `entry-${entry.number}`,
      orderLabel: `${entry.number}번`,
      // 카탈로그 밖 유형(null 포함)은 빈 문자열 → filterVariantQuestions 가 UNSUPPORTED_TYPE 판정
      subType: review?.subType ?? "",
      typeLabel,
      difficulty: review?.difficulty ?? null,
      // 세트 문항은 passageId 가 null 이고 공유지문이 passage 에 실려 온다(review-questions.ts)
      passageId: review?.passageId ?? review?.passage?.id ?? "",
      passageTitle: review?.passage?.title ?? null,
      questionText: review?.questionText ?? entry.brief,
      correctText: correctForSeed,
      studentText: studentChoice
        ? (resolveChoiceDisplay(studentChoice, choices) ?? choiceToCircled(studentChoice))
        : (studentAnswerText ?? null),
      keyPoints,
    };
  }, [review, entry, studentChoice, studentAnswerText, keyPoints, typeLabel]);

  const variantGate = useMemo(
    () => filterVariantQuestions([variantSeedQuestion]),
    [variantSeedQuestion],
  );

  /**
   * 리치 시드는 sessionStorage, 지문·유형·난이도는 URL — 이중화라 시드가 유실돼도
   * 생성 페이지의 프리필은 살아남는다(§8.2). `from` 은 돌아오기 링크.
   */
  const openVariant = useCallback(() => {
    if (variantGate.reason || variantGate.usable.length === 0) {
      toast.error(VARIANT_DISABLED_REASONS[variantGate.reason ?? "NO_QUESTIONS"]);
      return;
    }
    const seedId = saveVariantSeed({
      origin: "exam-report",
      studentId,
      studentName,
      examTitle,
      createdAt: new Date().toISOString(),
      questions: variantGate.usable,
    });
    // useSearchParams 는 Suspense 경계를 요구해 이 모달을 쓰는 페이지 전체에
    // 영향이 간다 — 클릭 시점의 window 에서 직접 읽는다(클라이언트 전용 경로).
    const from =
      typeof window === "undefined"
        ? undefined
        : window.location.pathname + window.location.search;
    router.push(
      buildVariantGenerateHref({
        seedId,
        questions: variantGate.usable,
        studentId,
        from,
      }),
    );
  }, [variantGate, studentId, studentName, examTitle, router]);

  /**
   * CTA 비활성 사유 한 문장. 프리페치가 아직 안 끝났으면 review 가 null 이라
   * 자격 판정이 「원본 지문 없음」으로 나오는데, 그건 사실이 아니라 타이밍이다 —
   * 로딩을 먼저 말한다(거짓 사유 노출 금지).
   */
  const variantBlockedText = reviewLoading
    ? REVIEW_LOADING_TEXT
    : variantGate.reason
      ? VARIANT_DISABLED_REASONS[variantGate.reason]
      : null;

  /**
   * 활성 상태의 보조 문구. studentId 가 없으면 딥링크에 `?student=` 가 실리지 않아
   * 「바로 과제로 보낼 수 있습니다」가 사실이 아니게 된다 — 배포 단계에서 학생을 다시
   * 골라야 하는 현실을 그대로 말한다(검수 [16]). props 는 계속 옵셔널이므로 기존
   * 호출처(analysis-step·verdict-board) 시그니처는 깨지지 않는다.
   */
  const variantHintText = studentId
    ? VARIANT_COPY.AFTER_GENERATE_HINT
    : VARIANT_HINT_NO_STUDENT;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5">
      {/* 배경 클릭 닫기 — 정적 div 에 onClick 을 달면 jsx-a11y 위반이라 실제 button
          으로 둔다. 다만 보조기술에는 노출하지 않는다(aria-hidden): 헤더의 「닫기」와
          ESC 로 같은 동작이 이미 제공되는데 스크린리더 사용자에게 라벨 없는 전면
          버튼이 하나 더 읽히면 「닫기」가 두 개인 것처럼 들린다. tabIndex -1 이라
          탭 순서·포커스 트랩에도 끼지 않는다. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/50 backdrop-blur-sm"
      />
      {/* role="dialog" 는 백드롭이 아니라 패널에 건다 — 배경 버튼이 다이얼로그
          내부 요소로 읽히던 문제(a11y 트리 오염)를 없앤다. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.number}번 문항 상세`}
        tabIndex={-1}
        className="relative z-10 flex h-full max-h-[92vh] w-full max-w-[min(96vw,1600px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none"
      >
        {/* ── 헤더: 번호·유형·메타 · 판정 · 네비·닫기 ── */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-slate-100 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-2 text-[15px] font-extrabold tabular-nums text-white">
              {entry.number}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="truncate text-[15px] font-bold leading-tight text-slate-900">
                {typeLabel}
              </h2>
              {/* 카드가 렌더되면 유형·객관식·난이도 칩을 QuestionCard 첫 줄이 이미
                  보여준다 — 헤더에서 중복 칩을 빼고 배점·세트만 남긴다(검수 [126]).
                  원본이 없어 카드가 안 뜨는 강등 상태에서는 여기가 유일한 메타라
                  전부 노출한다. */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                {!card && <MetaChip>{KIND_LABEL[entry.kind]}</MetaChip>}
                {entry.points != null && (
                  <MetaChip>
                    <span className="tabular-nums">{entry.points}</span>점
                  </MetaChip>
                )}
                {!card && difficultyLabel && <MetaChip>{difficultyLabel}</MetaChip>}
                {review?.setLabel && <MetaChip>{review.setLabel}</MetaChip>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold",
                status.bg,
                status.text,
              )}
            >
              <span className="text-[13px] leading-none">{status.symbol}</span>
              {status.label}
            </span>

            <div className="flex items-center gap-0.5">
              <NavButton
                label="이전 문항"
                disabled={!hasPrev}
                onClick={onPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </NavButton>
              <span className="w-14 text-center text-[12px] font-semibold tabular-nums text-slate-400">
                {position.index + 1} / {position.total}
              </span>
              <NavButton label="다음 문항" disabled={!hasNext} onClick={onNext}>
                <ChevronRight className="h-4 w-4" />
              </NavButton>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ── 본문: 좌 문항 / 우 채점·해설·분석 레일 ── */}
        {/* lg 에서 행 트랙을 `minmax(0,1fr)` 로 못 박는다 — 기본 `auto` 트랙은 콘텐츠
            높이만큼 자라서 컨테이너(overflow-hidden) 밖으로 넘치고, 그 결과 두 컬럼의
            `overflow-y-auto` 가 아예 발동하지 않아 레일 끝(오답 선지 해설·좌측 정답
            줄)이 모달 경계에서 잘린 채 도달 불가였다(검수 [35]·[60]·[62] 공통 원인). */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_366px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          {/* 좌: 실제 문항(시험지 생성 페이지와 동일 렌더러) */}
          <div className="min-h-0 min-w-0 overflow-y-auto px-5 pb-8 pt-5 lg:border-r lg:border-slate-100">
            {reviewLoading ? (
              <LoadingBlock />
            ) : card ? (
              <div className="mx-auto max-w-3xl">
                <QuestionCard
                  q={card}
                  num={position.index + 1}
                  readonly
                  hideReviewStatusStamp
                  suppressUnapprovedBorder
                  answerReveal="show-all"
                  passageDefaultOpen
                />
              </div>
            ) : (
              <DegradedBlock
                brief={entry.brief}
                reviewSource={reviewSource}
                reviewError={reviewError}
                onRetry={onRetry}
              />
            )}
          </div>

          {/* 우: 채점 + 해설 + 출제 분석 */}
          {/* lg 에서 하단 패딩을 0 으로 둔다 — sticky CTA 바가 스크롤포트 바닥(bottom:0)에
              붙는데 컨테이너에 pb-4 가 있으면 그 16px 만큼 콘텐츠가 바 아래로 새어
              반쯤 잘린 글줄이 상시 노출됐다(검수 [62]). */}
          <aside className="flex min-h-0 min-w-0 flex-col gap-3 bg-slate-50/50 px-4 pb-4 pt-4 lg:overflow-y-auto lg:pb-0">
            {/* 채점 카드 */}
            <RailCard title="채점" icon={<Target className="h-3.5 w-3.5" />}>
              <dl className="flex flex-col gap-2 text-[13px]">
                <ScoreRow label="학생 답">
                  {studentChoice ? (
                    <span className="font-bold text-slate-900">
                      {choiceToCircled(studentChoice)}
                    </span>
                  ) : studentAnswerText ? (
                    <span className="whitespace-pre-line break-keep font-medium text-slate-800">
                      {studentAnswerText}
                    </span>
                  ) : (
                    <span className="text-slate-400">미입력</span>
                  )}
                </ScoreRow>
                <ScoreRow label="정답">
                  <span className="font-bold text-emerald-700">{correctText}</span>
                </ScoreRow>
                <ScoreRow label="판정">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-bold",
                      status.text,
                    )}
                  >
                    <span>{status.symbol}</span>
                    {status.label}
                  </span>
                </ScoreRow>
                {entry.points != null && (
                  <ScoreRow label="배점">
                    <span className="tabular-nums font-semibold text-slate-700">
                      {response.status === "PARTIAL" && response.earnedPoints != null
                        ? `${response.earnedPoints} / ${entry.points}`
                        : response.status === "CORRECT"
                          ? `${entry.points} / ${entry.points}`
                          : `0 / ${entry.points}`}
                      <span className="ml-0.5 text-[11px] font-medium text-slate-400">점</span>
                    </span>
                  </ScoreRow>
                )}
              </dl>
            </RailCard>

            {/* 해설 카드 — 본문 · 핵심 포인트 · 오답 선지 해설 */}
            {(explanationText ||
              keyPoints.length > 0 ||
              wrongOptions.length > 0 ||
              wrongOptionResult.parseFailed) && (
              <RailCard title="해설" icon={<BookOpen className="h-3.5 w-3.5" />}>
                {explanationText && (
                  <p className="whitespace-pre-line break-keep text-[13px] leading-relaxed text-slate-700">
                    {explanationText}
                  </p>
                )}
                {keyPoints.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {keyPoints.map((kp, i) => (
                      <li
                        key={i}
                        className="border-l-2 border-blue-300 pl-2 text-[12px] leading-relaxed text-slate-600 break-keep"
                      >
                        {kp}
                      </li>
                    ))}
                  </ul>
                )}

                {/* 오답 선지 해설(§9.2) — 학생이 고른 선지는 rose 로 짚어
                    "왜 이걸 골랐는지"를 목록에서 곧바로 찾을 수 있게 한다. */}
                {wrongOptions.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                      {SITTING_DETAIL_COPY.WRONG_OPTIONS}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {wrongOptions.map((w, i) => {
                        const picked =
                          studentOptionKey !== "" &&
                          optionMatchKey(w.label) === studentOptionKey;
                        return (
                          <li
                            key={`${w.label}-${i}`}
                            className={cn(
                              "flex items-start gap-2 rounded-md border px-2 py-1.5",
                              picked
                                ? "border-rose-200 bg-rose-50/60"
                                : "border-slate-100 bg-white",
                            )}
                          >
                            {/* 라벨 없는 통짜 해설(비-JSON 폴백)에서는 빈 배지를
                                그리지 않는다 — 회색 사각형만 남아 오해를 부른다. */}
                            {w.label !== "" && (
                              <span
                                className={cn(
                                  "mt-px flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold",
                                  picked
                                    ? "bg-rose-100 text-rose-600"
                                    : "bg-slate-100 text-slate-500",
                                )}
                              >
                                {choiceToCircled(w.label) || w.label}
                              </span>
                            )}
                            <span className="min-w-0 text-[12px] leading-relaxed text-slate-600 break-keep">
                              {w.text}
                              {picked && (
                                <span className="ml-1.5 whitespace-nowrap rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                                  학생 선택
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* 서버가 오답 해설을 보냈는데 형식을 못 읽은 경우 — 조용히 섹션을
                    지우면 강사는 「해설이 없는 문항」으로 오해한다(거짓 빈 상태 금지). */}
                {wrongOptions.length === 0 && wrongOptionResult.parseFailed && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                      {SITTING_DETAIL_COPY.WRONG_OPTIONS}
                    </p>
                    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-slate-500 break-keep">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {WRONG_OPTIONS_PARSE_FAILED}
                    </p>
                  </div>
                )}
              </RailCard>
            )}

            {/* 출제 분석 카드 */}
            {hasAnalysis && analysis && (
              <RailCard title="출제 분석" icon={<Info className="h-3.5 w-3.5" />}>
                <div className="flex flex-col gap-3">
                  {analysis.intent && (
                    <AnalysisRow icon={<Target className="h-3 w-3" />} label="출제 의도">
                      {analysis.intent}
                    </AnalysisRow>
                  )}
                  {analysis.examPoint && (
                    <AnalysisRow icon={<Lightbulb className="h-3 w-3" />} label="출제 포인트">
                      {analysis.examPoint}
                    </AnalysisRow>
                  )}
                  {analysis.solvingStrategy && (
                    <AnalysisRow icon={<Route className="h-3 w-3" />} label="접근 전략">
                      {analysis.solvingStrategy}
                    </AnalysisRow>
                  )}
                  {analysis.difficultyRationale && (
                    <AnalysisRow icon={<Gauge className="h-3 w-3" />} label="난이도 근거">
                      {analysis.difficultyRationale}
                    </AnalysisRow>
                  )}
                  {keyConcepts.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                        핵심 개념
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keyConcepts.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-slate-600"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {traps.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                        오답 함정
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {traps.map((t, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-100"
                          >
                            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded bg-rose-50 text-[11px] font-bold text-rose-600">
                              {choiceToCircled(t.choice)}
                            </span>
                            <span className="text-[12px] leading-relaxed text-slate-600 break-keep">
                              {t.why}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </RailCard>
            )}

            {/* 변형 문제 생성(§8.3) — 레일 최하단.
                mt-auto 로 내용이 짧을 때 바닥에 붙이고, 레일이 길어져 스크롤이
                생기면 lg 에서 sticky 로 시야에 남긴다(오답 검토의 종착 행동이라
                끝까지 스크롤해야 찾는 버튼이 되면 안 된다).
                lg 미만에서는 aside 가 스크롤 컨테이너가 아니므로 sticky 를 걸지 않는다. */}
            {/* 배경을 완전 불투명(bg-slate-50)으로 올리고 음수 하단 마진을 뺐다 —
                반투명 바 뒤로 글자가 비쳐 「깨진 화면」처럼 보이던 문제를 없앤다. */}
            <div className="mt-auto pt-1 lg:sticky lg:bottom-0 lg:-mx-4 lg:border-t lg:border-slate-100 lg:bg-slate-50 lg:px-4 lg:py-3">
              <button
                type="button"
                onClick={openVariant}
                disabled={variantBlockedText != null}
                title={variantBlockedText ?? undefined}
                aria-describedby={variantHintId}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Wand2 className="h-4 w-4" aria-hidden />
                {VARIANT_COPY.ONE}
              </button>
              {/* 비활성 사유는 title 만으로는 터치·보조기술에서 사라진다 — 문장으로도
                  남기고 aria-describedby 로 버튼에 묶는다. slate-400 은 흰/slate-50
                  배경에서 대비 3:1 미만이라 slate-500(사유일 때 slate-600)로 올린다. */}
              <p
                id={variantHintId}
                className={cn(
                  "mt-1.5 text-[12px] leading-relaxed break-keep",
                  variantBlockedText ? "font-medium text-slate-600" : "text-slate-500",
                )}
              >
                {variantBlockedText ?? variantHintText}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── 하위 프리미티브 ─────────────────────────────────────────────────────────

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">
      {children}
    </span>
  );
}

function NavButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function RailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="mb-2.5 flex items-center gap-1.5 text-slate-400">
        {icon}
        <h3 className="text-[10.5px] font-bold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ScoreRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function AnalysisRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      {/* 본문 하한 13px(스펙 §1.1 타이포 밀도) — 12.5px 였다 */}
      <p className="whitespace-pre-line break-keep text-[13px] leading-relaxed text-slate-700">
        {children}
      </p>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-[12.5px]">{REVIEW_LOADING_TEXT}</p>
    </div>
  );
}

function DegradedBlock({
  brief,
  reviewSource,
  reviewError,
  onRetry,
}: {
  brief: string;
  reviewSource: "INTERNAL" | "OTHER" | null;
  reviewError: boolean;
  onRetry?: () => void;
}) {
  // 세 갈래: 프리페치 실패(재시도) / 서비스 미생성 시험지(강등) / INTERNAL 원본 삭제.
  const message = reviewError
    ? "원본 문항을 불러오지 못했습니다. 일시적인 문제일 수 있습니다."
    : reviewSource === "OTHER"
      ? "원본 문항 미리보기는 서비스에서 생성·배포한 시험지에서만 제공됩니다. 우측의 채점·분석 정보는 그대로 확인할 수 있습니다."
      : "이 문항의 원본을 찾지 못했습니다. 문항이 수정·삭제되었을 수 있습니다.";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 py-4">
      {brief && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
            발문
          </p>
          <p className="whitespace-pre-line break-keep text-[13px] leading-relaxed text-slate-700">
            {brief}
          </p>
        </div>
      )}
      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[12px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="break-keep">{message}</p>
          {reviewError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
