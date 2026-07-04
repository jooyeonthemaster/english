"use client";

// ============================================================================
// KoQuestionRenderer — 국어(KO_*) 문항 카드 렌더러 (KO-DESIGN-SPEC §4·§9)
// ============================================================================
// 레지스트리 모듈(mod.toRenderModel)이 만든 KoRenderModel 하나만 소비한다 —
// 유형별 카드 재구현 금지. 시각 언어(발문·지문 박스·선지·정답/해설 토글)는
// 기존 구조화 렌더러(question-type-renderers.tsx)와 동일 룩앤필을 따른다.
//   - 발문: 부정어 __밑줄__ + [n점] 표기(stem.points — 수능 3점 이상만)
//   - 지문 parts: (가) 볼드 라벨 + 테두리 박스 + 파트별 출처 우측정렬 + 하단 각주
//   - 자체자료(stimulus): 지문 박스 룩 + 라벨/표제 + 행 보존 본문 + 하단 각주
//   - <보기>: 테두리 박스 + 중앙 "〈 보 기 〉" 라벨
//   - 선지 ①~⑤: 기존 OptionList 재사용(정답 파란 배지 관행 동일)
//   - <조건>: [조건] 라벨 + • 불릿
//   - 서술형 채점기준표·인정답안: AnswerRevealSection(정답 영역) 안에만 배치 —
//     학생 노출 금지(기존 카드의 정답/해설 토글과 동일 게이트)
//   - 난도5(needsSolverGate) 유형: '검수 권장' 소형 배지 (주황 금지 — 리포 금기)
// prompts/quality/solver-gate 등 서버 전용 모듈은 import 하지 않는다
// (korean/core·registry 는 순수 TS — 클라이언트 안전).
// ============================================================================

import React from "react";
import { Badge } from "@/components/ui/badge";
import { getKoTypeModule, isKoQuestionType } from "@/lib/korean/registry";
import type {
  KoFootnote,
  KoRenderModel,
  KoRenderPassagePart,
  KoRenderStimulusBlock,
} from "@/lib/korean/core/render-model";
import {
  Direction,
  OptionList,
  ModelAnswer,
  ExplanationSection,
  AnswerLine,
  AnswerRevealSection,
} from "../question-renderer-primitives";
import { SelectableBlock, blockExcerpt } from "../question-renderer-blocks";

// ---------------------------------------------------------------------------
// 인라인 렌더 — __밑줄__ + 국어 마커(㉠~㉭·ⓐ~ⓙ·[A]~[D]) 강조
// ---------------------------------------------------------------------------
// 영어 renderPassageFormatted 는 단락 내 단일 개행을 공백으로 접는 reflow 가
// 있어 시·희곡의 행 구분이 깨진다 → KO 전용 최소 구현(개행 무변경).
// 빈칸 평문 토큰 "[ ㉮ ]" 은 규약상 강조 없이 그대로 통과한다.

const KO_INLINE_RE = /__([^_]+)__|([㉠-㉭ⓐ-ⓙ])|(\[[A-D]\])/g;

function renderKoInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  const regex = new RegExp(KO_INLINE_RE.source, "g");

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // __구절__ → 밑줄 (기존 renderUnderlinedText 와 동일 스타일)
      parts.push(
        <span
          key={key++}
          className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
        >
          {match[1]}
        </span>,
      );
    } else {
      // ㉠/ⓐ/[A] 마커 → 파란 볼드 (기존 마커 강조 관행)
      parts.push(
        <span key={key++} className="font-bold text-blue-600">
          {match[2] || match[3]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

// ---------------------------------------------------------------------------
// 조각 컴포넌트
// ---------------------------------------------------------------------------

/** 지문 파트 박스 — (가) 볼드 라벨 + 출처 우측정렬 + 하단 각주(*어휘: 뜻). */
function KoPassagePartBox({ part }: { part: KoRenderPassagePart }) {
  const footnotes: KoFootnote[] = Array.isArray(part.footnotes) ? part.footnotes : [];
  return (
    <SelectableBlock
      blockId={part.label ? `passage:${part.label}` : "passage"}
      label={part.label ? `지문 ${part.label}` : "지문"}
      field="passage"
      excerpt={blockExcerpt(part.text)}
    >
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
        <div className="font-mono text-[12.5px] leading-[1.9] text-slate-700 whitespace-pre-wrap">
          {part.label && (
            <span className="font-bold text-slate-900 mr-1.5">{part.label}</span>
          )}
          {renderKoInline(part.text)}
        </div>
        {part.sourceLine && (
          <div className="text-right text-[11px] text-slate-500">{part.sourceLine}</div>
        )}
        {footnotes.length > 0 && (
          <div className="border-t border-slate-200 pt-1.5 space-y-0.5">
            {footnotes.map((f, i) => (
              <p key={i} className="text-[11px] text-slate-500 leading-relaxed">
                *{f.term}: {f.gloss}
              </p>
            ))}
          </div>
        )}
      </div>
    </SelectableBlock>
  );
}

/**
 * 자체자료(stimulus) 박스 — 지문 박스와 동일 룩(수능 35~45 자료 조판 관행).
 * (가)/[자료] 라벨 볼드 + 표제 + 행 보존 본문(화자 라벨·괄호 지시문·S#·
 * '[현대어 풀이]' 행 쌍은 lines 원소 그대로) + 하단 각주.
 */
function KoStimulusBox({ block, index }: { block: KoRenderStimulusBlock; index: number }) {
  const footnotes: KoFootnote[] = Array.isArray(block.footnotes) ? block.footnotes : [];
  return (
    <SelectableBlock
      blockId={block.label ? `stimulus:${block.label}` : `stimulus:${index}`}
      label={block.label ? `자료 ${block.label}` : "자료"}
      field="koStimulus"
      excerpt={blockExcerpt(block.lines.join(" "))}
    >
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
        {(block.label || block.title) && (
          <div className="text-[12.5px] text-slate-900">
            {block.label && <span className="font-bold mr-1.5">{block.label}</span>}
            {block.title && <span className="font-semibold">{block.title}</span>}
          </div>
        )}
        <div className="font-mono text-[12.5px] leading-[1.9] text-slate-700 whitespace-pre-wrap">
          {renderKoInline(block.lines.join("\n"))}
        </div>
        {footnotes.length > 0 && (
          <div className="border-t border-slate-200 pt-1.5 space-y-0.5">
            {footnotes.map((f, i) => (
              <p key={i} className="text-[11px] text-slate-500 leading-relaxed">
                *{f.term}: {f.gloss}
              </p>
            ))}
          </div>
        )}
      </div>
    </SelectableBlock>
  );
}

/** "보기" → "보 기" (수능 조판 관행 — 두 글자 이하만 자간 벌림). */
function bogiLabelDisplay(label: string): string {
  const compact = label.replace(/\s+/g, "");
  return compact.length <= 2 ? compact.split("").join(" ") : label;
}

/** <보기> 박스 — 테두리 박스 + 중앙 "〈 보 기 〉" 라벨. */
function KoBogiBox({ bogi }: { bogi: NonNullable<KoRenderModel["bogi"]> }) {
  return (
    <SelectableBlock
      blockId="bogi"
      label={bogi.label}
      field="bogi"
      excerpt={blockExcerpt(bogi.lines.join(" "))}
    >
      <div className="rounded-lg border border-slate-300 bg-white px-4 py-3">
        <div className="text-center text-[11px] font-bold text-slate-600 mb-2">
          〈 {bogiLabelDisplay(bogi.label)} 〉
        </div>
        <div className="space-y-1">
          {bogi.lines.map((line, i) => (
            <p
              key={i}
              className="text-[12.5px] leading-[1.8] text-slate-800 whitespace-pre-wrap"
            >
              {renderKoInline(line)}
            </p>
          ))}
        </div>
      </div>
    </SelectableBlock>
  );
}

/** <조건> 박스 — [조건] 라벨 + • 불릿 (서술형 조건 관행, 앰버 금지 → 슬레이트). */
function KoConditionBox({ conditions }: { conditions: string[] }) {
  return (
    <SelectableBlock
      blockId="conditions"
      label="조건"
      field="conditions"
      excerpt={blockExcerpt(conditions.join(" · "))}
    >
      <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-3 space-y-1.5">
        <span className="text-[10px] font-bold text-slate-500 tracking-wider block">
          [조건]
        </span>
        <ul className="space-y-1">
          {conditions.map((c, i) => (
            <li
              key={i}
              className="text-[12px] text-slate-700 leading-relaxed flex items-start gap-1.5"
            >
              <span className="text-slate-400 mt-0.5">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </SelectableBlock>
  );
}

interface KoRubricItem {
  item: string;
  points: number;
}

/** 서술형 채점기준표 — 교사 뷰 전용(AnswerRevealSection 내부에서만 렌더). */
function KoRubricTable({ rubric }: { rubric: KoRubricItem[] }) {
  return (
    <SelectableBlock
      blockId="rubric"
      label="채점 기준"
      field="essay"
      excerpt={blockExcerpt(rubric.map((r) => r.item).join(" · "))}
    >
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
          채점 기준
        </span>
        <div className="space-y-1">
          {rubric.map((r, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 text-[12px] text-slate-700"
            >
              <span className="leading-relaxed">{r.item}</span>
              <span className="shrink-0 font-bold text-blue-600 tabular-nums">
                {r.points}점
              </span>
            </div>
          ))}
        </div>
      </div>
    </SelectableBlock>
  );
}

// ---------------------------------------------------------------------------
// 봉투 필드 안전 리더 (structuredData 는 unknown 취급)
// ---------------------------------------------------------------------------

interface KoEssayView {
  model: string;
  accepted: string[];
  rubric: KoRubricItem[];
}

function readEssay(value: unknown): KoEssayView | null {
  if (!value || typeof value !== "object") return null;
  const sheet = (value as Record<string, unknown>).answerSheet;
  if (!sheet || typeof sheet !== "object") return null;
  const s = sheet as Record<string, unknown>;
  const model = typeof s.model === "string" ? s.model : "";
  const accepted = Array.isArray(s.accepted)
    ? s.accepted.filter((a): a is string => typeof a === "string")
    : [];
  const rubric: KoRubricItem[] = [];
  if (Array.isArray(s.rubric)) {
    for (const raw of s.rubric) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.item === "string" && typeof r.points === "number") {
        rubric.push({ item: r.item, points: r.points });
      }
    }
  }
  if (!model && rubric.length === 0) return null;
  return { model, accepted, rubric };
}

/** KO 봉투의 오답해설 배열([{label, explanation}]) → ExplanationSection 의 Record 형. */
function readWrongOptionExplanations(value: unknown): Record<string, string> | undefined {
  if (!Array.isArray(value)) return undefined;
  const record: Record<string, string> = {};
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.label === "string" && typeof e.explanation === "string") {
      record[e.label] = e.explanation;
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function readOptions(value: unknown): { label: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const options: { label: string; text: string }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.label === "string" && typeof o.text === "string") {
      options.push({ label: o.label, text: o.text });
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// 메인 렌더러
// ---------------------------------------------------------------------------

export function KoQuestionRenderer({ q }: { q: Record<string, unknown> }) {
  const typeId = typeof q._typeId === "string" ? q._typeId : "";
  const mod = isKoQuestionType(typeId) ? getKoTypeModule(typeId) : null;
  const passage =
    typeof q._sourcePassageContent === "string" ? q._sourcePassageContent : undefined;

  let model: KoRenderModel | null = null;
  if (mod) {
    try {
      model = mod.toRenderModel(q, { passage });
    } catch {
      model = null; // 렌더모델 조립 실패 → 아래 최소 폴백 (비파괴)
    }
  }

  const correctAnswer = typeof q.correctAnswer === "string" ? q.correctAnswer : "";
  const explanation = typeof q.explanation === "string" ? q.explanation : "";
  const keyPoints = Array.isArray(q.keyPoints)
    ? q.keyPoints.filter((kp): kp is string => typeof kp === "string")
    : [];
  const wrongOptionExplanations = readWrongOptionExplanations(q.wrongOptionExplanations);
  const essay = readEssay(q.essay);
  // 난도5(솔버 게이트) 유형 또는 솔버가 검수를 권장한 문항 — 소형 배지 노출.
  const reviewRecommended =
    q._reviewRecommended === true || mod?.meta.needsSolverGate === true;

  // 모듈 미등록/조립 실패 폴백 — 발문·선지·정답만 최소 렌더(기존 Fallback 관행)
  if (!model) {
    const fallbackOptions = readOptions(q.options);
    return (
      <>
        {typeof q.direction === "string" && q.direction && (
          <Direction text={q.direction} />
        )}
        {fallbackOptions.length > 0 && (
          <OptionList options={fallbackOptions} correctAnswer={correctAnswer} />
        )}
        <AnswerRevealSection>
          <AnswerLine answer={correctAnswer} />
          <ExplanationSection
            explanation={explanation}
            keyPoints={keyPoints}
            wrongOptionExplanations={wrongOptionExplanations}
          />
        </AnswerRevealSection>
      </>
    );
  }

  // 발문 — 부정어 밑줄(__ __)은 Direction 내부 렌더가 처리, [n점]은 끝에 표기.
  const stemText =
    model.stem.text + (model.stem.points ? ` [${model.stem.points}점]` : "");
  const isMc = model.answerFormat === "MC5";

  return (
    <>
      {reviewRecommended && (
        <div className="flex justify-end">
          <Badge
            variant="outline"
            className="text-[9px] font-bold border-violet-200 bg-violet-50 text-violet-700"
          >
            검수 권장
          </Badge>
        </div>
      )}
      {model.setDirective && (
        <div className="text-[12px] font-bold text-slate-700">{model.setDirective}</div>
      )}
      <Direction text={stemText} />
      {model.passage?.parts.map((part, i) => (
        <KoPassagePartBox key={i} part={part} />
      ))}
      {model.stimulus?.map((block, i) => (
        <KoStimulusBox key={i} block={block} index={i} />
      ))}
      {model.bogi && <KoBogiBox bogi={model.bogi} />}
      {isMc && model.options && model.options.length > 0 && (
        <OptionList options={model.options} correctAnswer={correctAnswer} />
      )}
      {model.conditionBox && model.conditionBox.length > 0 && (
        <KoConditionBox conditions={model.conditionBox} />
      )}
      <AnswerRevealSection>
        {isMc ? (
          <AnswerLine answer={correctAnswer} />
        ) : (
          <ModelAnswer answer={essay?.model || correctAnswer} label="모범 답안" />
        )}
        {!isMc && essay && essay.accepted.length > 0 && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
              인정 답안
            </span>
            {essay.accepted.map((a, i) => (
              <p key={i} className="text-[12px] text-emerald-800 leading-relaxed">
                {a}
              </p>
            ))}
          </div>
        )}
        {!isMc && essay && essay.rubric.length > 0 && (
          <KoRubricTable rubric={essay.rubric} />
        )}
        <ExplanationSection
          explanation={explanation}
          keyPoints={keyPoints}
          wrongOptionExplanations={wrongOptionExplanations}
        />
      </AnswerRevealSection>
    </>
  );
}
