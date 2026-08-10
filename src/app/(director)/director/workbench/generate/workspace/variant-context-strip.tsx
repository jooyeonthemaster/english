"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Copy, Undo2, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { VARIANT_COPY } from "@/lib/wording/director-glossary";
import {
  buildVariantPrompts,
  variantSeedSummary,
  variantTypeLabel,
  type VariantSeed,
} from "@/lib/question-variant";

// ============================================================================
// 오답 기반 변형 — 생성 페이지 컨텍스트 스트립 (규범: docs/student-hub-uiux-2607-spec.md §8.4)
//
// 딥링크로 워크스페이스에 지문이 자동으로 담기면, "왜 이 지문이 여기 있는지"를
// 화면에 남기지 않는 한 사용자는 근거를 잃는다. 이 스트립이 그 근거(어느 학생·
// 어느 시험·어떤 오답)를 항상 보이게 붙들고, 원본 문항 목록을 펼쳐 확인할 수
// 있게 한다 — 근거를 감추지 않는다.
//
// 생성 지시문(buildVariantPrompt)은 딥링크 수신부가 각 지문 행의 override
// customPrompt 에 실어 두지만(전역 「추가 요청사항」이 아니다 — 유형별 지시가
// 섞이면 안 되므로), 그 값은 지문 행의 「설정」(문제 생성 모달) 안에 있어
// 스트립에서는 보이지 않는다. 따라서 여기서 "전달됩니다" 사실을 고지하고
// 복사 버튼을 함께 둔다.
// ============================================================================

/** 난이도 표기 — 코드베이스 관용(exam-detail-client-parts/constants.ts:43)과 동일 */
const VARIANT_DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "고난도",
};

/**
 * `from` 은 URL 에서 온 값이라 그대로 <Link> 에 넣으면 `//evil.com` 같은
 * 프로토콜 상대 URL 로 외부 이동이 된다. 수신부에서 한 번 거르지만 이 컴포넌트도
 * prop 으로 받는 이상 스스로 방어한다(오픈 리다이렉트는 한 겹으로 막지 않는다).
 */
function safeInternalHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return href.startsWith("/") && !href.startsWith("//") ? href : null;
}

/** 정상 스트립은 blue(진행), 시드 유실 배너는 rose(경고) — §1.1 색 의미 */
function BackLink({ href, tone }: { href: string; tone: "blue" | "rose" }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border bg-white px-2 py-1 text-[12px] font-semibold transition-colors",
        tone === "blue"
          ? "border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-100"
          : "border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-100",
      )}
    >
      <Undo2 className="h-3 w-3" aria-hidden />
      {VARIANT_COPY.STRIP_BACK}
    </Link>
  );
}

