"use client";

// ============================================================================
// 지문 세트 — set card renderer (문제관리 QuestionBankCard 와 레이아웃 통일)
// ============================================================================
// 공유 지문을 헤더의 '지문' 토글로 한 번만 펼치고, 그 아래 멤버 문항을 차례로 —
// CSAT 43~45 레이아웃. 카드 셸·헤더 지문 토글·접힘 미리보기(CollapsedPreview)·
// 보기 배지·해설(ExplanationSection)·푸터는 모두 일반 관리 카드의 부품/클래스를
// 그대로 재사용해, 같은 목록에서 한 묶음처럼 보인다. 세트 전용은 '세트' 배지 +
// 멤버 번호 + 분리/확대뿐.
// ============================================================================

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Pencil,
  Scissors,
  Trash2,
} from "lucide-react";

import { optionDisplayTextForSubtype } from "@/components/exams/paper-builder/option-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import {
  DIFFICULTY_CONFIG,
  normalizeAnswerLabel,
  parseCorrectAnswerLabels,
  ReviewStatusStamp,
} from "@/components/workbench/question-card";
import { CollapsedPreview } from "@/components/workbench/question-bank-card/collapsed-preview";
import { ExplanationSection } from "@/components/workbench/question-bank-card/explanation-section";
import { renderFormatted } from "@/components/workbench/question-bank-card/render-formatted";
import { optionBadgeLabel } from "@/components/workbench/question-bank-card";
import type { Anchor } from "@/lib/question-sets/types";
import type {
  QuestionSetForRender,
  QuestionSetMember,
} from "@/actions/question-sets";

interface OptionLike {
  label: string;
  text: string;
}

function readOptions(value: unknown): OptionLike[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (o): o is { label?: unknown; text?: unknown } =>
        !!o && typeof o === "object" && !Array.isArray(o),
    )
    .map((o, i) => ({
      label: typeof o.label === "string" ? o.label : String(i + 1),
      text: typeof o.text === "string" ? o.text : "",
    }));
}

