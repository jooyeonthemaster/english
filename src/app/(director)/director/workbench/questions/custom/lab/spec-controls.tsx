"use client";

import {
  CHOICE_ITEM_PATTERN_LABELS,
  MARKER_STYLE_LABELS,
  CHOICE_LAYOUT_LABELS,
  STIMULUS_FORM_LABELS,
  type BoxFormat,
  type FormatSpec,
} from "@/lib/custom-question-types/format-spec";
import type { CompiledCustomType } from "@/lib/custom-question-types/types";

import { applyFormatToSpec } from "./lab-types";
import {
  BoxesEditor,
  ChipsRow,
  GroupLabel,
  LineList,
  Section,
  SelectRow,
  StepRow,
  TextRow,
  ToggleRow,
} from "./spec-fields";

// 스펙 컨트롤 — workingSpec.format 바인딩 폼(전부 제어 컴포넌트). 변경 즉시 setWorkingSpec →
// 중앙 라이브 미리보기가 투영으로 반응한다. 구조 필드 변경 시 spec 1급 필드도 동기화(applyFormatToSpec).

const LANGUAGE_LABELS: Record<string, string> = { ko: "한국어", en: "영어", mixed: "혼합" };
const LENGTH_HINT_LABELS: Record<string, string> = { SHORT: "짧게", MEDIUM: "보통", LONG: "길게" };
const ANSWER_SHAPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "서술형/단답",
  MIXED: "혼합",
};
const BLANK_RENDER_LABELS: Record<string, string> = {
  UNDERSCORES: "밑줄 _____",
  LABELED_UNDERSCORES: "(A) _____ 라벨 밑줄",
  PAREN: "괄호 (    )",
  BOX: "□ 빈 박스",
};
const DIFFICULTY_LABELS: Record<string, string> = { BASIC: "기본", INTERMEDIATE: "중급", KILLER: "킬러" };

const PAIRED_PATTERNS = new Set(["PAIR", "TRIPLE", "SEQUENCE", "TABLE_ROW"]);