export function VariantContextStrip({
  seed,
  backHref,
  onClear,
}: {
  seed: VariantSeed;
  /** `from` 파라미터(내부 절대경로) — 오답 검토 화면으로 되돌아가는 길 */
  backHref?: string | null;
  onClear: () => void;
}) {
  /** 원본 문항 목록 펼침 — 기본은 접힘(한 줄 스트립이 원형) */
  const [expanded, setExpanded] = useState(false);
  /**
   * 스트립 전체 접기 — 워크스페이스 상단을 계속 차지하면 정작 지문 편집 영역이
   * 밀린다. 접어도 "무엇이 걸려 있는지"(제목 + 요약)와 액션은 남겨,
   * 근거를 잃지 않으면서 세로 공간만 돌려준다.
   */
  const [open, setOpen] = useState(true);

  // 유형별 프롬프트를 하나로 합친 텍스트 — 복사 버튼이 넘기는 본문.
  // seed 가 바뀔 때만 재계산한다(문항 수가 많으면 문자열 조립이 싸지 않다).
  const promptText = useMemo(
    () => Object.values(buildVariantPrompts(seed)).join("\n\n"),
    [seed],
  );

  const back = safeInternalHref(backHref);

  const handleCopy = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      toast.success("변형 생성 지시문을 복사했어요.");
    } catch {
      // 클립보드 권한 거부·비보안 컨텍스트 — 무음 실패 금지.
      // 안내는 반드시 도달 가능한 경로를 가리켜야 한다: 지시문은 전역
      // 「추가 요청사항」이 아니라 각 지문 행의 「설정」 안에 실려 있다.
      toast.error(
        "복사하지 못했어요. 지문 행의 「설정」을 열면 추가 요청사항에서 확인할 수 있어요.",
      );
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          {/* 제목 줄 — 무엇이 걸려 있는지 한 줄로. 접힘 상태에서도 이 줄은 남는다.
              줄 전체가 접기/펴기 토글이라 좁은 화면에서도 누르기 쉽다. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="variant-strip-body"
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-blue-700 transition-transform",
                !open && "-rotate-90",
              )}
              aria-hidden
            />
            <span className="text-[13px] font-bold text-blue-900">
              {VARIANT_COPY.STRIP_TITLE}
            </span>
            <span className="text-[12.5px] font-semibold text-blue-800">
              {variantSeedSummary(seed)}
            </span>
            <span className="ml-auto text-[12px] font-semibold text-blue-700/80">
              {open ? VARIANT_COPY.STRIP_COLLAPSE : VARIANT_COPY.STRIP_EXPAND}
            </span>
          </button>

          {!open ? null : (
          <div id="variant-strip-body">
          <p className="mt-0.5 text-[12px] leading-relaxed text-blue-700/90">
            {VARIANT_COPY.STRIP_HINT}
          </p>

          {/* 지시문 고지 + 복사 — 프리필된 「추가 요청사항」이 행 설정 안에 있어
              여기서는 사실만 알리고 원문을 가져갈 수단을 준다 */}
          {promptText ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-blue-700">
                {VARIANT_COPY.STRIP_PROMPT_APPLIED}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-1 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              >
                <Copy className="h-3 w-3" aria-hidden />
                {VARIANT_COPY.STRIP_PROMPT_COPY}
              </button>
            </div>
          ) : null}

          {/* 원본 문항 — 접힘/펼침. 근거(학생 답 → 정답)를 감추지 않는다.
              라벨은 glossary 상수 하나로 고정하고 펼침 상태는 aria-expanded 와
              셰브런 회전으로 전달한다(§1.2 리터럴 직접 표기 금지). */}
          {seed.questions.length > 0 ? (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls="variant-seed-questions"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:text-blue-900"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    expanded && "rotate-180",
                  )}
                  aria-hidden
                />
                {VARIANT_COPY.STRIP_SOURCE_TOGGLE}
                <span className="rounded-full bg-blue-100 px-1.5 text-[11px] font-bold tabular-nums text-blue-700">
                  {seed.questions.length}
                </span>
              </button>

              {expanded ? (
                <ul
                  id="variant-seed-questions"
                  className="mt-1.5 space-y-1 rounded-md border border-blue-200 bg-white px-2.5 py-2"
                >
                  {seed.questions.map((q) => (
                    <li
                      key={q.questionId}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] leading-relaxed"
                    >
                      <span className="font-bold tabular-nums text-slate-700">
                        {q.orderLabel}
                      </span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {q.typeLabel}
                      </span>
                      {q.passageTitle ? (
                        <span className="max-w-[220px] truncate text-[12px] text-slate-500">
                          {q.passageTitle}
                        </span>
                      ) : null}
                      {/* 학생 답 → 정답. 오답이 rose, 정답이 emerald 인 허브
                          색 축을 그대로 따른다(§1.1 색 의미) */}
                      {q.studentText ? (
                        <span className="text-[12.5px] text-rose-600">
                          학생 답 {q.studentText}
                        </span>
                      ) : null}
                      {q.correctText ? (
                        <span className="text-[12.5px] text-emerald-700">
                          → 정답 {q.correctText}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          </div>
          )}
        </div>

        {/* 우측 액션 — 「돌아가기」(원본 오답 화면)와 「연결 해제」.
            접힘 상태에서도 남긴다 — 접는 것은 설명을 줄이는 것이지 기능을
            숨기는 것이 아니다. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {back ? <BackLink href={back} tone="blue" /> : null}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[12px] font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
            title="이 워크스페이스와 오답 기록의 연결을 끊습니다(담긴 지문은 그대로 남습니다)"
          >
            <X className="h-3 w-3" aria-hidden />
            {VARIANT_COPY.STRIP_CLEAR}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 시드 유실 폴백 배너 (검수 [21] critical)
//
// `?variant=` 는 있는데 sessionStorage 시드가 사라진 경우(새 탭·새로고침·
// SEED_KEEP 초과 청소). 지문·유형·난이도는 URL 로 복원되므로 화면은 '정상'으로
// 보이지만 원본 오답 정보와 변형 지시문은 없다 — 사용자는 오답 변형을 만든다고
// 믿으면서 평범한 신규 문항에 크레딧을 쓰게 된다.
// 그래서 무음으로 넘어가지 않고, 무엇이 복원됐고 무엇이 없는지를 축약 배너로
// 화면에 남긴다. 색은 경고이므로 rose(§1.1 색 의미).
// ============================================================================

export function VariantSeedMissingStrip({
  typeCounts,
  difficulty,
  backHref,
  onClear,
}: {
  /** URL `types` 로 복원된 유형별 개수 */
  typeCounts: Record<string, number>;
  /** URL `difficulty` 로 복원된 난이도 */
  difficulty?: string | null;
  backHref?: string | null;
  onClear: () => void;
}) {
  const back = safeInternalHref(backHref);
  const typeEntries = Object.entries(typeCounts);

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-600 text-white">
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-bold text-rose-900">
              {VARIANT_COPY.STRIP_TITLE}
            </span>
            <span className="text-[12.5px] font-semibold text-rose-800">
              원본 오답 기록을 불러오지 못했습니다
            </span>
          </div>

          <p className="mt-0.5 text-[12px] leading-relaxed text-rose-700/90">
            지문·유형·난이도만 복원했습니다. 원본 문항과 변형 지시문 없이
            생성됩니다 — 오답 기반으로 만들려면 원본 화면에서 다시 눌러 주세요.
          </p>

          {/* 무엇이 복원됐는지는 숨기지 않는다 — 유형·난이도만 칩으로 */}
          {typeEntries.length > 0 || difficulty ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {typeEntries.map(([subType, n]) => (
                <span
                  key={subType}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"
                >
                  {variantTypeLabel(subType)} {n}
                </span>
              ))}
              {difficulty ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {VARIANT_DIFFICULTY_LABELS[difficulty] ?? difficulty}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {back ? <BackLink href={back} tone="rose" /> : null}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[12px] font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100"
            title="이 안내를 닫고 변형 링크 연결을 끊습니다(담긴 지문은 그대로 남습니다)"
          >
            <X className="h-3 w-3" aria-hidden />
            {VARIANT_COPY.STRIP_CLEAR}
          </button>
        </div>
      </div>
    </div>
  );
}