/** 멤버 한 문항 — 접힘(발문+정답 미리보기) / 펼침(발문+보기+해설). 관리 카드 본문과 동일. */
function MemberBlock({
  member,
  index,
  collapsed,
  onSplitMember,
  splitting,
}: {
  member: QuestionSetMember;
  index: number;
  collapsed: boolean;
  onSplitMember?: (questionId: string) => void;
  splitting?: boolean;
}) {
  const options = readOptions(member.options);
  const displayOptions =
    member.typeId === "SENTENCE_INSERT"
      ? options.map((o, i) => ({
          ...o,
          text: optionDisplayTextForSubtype("SENTENCE_INSERT", i, o.text),
        }))
      : options;
  const correctLabels = parseCorrectAnswerLabels(member.correctAnswer);
  const displayCorrectAnswer = formatStoredQuestionCorrectAnswer(member);
  const diff = DIFFICULTY_CONFIG[member.difficulty];

  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
      {/* 멤버 번호 + 난이도 + 분리 */}
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1 text-[11px] font-bold tabular-nums text-slate-500">
          {index + 1}
        </span>
        {diff && (
          <Badge variant="outline" className={`text-[10px] ${diff.className}`}>
            {diff.label}
          </Badge>
        )}
        <span className="flex-1" />
        {onSplitMember && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={splitting}
            data-drag-select-ignore
            title="이 문항의 복제본을 단독 문항으로 추가합니다(세트는 그대로)"
            onClick={(e) => {
              e.stopPropagation();
              onSplitMember(member.questionId);
            }}
            className="h-6 shrink-0 gap-1 border border-slate-200 bg-white px-1.5 text-[10.5px] font-semibold text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            {splitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Scissors className="h-3 w-3" />
            )}
            분리
          </Button>
        )}
      </div>

      {collapsed ? (
        // 접힘 — 발문 + 정답만(공유 지문은 헤더 토글로 보므로 passage 생략)
        <CollapsedPreview
          direction={member.questionText || member.typeId || ""}
          passage=""
          options={displayOptions}
          correctAnswer={member.correctAnswer}
          displayCorrectAnswer={displayCorrectAnswer}
          subType={member.typeId}
        />
      ) : (
        <>
          {/* 발문 */}
          <div className="whitespace-pre-line text-[13px] font-bold leading-relaxed text-slate-900">
            {renderFormatted(member.questionText || member.typeId || "", member.typeId)}
          </div>

          {/* 보기 — 관리 카드 MC 보기와 동일(정답 파란 동그라미 배지) */}
          {displayOptions.length > 0 && (
            <div className="space-y-1 pl-1">
              {displayOptions.map((opt) => {
                const isCorrect = correctLabels.has(normalizeAnswerLabel(opt.label));
                return (
                  <div
                    key={opt.label}
                    className={`flex items-start gap-2 rounded px-2 py-1 text-[12px] ${
                      isCorrect
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-slate-600"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isCorrect
                          ? "bg-blue-600 text-white"
                          : "border border-slate-300 bg-white text-slate-400"
                      }`}
                    >
                      {optionBadgeLabel(opt.label)}
                    </span>
                    <span className="pt-0.5">
                      {renderFormatted(opt.text, member.typeId)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 비-MC 정답 */}
          {displayOptions.length === 0 && displayCorrectAnswer && (
            <div className="rounded border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-700">
              <span className="font-medium">정답:</span>{" "}
              {renderFormatted(displayCorrectAnswer, member.typeId)}
            </div>
          )}

          {/* 해설 — 관리 카드와 동일(ExplanationSection) */}
          <ExplanationSection explanation={member.explanation} />
        </>
      )}
    </div>
  );
}

export function QuestionSetCard({
  set,
  onSplitMember,
  onEdit,
  onOpenDetail,
  onApprove,
  onDelete,
  compact = false,
  recentlyViewed = false,
}: {
  set: QuestionSetForRender;
  /** 멤버 분리 핸들러 — 누르면 해당 문항을 세트에서 빼낸다. 미지정 시 분리 버튼 숨김. */
  onSplitMember?: (questionId: string) => void | Promise<void>;
  /** 수정하기 — 지정 시 푸터 '수정하기' 노출. 일반 문항처럼 편집 모달을 연다. */
  onEdit?: () => void;
  /** 상세 — 지정 시 우하단 상세 아이콘 노출. 세트 상세(보기) 모달을 연다. */
  onOpenDetail?: () => void;
  /** 세트 전체 검수완료(멤버 일괄 승인). 미지정 시 버튼 숨김. */
  onApprove?: () => void | Promise<void>;
  /** 세트 삭제(멤버 일괄). 미지정 시 버튼 숨김. */
  onDelete?: () => void | Promise<void>;
  /** 목록 카드용 — 접힘 토글 노출 + 기본 접힘. 모달에선 펼침 고정. */
  compact?: boolean;
  /** 방금 상세를 열어봤다가 닫은 세트 카드 — 한 번 배경이 반짝인다. */
  recentlyViewed?: boolean;
}) {
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(compact);
  const [passageOpen, setPassageOpen] = useState(false);

  const handleSplitMember = onSplitMember
    ? async (questionId: string) => {
        if (splittingId) return;
        setSplittingId(questionId);
        try {
          await onSplitMember(questionId);
        } finally {
          setSplittingId(null);
        }
      }
    : undefined;

  const allApproved =
    set.members.length > 0 && set.members.every((m) => m.approved);

  // 멤버 anchor 를 모두 병합해 공유 지문을 한 번만 재구성.
  const mergedPassage = useMemo(() => {
    const base = set.layout?.fullPassage ?? set.canonicalPassage;
    const anchors: Anchor[] = set.members.flatMap((m) =>
      Array.isArray(m.spans) ? m.spans : [],
    );
    return reconstructPassageView(base, anchors).text;
  }, [set]);

  const givenSentence =
    set.structuralMode === "SENTENCE_INSERT" ? set.layout?.givenSentence : undefined;
  const passageTitle = set.passageTitle || "지문";

  return (
    <Card
      className={`group relative flex h-full flex-col gap-0 py-0 transition-all hover:shadow-md ${
        recentlyViewed ? "motion-safe:animate-[card-recently-viewed-flash_1.2s_ease-out] " : ""
      }${
        !allApproved
          ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]"
          : ""
      }`}
    >
      <CardContent className="flex flex-1 flex-col gap-1.5 p-3">
        {/* 헤더 — 관리 카드 톤: 세트 배지 + 지문 토글(flex-1) + 확대/삭제/접기 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-600"
            >
              세트 · {set.members.length}문항
            </Badge>
            <button
              type="button"
              data-drag-select-ignore
              onClick={(e) => {
                e.stopPropagation();
                setPassageOpen((v) => !v);
              }}
              title={passageTitle}
              className="inline-flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <FileText className="h-3 w-3 shrink-0 text-blue-400" />
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">
                {passageTitle}
              </span>
              {passageOpen ? (
                <ChevronUp className="h-3 w-3 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
              )}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onDelete && (
              <button
                type="button"
                data-drag-select-ignore
                onClick={() => void onDelete()}
                title="세트 삭제(문항 전체)"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            {compact && (
              <button
                type="button"
                data-drag-select-ignore
                onClick={() => setCollapsed((v) => !v)}
                aria-expanded={!collapsed}
                title={collapsed ? "펼치기" : "접기"}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-blue-300 transition-colors hover:bg-blue-50 hover:text-blue-500"
              >
                {collapsed ? (
                  <ChevronDown className="size-4.5" />
                ) : (
                  <ChevronUp className="size-4.5" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* 공유 지문 펼침 — 관리 카드 지문 펼침과 동일 */}
          {passageOpen && mergedPassage && (
            <div className="shrink-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
              {givenSentence && (
                <p className="mb-1.5 text-[11px] text-slate-600">
                  <span className="mr-1.5 font-semibold text-slate-500">
                    주어진 문장
                  </span>
                  {givenSentence}
                </p>
              )}
              <p className="max-h-[250px] overflow-y-auto whitespace-pre-line font-mono text-[11px] leading-relaxed text-slate-500">
                {renderFormatted(mergedPassage, null)}
              </p>
            </div>
          )}

          {/* 공유 지문 접힘 미리보기 — 관리 카드 접힘과 동일하게 2줄 노출(지문 토글로 전체). */}
          {!passageOpen && collapsed && mergedPassage && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="line-clamp-2 whitespace-pre-wrap font-mono text-[12px] leading-[1.8] text-slate-700">
                {renderFormatted(mergedPassage, null)}
              </div>
            </div>
          )}

          {/* 멤버 문항 */}
          {set.members.map((m, i) => (
            <MemberBlock
              key={m.itemId}
              member={m}
              index={i}
              collapsed={collapsed}
              onSplitMember={handleSplitMember}
              splitting={splittingId === m.questionId}
            />
          ))}
        </div>

        {/* 푸터 — 관리 카드 톤: 날짜/도장 줄 + 검수완료/전체보기 */}
        <div className="mt-auto space-y-2 border-t border-slate-100 pt-1.5">
          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] text-slate-400">
              <span>{formatDateTime(set.createdAt)}</span>
            </div>
            <ReviewStatusStamp approved={allApproved} className="shrink-0" />
          </div>
          {(onApprove || onEdit || onOpenDetail) && (
            <div className="flex items-end gap-1.5">
              {onApprove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={allApproved}
                  title={
                    allApproved
                      ? "검수완료 — 모든 문항이 검수되었습니다"
                      : "검수필요 — 누르면 세트 전체를 검수완료로 표시합니다"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    void onApprove();
                  }}
                  className={
                    "h-7 flex-1 justify-center gap-1.5 bg-white px-2 text-[11px] font-semibold " +
                    (allApproved
                      ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      : "border border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                  }
                >
                  <CheckCircle2 className="h-3 w-3" />
                  검수완료
                </Button>
              )}
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  className="h-7 flex-1 justify-center gap-1.5 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                >
                  <Pencil className="h-3 w-3" />
                  수정하기
                </Button>
              )}
              {onOpenDetail && (
                <CardDetailIconButton
                  className="size-7 shrink-0 rounded-md"
                  iconClassName="size-3.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail();
                  }}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