export function SpecControls({
  spec,
  onChange,
}: {
  spec: CompiledCustomType;
  onChange: (next: CompiledCustomType) => void;
}) {
  const format = spec.format;
  if (!format) return null; // 컨테이너가 v1 시드를 보장 — 방어용.

  const patch = (next: FormatSpec) => onChange(applyFormatToSpec(spec, next));
  const setChoices = (p: Partial<FormatSpec["choices"]>) =>
    patch({ ...format, choices: { ...format.choices, ...p } });
  const setStim = (p: Partial<FormatSpec["stimulus"]>) =>
    patch({ ...format, stimulus: { ...format.stimulus, ...p } });
  const setAnswer = (p: Partial<FormatSpec["answer"]>) =>
    patch({ ...format, answer: { ...format.answer, ...p } });
  const setSubjective = (p: Partial<FormatSpec["answer"]["subjective"]>) =>
    setAnswer({ subjective: { ...format.answer.subjective, ...p } });
  const setStem = (p: Partial<FormatSpec["stem"]>) =>
    patch({ ...format, stem: { ...format.stem, ...p } });
  const setBoxes = (boxes: BoxFormat[]) => patch({ ...format, boxes });

  const c = format.choices;
  const s = format.stimulus;
  const a = format.answer;

  return (
    <div className="divide-y divide-slate-100">
      {/* 1. 선지 */}
      <Section title="선지" defaultOpen>
        <ToggleRow label="선지 있음" checked={c.present} onChange={(v) => setChoices({ present: v })} />
        {c.present ? (
          <>
            <StepRow label="선지 수" value={c.count} min={1} max={20} onChange={(v) => setChoices({ count: v })} />
            <SelectRow
              label="마커 스킴"
              value={c.markerStyle}
              options={MARKER_STYLE_LABELS}
              onChange={(v) => setChoices({ markerStyle: v as FormatSpec["choices"]["markerStyle"] })}
            />
            <SelectRow
              label="배치"
              value={c.layout}
              options={CHOICE_LAYOUT_LABELS}
              onChange={(v) => setChoices({ layout: v as FormatSpec["choices"]["layout"] })}
            />
            <SelectRow
              label="선지 구조"
              value={c.itemPattern}
              options={CHOICE_ITEM_PATTERN_LABELS}
              onChange={(v) => setChoices({ itemPattern: v as FormatSpec["choices"]["itemPattern"] })}
            />
            {PAIRED_PATTERNS.has(c.itemPattern) ? (
              <TextRow
                label="칸 구분자"
                value={c.pairSeparator}
                placeholder="예: — , - , /"
                onChange={(v) => setChoices({ pairSeparator: v })}
              />
            ) : null}
            <ChipsRow
              label="열 헤더"
              items={c.columnHeaders}
              onChange={(items) => setChoices({ columnHeaders: items })}
            />
            <SelectRow
              label="언어"
              value={c.language}
              options={LANGUAGE_LABELS}
              onChange={(v) => setChoices({ language: v as FormatSpec["choices"]["language"] })}
            />
            <SelectRow
              label="선지 길이"
              value={c.itemLengthHint}
              options={LENGTH_HINT_LABELS}
              onChange={(v) => setChoices({ itemLengthHint: v as FormatSpec["choices"]["itemLengthHint"] })}
            />
          </>
        ) : null}
      </Section>

      {/* 2. 자료 */}
      <Section title="자료(지문)">
        <ToggleRow label="자료 있음" checked={s.present} onChange={(v) => setStim({ present: v })} />
        {s.present ? (
          <>
            <SelectRow
              label="자료 형태"
              value={s.form}
              options={STIMULUS_FORM_LABELS}
              onChange={(v) => setStim({ form: v as FormatSpec["stimulus"]["form"] })}
            />
            <ToggleRow label="박스 테두리" checked={s.boxed} onChange={(v) => setStim({ boxed: v })} />
            <ToggleRow label="제목 라인" checked={s.titleLine} onChange={(v) => setStim({ titleLine: v })} />

            <GroupLabel>빈칸</GroupLabel>
            <StepRow
              label="빈칸 수"
              value={s.blanks.count}
              min={0}
              max={10}
              onChange={(v) => setStim({ blanks: { ...s.blanks, count: v } })}
            />
            <SelectRow
              label="빈칸 라벨"
              value={s.blanks.labelStyle}
              options={MARKER_STYLE_LABELS}
              onChange={(v) =>
                setStim({ blanks: { ...s.blanks, labelStyle: v as FormatSpec["choices"]["markerStyle"] } })
              }
            />
            <SelectRow
              label="빈칸 표기"
              value={s.blanks.renderStyle}
              options={BLANK_RENDER_LABELS}
              onChange={(v) =>
                setStim({ blanks: { ...s.blanks, renderStyle: v as FormatSpec["stimulus"]["blanks"]["renderStyle"] } })
              }
            />

            <GroupLabel>라벨 밑줄</GroupLabel>
            <StepRow
              label="밑줄 수"
              value={s.underlineMarks.count}
              min={0}
              max={15}
              onChange={(v) => setStim({ underlineMarks: { ...s.underlineMarks, count: v } })}
            />
            <SelectRow
              label="밑줄 라벨"
              value={s.underlineMarks.labelStyle}
              options={MARKER_STYLE_LABELS}
              onChange={(v) =>
                setStim({
                  underlineMarks: { ...s.underlineMarks, labelStyle: v as FormatSpec["choices"]["markerStyle"] },
                })
              }
            />
            <TextRow
              label="밑줄 대상"
              value={s.underlineMarks.target}
              placeholder="예: 어법 요소, 어휘"
              onChange={(v) => setStim({ underlineMarks: { ...s.underlineMarks, target: v } })}
            />

            <GroupLabel>단락 라벨 (A)(B)(C)</GroupLabel>
            <StepRow
              label="단락 수"
              value={s.paragraphLabels.count}
              min={0}
              max={10}
              onChange={(v) => setStim({ paragraphLabels: { ...s.paragraphLabels, count: v } })}
            />
            <SelectRow
              label="단락 라벨"
              value={s.paragraphLabels.style}
              options={MARKER_STYLE_LABELS}
              onChange={(v) =>
                setStim({ paragraphLabels: { ...s.paragraphLabels, style: v as FormatSpec["choices"]["markerStyle"] } })
              }
            />

            <GroupLabel>문장 번호 / 불릿</GroupLabel>
            <ToggleRow
              label="문장 앞 번호"
              checked={s.numberedSentences.present}
              onChange={(v) => setStim({ numberedSentences: { ...s.numberedSentences, present: v } })}
            />
            {s.numberedSentences.present ? (
              <SelectRow
                label="번호 스킴"
                value={s.numberedSentences.style}
                options={MARKER_STYLE_LABELS}
                onChange={(v) =>
                  setStim({
                    numberedSentences: { ...s.numberedSentences, style: v as FormatSpec["choices"]["markerStyle"] },
                  })
                }
              />
            ) : null}
            <ToggleRow
              label="불릿 섹션"
              checked={s.bulletSections.present}
              onChange={(v) => setStim({ bulletSections: { ...s.bulletSections, present: v } })}
            />
            {s.bulletSections.present ? (
              <>
                <StepRow
                  label="섹션 헤더 수"
                  value={s.bulletSections.headerCount}
                  min={0}
                  max={10}
                  onChange={(v) => setStim({ bulletSections: { ...s.bulletSections, headerCount: v } })}
                />
                <TextRow
                  label="불릿 기호"
                  value={s.bulletSections.bulletMarker}
                  placeholder="예: •"
                  onChange={(v) => setStim({ bulletSections: { ...s.bulletSections, bulletMarker: v } })}
                />
              </>
            ) : null}
          </>
        ) : null}
      </Section>

      {/* 3. 박스 */}
      <Section title={`박스 (${format.boxes.length})`}>
        <BoxesEditor boxes={format.boxes} onChange={setBoxes} />
      </Section>

      {/* 4. 정답/답안 */}
      <Section title="정답 / 답안">
        <SelectRow
          label="답형"
          value={a.shape}
          options={ANSWER_SHAPE_LABELS}
          onChange={(v) => setAnswer({ shape: v as FormatSpec["answer"]["shape"] })}
        />
        <StepRow label="정답 수" value={a.correctCount} min={1} max={20} onChange={(v) => setAnswer({ correctCount: v })} />
        <ToggleRow
          label="복수 정답"
          checked={a.multipleAnswers}
          onChange={(v) => setAnswer({ multipleAnswers: v })}
        />
        {a.shape !== "MULTIPLE_CHOICE" ? (
          <>
            <GroupLabel>서술형 답란</GroupLabel>
            <StepRow
              label="답란 줄 수"
              value={a.subjective.answerLineCount}
              min={0}
              max={12}
              onChange={(v) => setSubjective({ answerLineCount: v })}
            />
            <StepRow
              label="답 슬롯 수"
              value={a.subjective.answerBlankCount}
              min={0}
              max={10}
              onChange={(v) => setSubjective({ answerBlankCount: v })}
            />
            <SelectRow
              label="슬롯 라벨"
              value={a.subjective.blankLabelStyle}
              options={MARKER_STYLE_LABELS}
              onChange={(v) => setSubjective({ blankLabelStyle: v as FormatSpec["choices"]["markerStyle"] })}
            />
            <TextRow
              label="답 형태"
              value={a.subjective.answerFormat}
              placeholder="예: 한 단어씩 2개"
              onChange={(v) => setSubjective({ answerFormat: v })}
            />
            <StepRow
              label="조건 수"
              value={a.subjective.conditionsCount}
              min={0}
              max={10}
              onChange={(v) => setSubjective({ conditionsCount: v })}
            />
          </>
        ) : null}
      </Section>

      {/* 5. 발문 */}
      <Section title="발문">
        <div>
          <GroupLabel>발문 패턴</GroupLabel>
          <textarea
            value={format.stem.pattern}
            onChange={(e) => setStem({ pattern: e.target.value })}
            rows={3}
            placeholder="예: 다음 글의 ⓐ~ⓔ 중, 어법상 틀린 것끼리 짝지어진 것은?"
            className="w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 text-[11.5px] leading-relaxed"
          />
        </div>
        <SelectRow
          label="언어"
          value={format.stem.language}
          options={LANGUAGE_LABELS}
          onChange={(v) => setStem({ language: v as FormatSpec["stem"]["language"] })}
        />
        <ToggleRow
          label="부정형 발문"
          checked={format.stem.negativeForm}
          onChange={(v) => setStem({ negativeForm: v })}
        />
        <ToggleRow
          label="배점 표시"
          checked={format.stem.pointsVisible}
          onChange={(v) => setStem({ pointsVisible: v })}
        />
        {format.stem.pointsVisible ? (
          <label className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
            배점
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={format.stem.points ?? 0}
              onChange={(e) => setStem({ points: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-[11.5px]"
            />
          </label>
        ) : null}
        <ChipsRow label="강조 토큰" items={format.stem.emphasis} onChange={(items) => setStem({ emphasis: items })} />
      </Section>

      {/* 6. 출제 본질(내용) */}
      <Section title="출제 본질(내용)">
        <SelectRow
          label="난이도"
          value={spec.difficulty}
          options={DIFFICULTY_LABELS}
          onChange={(v) => onChange({ ...spec, difficulty: v as CompiledCustomType["difficulty"] })}
        />
        <LineList
          label="반드시 보존 (invariants)"
          items={spec.invariants}
          onChange={(items) => onChange({ ...spec, invariants: items })}
        />
        <LineList
          label="매번 가변 (variableAxes)"
          items={spec.variableAxes}
          onChange={(items) => onChange({ ...spec, variableAxes: items })}
        />
        <LineList
          label="형식 디테일 노트 (layoutNotes)"
          items={format.layoutNotes}
          onChange={(items) => patch({ ...format, layoutNotes: items })}
        />
        {spec.tunableParams.length > 0 ? (
          <div>
            <GroupLabel>조절 파라미터 (읽기 전용)</GroupLabel>
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
              {spec.tunableParams.map((p) => (
                <div key={p.key} className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>{p.label || p.key}</span>
                  <span className="tabular-nums text-slate-500">
                    {p.value} ({p.min}~{p.max})
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
