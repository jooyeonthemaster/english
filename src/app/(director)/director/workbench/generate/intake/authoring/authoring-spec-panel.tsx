"use client";

// ============================================================================
// AuthoringSpecPanel — 설계 레일의 내용물(설정 줄 10개)
//
// 형태 계약: **한 항목 = 한 줄(h-9 / 36px)**. 줄에는 라벨과 현재 값만 남기고,
// 선택지와 설명은 누를 때만 팝오버로 편다. 예전에는 항목을 전부 펼친 카드로 쌓아
// 레일이 통째로 스크롤됐는데, 설정은 "지금 뭐로 돼 있나"를 한눈에 보는 게 먼저다.
//
// 이번 개편에서 바뀐 것(되돌리지 말 것)
//  · 묶음 셋 → **넷**: 얼마나 어렵게(4줄) / 무엇을 쓸까(3줄) / 어떻게 낼까(1줄) /
//    몇 편 만들까(2줄). 서버 프롬프트가 새로 받는 축(skeleton · examTrack ·
//    targetQuestionTypes)이 화면에 없으면 기본값으로만 나가 "설정을 바꿔도 결과가
//    같다"가 된다.
//  · **뼈대 = 갈래(genre) + 골격(skeleton) 한 줄.** 축은 둘인데 줄은 하나다 —
//    둘 다 "이 글이 어떤 모양으로 굴러가는가"를 정하는 값이고, 무엇보다 줄을 늘리면
//    레일 높이 예산이 깨진다.
//  · 단어·문장은 절대값이 아니라 **학년 기준에 대한 오프셋**이라 라벨이 '한 단계
//    쉽게 / 학년 기준 / 한 단계 어렵게'다(schema). '쉬움/보통/어려움'으로 쓰면
//    학년 줄과 겹쳐 보인다(prompts.ts applyOffset 이 학년 파라미터를 그만큼 민다).
//  · 겨냥 문항은 **최대 3개 다중 선택**. 문항을 만들지 않는다 — 나중에 그 문항을
//    낼 수 있는 '걸이'만 지문에 심는다(schema.ts QUESTION_KINDS).
//  · 패널 인셋 p-2.5 → **p-4**(16px 단일 인셋) — 좌측 컬럼·컬럼 헤더와 같은 기준선.
//
// 회귀 방지 계약
//  · 라벨은 schema.ts 의 *_LABELS, 문장은 passage-authoring-glossary.ts 가 정본이다.
//    여기서 새로 짓지 않는다(화면 문구와 서버 프롬프트가 갈라지면 신뢰가 깨지고,
//    CI 게이트 ⑤가 tsx 안 한글 리터럴을 막는다).
//  · 편수를 바꾸면 크레딧 칩이 같은 프레임에서 갱신돼야 한다(결제 놀람 방지).
//    그래서 편수 팝오버는 고른 뒤에도 닫히지 않는다. 단가는 credit-costs.ts 정본.
//  · "AI가 골라요"는 **자동(AUTO)에만** — 실제로 그때만 모델이 정한다.
//  · **항목을 다시 펼친 카드로 되돌리지 말 것.** 줄이 카드가 되면 레일 높이가 세
//    배가 되고, 사용자가 요구한 "설정은 한눈에"가 깨진다.
//  · 이 패널 루트가 @container 다 — SettingRow 의 좁은 폭 분기(@max-[200px])가 이
//    컨테이너를 잰다. 떼면 좁은 호스트에서 값(크레딧 합계 포함)이 다시 잘린다.
//  · 분량 슬라이더는 **완전 커스텀**이다(트랙·채움·손잡이 전부 저작 스타일).
//    네이티브 손잡이 + 축소한 트랙의 혼합으로 되돌리지 말 것 — 그 조합이 정확히
//    오너가 "깨져 보인다"고 지적한 상태였다. 근거는 RANGE_INPUT_CLASS 주석.
// ============================================================================

import type { CSSProperties } from "react";

import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { cn } from "@/lib/utils";
import {
  EXAM_TRACKS,
  EXAM_TRACK_LABELS,
  GRADE_BANDS,
  GRADE_BAND_LABELS,
  LENGTH_PRESETS,
  LEXICAL_LEVELS,
  LEXICAL_LEVEL_LABELS,
  MAX_PASSAGES_PER_RUN,
  MAX_TARGET_QUESTION_TYPES,
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
  PASSAGE_GENRES,
  PASSAGE_GENRE_LABELS,
  PASSAGE_SKELETONS,
  PASSAGE_SKELETON_LABELS,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
  SYNTAX_LEVELS,
  SYNTAX_LEVEL_LABELS,
  TOPIC_FIELDS,
  TOPIC_FIELD_LABELS,
  type AuthoringSpec,
  type ExamTrack,
  type GradeBand,
  type LexicalLevel,
  type PassageGenre,
  type PassageSkeleton,
  type QuestionKind,
  type SyntaxLevel,
  type TopicField,
} from "@/lib/passage-authoring/schema";
// 화면 문구는 **사전 하나**에서만 온다. spec-parts 도 같은 사전을 재수출하지만,
// 용도(examTrack) 힌트처럼 사전에만 있는 항목이 섞이면 같은 성격의 문구를 두
// 경로로 가져오게 된다 — 그 표류가 정확히 이 사전이 생긴 이유다.
import {
  AUTHORING_COPY,
  EXAM_TRACK_KO_HINTS,
  GRADE_BAND_KO_HINTS,
  LEXICAL_KO_HINTS,
  PASSAGE_GENRE_KO_HINTS,
  SYNTAX_KO_HINTS,
  TOPIC_FIELD_KO_HINTS,
  describeReadingLoad,
} from "@/lib/wording/passage-authoring-glossary";
import {
  OptionList,
  SEG_OFF,
  SEG_ON,
  Segments,
  SelectionNote,
  SettingRow,
  SpecGroup,
} from "./authoring-spec-parts";
// PopoverGroupTitle(11px) 은 authoring-primitives 의 PopoverTitle(13px)로 합쳐졌다 —
// 제목이 본문(12px)보다 작아 위계가 뒤집혀 있던 자리다. 되돌리지 말 것.
import { PopoverTitle } from "./authoring-primitives";
import { DESK, FOCUS_RING } from "./authoring-tokens";

const COPY = AUTHORING_COPY.SPEC;
const CREDIT_COPY = AUTHORING_COPY.CREDIT;
const CREDIT_PER_PASSAGE = CREDIT_COSTS.PASSAGE_AUTHORING;
const COUNT_OPTIONS = Array.from({ length: MAX_PASSAGES_PER_RUN }, (_, i) => i + 1);

/**
 * 뼈대 팝오버 안 두 축의 소제목. (해소 완료) 한때 이 두 줄만 사전을 거치지 않는
 * 손코딩 한국어였다 — 사전이 그 작업 단계의 배정 밖이었기 때문이다. 지금은
 * SPEC.SPINE 이 정본이고 여기는 참조만 한다. 문자열을 되돌려 놓지 말 것.
 */
const SPINE_GENRE_TITLE = COPY.SPINE.genreTitle;
const SPINE_SKELETON_TITLE = COPY.SPINE.skeletonTitle;

/** 컬럼 헤더 우측 한 줄 요약("고2 · 165단어 · 3편"). 레일 헤더가 이걸 받는다. */
export function describeSpecSummary(spec: AuthoringSpec, count: number): string {
  return COPY.summary(GRADE_BAND_LABELS[spec.gradeBand], spec.targetWords, count);
}

/** 뼈대 줄의 값. 골격이 자동이면 갈래만 — "자동 · 자동"은 아무것도 말하지 않는다. */
function describeSpine(genre: PassageGenre, skeleton: PassageSkeleton): string {
  const genreLabel = PASSAGE_GENRE_LABELS[genre];
  if (skeleton === "AUTO") return genreLabel;
  return `${genreLabel} · ${PASSAGE_SKELETON_LABELS[skeleton]}`;
}

/** 겨냥 문항 줄의 값. 고른 게 없으면 "겨냥하지 않기". */
function describeQuestionKinds(kinds: readonly QuestionKind[]): string {
  if (kinds.length === 0) return COPY.questionKindsNone;
  return kinds.map((kind) => QUESTION_KIND_LABELS[kind]).join(" · ");
}

/** 줄에 보이는 현재 값은 항상 선택지 라벨과 **같은 문자열**이어야 한다. */
function labelOf<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * diversify(boolean)를 화면 말로 옮긴 것. "켬/끔" 스위치로 두면 무엇이 켜지는지가
 * 안 보인다 — 두 선택지를 나란히 놓고 각각 무슨 일이 일어나는지 적어 준다.
 * props 계약(boolean)은 그대로 두고 여기서만 왕복 변환한다.
 */
type TopicSpread = "DIFFERENT" | "SAME";
const TOPIC_SPREAD_OPTIONS: ReadonlyArray<{
  value: TopicSpread;
  label: string;
  hint: string;
}> = [
  {
    value: "DIFFERENT",
    label: COPY.DIVERSIFY.differentLabel,
    hint: COPY.DIVERSIFY.differentHint,
  },
  { value: "SAME", label: COPY.DIVERSIFY.sameLabel, hint: COPY.DIVERSIFY.sameHint },
];

export interface AuthoringSpecPanelProps {
  spec: AuthoringSpec;
  onChange: (patch: Partial<AuthoringSpec>) => void;
  count: number;
  onCountChange: (n: number) => void;
  diversify: boolean;
  onDiversifyChange: (v: boolean) => void;
  disabled: boolean;
}

export function AuthoringSpecPanel({
  spec,
  onChange,
  count,
  onCountChange,
  diversify,
  onDiversifyChange,
  disabled,
}: AuthoringSpecPanelProps) {
  const credits = CREDIT_PER_PASSAGE * count;

  return (
    <div className="@container min-w-0 p-4">
      <SpecGroup title={COPY.GROUP.difficulty}>
        {/* 3열이라 중등 한 줄 · 고등 한 줄로 저절로 갈린다(GRADE_BANDS 순서).
            7번째 "수능"은 행을 통째로 써서 "그 다음 단계"로 보이게 한다. */}
        <SegRow<GradeBand>
          label={COPY.ROW.gradeBand}
          hint={COPY.HINT.gradeBand}
          value={spec.gradeBand}
          note={GRADE_BAND_KO_HINTS[spec.gradeBand]}
          lastSpansRow
          disabled={disabled}
          onSelect={(gradeBand) => onChange({ gradeBand })}
          options={GRADE_BANDS.map((band) => ({
            value: band,
            label: GRADE_BAND_LABELS[band],
          }))}
        />

        <SegRow<LexicalLevel>
          label={COPY.ROW.lexical}
          hint={COPY.HINT.lexical}
          value={spec.lexical}
          note={LEXICAL_KO_HINTS[spec.lexical]}
          disabled={disabled}
          onSelect={(lexical) => onChange({ lexical })}
          options={LEXICAL_LEVELS.map((level) => ({
            value: level,
            label: LEXICAL_LEVEL_LABELS[level],
          }))}
        />

        <SegRow<SyntaxLevel>
          label={COPY.ROW.syntax}
          hint={COPY.HINT.syntax}
          value={spec.syntax}
          note={SYNTAX_KO_HINTS[spec.syntax]}
          disabled={disabled}
          onSelect={(syntax) => onChange({ syntax })}
          options={SYNTAX_LEVELS.map((level) => ({
            value: level,
            label: SYNTAX_LEVEL_LABELS[level],
          }))}
        />

        <SettingRow
          label={COPY.ROW.length}
          value={COPY.aboutWords(spec.targetWords)}
          hint={COPY.HINT.length}
          disabled={disabled}
        >
          <LengthControls
            targetWords={spec.targetWords}
            gradeBand={spec.gradeBand}
            disabled={disabled}
            onChange={(targetWords) => onChange({ targetWords })}
          />
        </SettingRow>
      </SpecGroup>

      <SpecGroup title={COPY.GROUP.content} divided>
        <SettingRow
          label={COPY.ROW.spine}
          value={describeSpine(spec.genre, spec.skeleton)}
          hint={COPY.HINT.spine}
          disabled={disabled}
        >
          <SpineControls
            genre={spec.genre}
            skeleton={spec.skeleton}
            disabled={disabled}
            onGenre={(genre) => onChange({ genre })}
            onSkeleton={(skeleton) => onChange({ skeleton })}
          />
        </SettingRow>

        <ListRow<TopicField>
          label={COPY.ROW.topicField}
          hint={COPY.HINT.topicField}
          value={spec.topicField}
          disabled={disabled}
          onSelect={(topicField) => onChange({ topicField })}
          options={TOPIC_FIELDS.map((field) => ({
            value: field,
            label: TOPIC_FIELD_LABELS[field],
            hint: TOPIC_FIELD_KO_HINTS[field],
          }))}
        />

        <SettingRow
          label={COPY.ROW.questionKinds}
          value={describeQuestionKinds(spec.targetQuestionTypes)}
          hint={COPY.HINT.questionKinds}
          disabled={disabled}
        >
          <QuestionKindPicker
            value={spec.targetQuestionTypes}
            disabled={disabled}
            onChange={(targetQuestionTypes) => onChange({ targetQuestionTypes })}
          />
        </SettingRow>
      </SpecGroup>

      {/* 용도 한 줄만으로 묶음을 따로 두는 이유: 이 축은 프롬프트 블록 하나를 통째로
          갈아 끼운다(수능형은 낯선 소재로 밀도를, 내신은 배운 어휘를 다시 쓴다).
          내용 묶음에 섞으면 "소재 고르는 김에 같이 고르는 값"으로 읽혀 기본값 그대로
          나간다. */}
      <SpecGroup title={COPY.GROUP.usage} divided>
        <ListRow<ExamTrack>
          label={COPY.ROW.examTrack}
          hint={COPY.HINT.examTrack}
          value={spec.examTrack}
          disabled={disabled}
          onSelect={(examTrack) => onChange({ examTrack })}
          options={EXAM_TRACKS.map((track) => ({
            value: track,
            label: EXAM_TRACK_LABELS[track],
            hint: EXAM_TRACK_KO_HINTS[track],
          }))}
        />
      </SpecGroup>

      <SpecGroup title={COPY.GROUP.quantity} divided>
        {/* 돈이 걸린 유일한 줄이라 합계를 줄에까지 내놓는다(valueNote). */}
        <SettingRow
          label={COPY.ROW.count}
          value={COPY.passages(count)}
          valueNote={CREDIT_COPY.total(credits)}
          hint={COPY.HINT.count}
          disabled={disabled}
        >
          {/* 3열 2행. 6열로 늘어놓으면 좁은 레일에서 버튼 하나가 42px 까지 쪼그라들어
              숫자를 겨냥해 누르기 어렵다(3열이면 약 88px). */}
          <Segments<string>
            ariaLabel={COPY.ROW.count}
            columns={3}
            value={String(count)}
            disabled={disabled}
            onSelect={(next) => onCountChange(Number(next))}
            options={COUNT_OPTIONS.map((n) => ({
              value: String(n),
              label: String(n),
            }))}
          />
          {/* count 는 상위 상태라 숫자를 누른 그 렌더에서 합계가 함께 바뀐다.
              다른 프레임에 나타나면 "눌렀는데 얼마가 됐지?"가 된다. */}
          <SelectionNote>
            <span className="font-bold text-slate-800">{COPY.passages(count)}</span>
            {" · "}
            {CREDIT_COPY.perPassage(CREDIT_PER_PASSAGE)}
            {" · "}
            <CreditCostChip
              amount={credits}
              className={cn(
                DESK.meta,
                "h-6 rounded-full bg-blue-50 px-2 align-middle text-blue-700 ring-1 ring-blue-100",
              )}
            />
            <br />
            {CREDIT_COPY.refundHint}
          </SelectionNote>
        </SettingRow>

        {/* 편수가 1이면 "서로 다른 소재"라는 개념 자체가 성립하지 않는다. */}
        {count >= 2 ? (
          <ListRow<TopicSpread>
            label={COPY.ROW.diversify}
            hint={COPY.HINT.diversify}
            value={diversify ? "DIFFERENT" : "SAME"}
            disabled={disabled}
            onSelect={(next) => onDiversifyChange(next === "DIFFERENT")}
            options={TOPIC_SPREAD_OPTIONS}
          />
        ) : null}
      </SpecGroup>
    </div>
  );
}

// ── 줄 두 종 ────────────────────────────────────────────────────────────────
// 같은 모양의 줄을 열 번 손으로 쓰면 그중 하나만 ariaLabel 이 빠지거나 값 표기가
// 어긋난다(실제로 그렇게 갈라져 있었다). 줄의 골격은 이 두 개가 전부다.

/** 세그먼트 줄 — 짧은 라벨 3~7개짜리 축(학년·단어·문장). note 는 팝오버 안 되먹임. */
function SegRow<T extends string>({
  label,
  hint,
  value,
  options,
  note,
  disabled,
  onSelect,
  lastSpansRow,
}: {
  label: string;
  hint: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  note: string;
  disabled: boolean;
  onSelect: (value: T) => void;
  lastSpansRow?: boolean;
}) {
  return (
    <SettingRow
      label={label}
      value={labelOf(options, value)}
      hint={hint}
      disabled={disabled}
    >
      <Segments<T>
        ariaLabel={label}
        columns={3}
        lastSpansRow={lastSpansRow}
        value={value}
        options={options}
        disabled={disabled}
        onSelect={onSelect}
      />
      <SelectionNote>{note}</SelectionNote>
    </SettingRow>
  );
}

/** 목록 줄 — 라벨만 봐선 뭐가 나올지 모르는 축(소재·용도·여러 편 소재). */
function ListRow<T extends string>({
  label,
  hint,
  value,
  options,
  disabled,
  onSelect,
}: {
  label: string;
  hint: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  disabled: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <SettingRow
      label={label}
      value={labelOf(options, value)}
      hint={hint}
      disabled={disabled}
    >
      <OptionList<T>
        ariaLabel={label}
        value={value}
        options={options}
        disabled={disabled}
        onSelect={onSelect}
      />
    </SettingRow>
  );
}

// ── 팝오버 내용물 셋 ────────────────────────────────────────────────────────

// ── 분량 슬라이더 기하 ──────────────────────────────────────────────────────
// 세 수치가 서로 물려 있다.
//   트랙 두께 4px  (클래스 h-1 · 보이는 막대. 히트박스 h-9/36px 와는 별개)
//   손잡이 지름 16px (클래스 size-4 = RANGE_THUMB_PX)
//   webkit 손잡이 margin-top = (4 − 16) / 2 = **-6px** (클래스 mt-[-6px])
// `::-webkit-slider-thumb` 는 트랙 **상단**에 얹히므로 저 margin 이 없으면 손잡이가
// 트랙 위로 떠 버린다. 반대로 moz 손잡이는 자동으로 트랙 중앙에 놓이므로 같은
// margin 을 주면 오히려 6px 어긋난다 — moz 쪽에는 주지 않는다.
// 셋 중 하나라도 바꾸면 RANGE_INPUT_CLASS 의 리터럴 세 개를 같이 고친다.
//
// 실측(Chromium 147 · Firefox 148, 폭 260px 입력을 4배율로 렌더해 픽셀로 잼):
//   채움 구간 두께 4.00px / 잔여 구간 두께 4.00px  ← 오너가 본 두께 차가 사라진 지점
//   트랙 중심 y 18.00px / 손잡이 중심 y 18.00px (상자 36px 의 정중앙), 손잡이 높이 16px
// 두 엔진의 수치가 같다. 이 값이 어긋나면 그 자리가 다시 "깨진 바"다.

/** 손잡이 지름(px). 클래스 size-4 와 채움 끝 보정 calc 가 이 값을 공유한다. */
const RANGE_THUMB_PX = 16;

/**
 * 분량 슬라이더의 저작 스타일 전량.
 *
 * 왜 완전 커스텀인가(구 구현 회귀 방지):
 *   예전에는 트랙 높이만 4px 로 줄이고 손잡이와 채움은 네이티브(accent-color)에
 *   맡겼다. 그러면 벤더가 그리는 **채움 막대는 자기 기본 두께 그대로**라 남은
 *   회색 구간(4px)보다 두껍게 나오고, 손잡이도 자기 기본 크기라 4px 트랙 위에
 *   얹히지 않는다. 오너가 본 "깨진 바"가 이 상태다. accent-color 는 appearance
 *   가 native 일 때만 유효하므로, 트랙을 저작 스타일로 만지는 순간 두 축을 같은
 *   좌표계에 둘 방법이 없다 → 트랙·채움·손잡이를 전부 저작 스타일로 가져온다.
 *
 * 채움을 그리는 방법이 브라우저마다 다르다:
 *   · Firefox 에는 `::-moz-range-progress` 가 있다 → 트랙과 **같은 h-1·같은
 *     rounded-full** 로 지정한다(높이가 같아야 두께 차가 안 생긴다).
 *   · Chrome/Safari 에는 progress 의사요소가 없다 → 트랙 자체를 두 색 하드스톱
 *     linear-gradient 로 칠한다. 채움과 트랙이 **물리적으로 같은 상자**라 두께가
 *     어긋날 수가 없다. 경계 위치만 인라인 CSS 변수(--desk-range-fill)로 준다.
 *     색은 인라인에 넣지 않는다 — 팔레트를 벗어난 하드코딩이 생기지 않도록
 *     var(--color-*) 를 가리키는 유틸리티로 승격해 두고 변수만 참조한다.
 *
 * 히트박스는 h-9(36px) 그대로다. 얇아진 것은 '보이는 트랙'뿐이다.
 */
const RANGE_INPUT_CLASS = [
  // 상자 = 히트박스. appearance-none 이 벤더 기본 렌더링을 통째로 걷어낸다.
  "mt-2 block h-9 w-full cursor-pointer appearance-none rounded-md bg-transparent",
  "disabled:cursor-not-allowed",
  // 채움/잔여 색은 **이 두 변수가 전부**다. 의사요소는 부모의 사용자 지정 속성을
  // 상속받으므로 여기서 한 번 정하면 webkit 그라디언트도 moz 의사요소도 같은 값을
  // 본다 — 아래 벤더 규칙에는 팔레트 이름이 한 번도 다시 나오지 않는다.
  // 그래서 disabled 도 **여기 두 줄뿐**이다(벤더별 disabled 규칙 4개를 두면 한쪽만
  // 고치는 표류가 생긴다 — 실제로 그 상태였다).
  "[--desk-range-on:var(--color-blue-600)] [--desk-range-off:var(--color-slate-200)]",
  "disabled:[--desk-range-on:var(--color-slate-300)] disabled:[--desk-range-off:var(--color-slate-100)]",
  // webkit 트랙 = 트랙 + 채움(하드스톱 그라디언트) 겸용.
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full",
  "[&::-webkit-slider-runnable-track]:[background-image:linear-gradient(to_right,var(--desk-range-on)_0,var(--desk-range-on)_var(--desk-range-fill),var(--desk-range-off)_var(--desk-range-fill))]",
  // webkit 손잡이 — mt-[-6px] 가 위 기하 주석의 (트랙 4 − 손잡이 16) / 2 다.
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:box-border [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:size-4",
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[color:var(--desk-range-on)] [&::-webkit-slider-thumb]:bg-white",
  // moz 트랙·채움 — 두 상자가 같은 높이·같은 radius 여야 단차가 안 보인다.
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-none [&::-moz-range-track]:bg-[color:var(--desk-range-off)]",
  "[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:border-none [&::-moz-range-progress]:bg-[color:var(--desk-range-on)]",
  // moz 손잡이 — margin 없음(자동 중앙정렬). 측정: 트랙 중심 y=18.0 / 손잡이 중심 y=18.0.
  "[&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[color:var(--desk-range-on)] [&::-moz-range-thumb]:bg-white",
].join(" ");

/**
 * webkit 채움의 경계 좌표. 손잡이 **중심**은 0%가 아니라 손잡이 반지름에서
 * 출발해 (100% − 손잡이지름) 만큼만 이동한다. 그래서 단순 `${ratio}%` 로 칠하면
 * 양 끝에서 채움 끝과 손잡이 중심이 최대 8px 어긋난다.
 *
 * moz 에는 넘기지 않는다 — 진행 의사요소가 자기 좌표계를 쓰기 때문이다. 실측하면
 * 25%·50% 지점에서 두 엔진의 채움 끝이 0.4px 안쪽으로 일치하고, 양 끝에서만
 * Firefox 가 8px 더/덜 칠한다(min=0px, max=폭 전체). 그 8px 은 정확히 손잡이
 * 반지름이라 **손잡이 밑에 가려** 어느 쪽도 화면에 드러나지 않는다.
 */
function rangeFillEdge(targetWords: number): string {
  const span = MAX_TARGET_WORDS - MIN_TARGET_WORDS;
  const raw = span === 0 ? 0 : (targetWords - MIN_TARGET_WORDS) / span;
  const ratio = Math.min(1, Math.max(0, raw));
  return `calc(${ratio.toFixed(4)} * (100% - ${RANGE_THUMB_PX}px) + ${RANGE_THUMB_PX / 2}px)`;
}

/**
 * 분량 — 조작 방식이 다른 두 컨트롤이 한 팝오버에 있다(누르는 칩 / 끄는 막대).
 * 소제목과 선으로 갈라 놓지 않으면 한 덩어리로 읽혀 어느 쪽 설명인지 대응이 안 된다.
 */
function LengthControls({
  targetWords,
  gradeBand,
  disabled,
  onChange,
}: {
  targetWords: number;
  gradeBand: GradeBand;
  disabled: boolean;
  onChange: (words: number) => void;
}) {
  // 지금 분량이 프리셋과 정확히 겹칠 때만 그 프리셋의 쓰임새를 같이 알려 준다.
  const activePreset = LENGTH_PRESETS.find((preset) => preset.words === targetWords);

  return (
    <>
      <PopoverTitle>{COPY.lengthPresetTitle}</PopoverTitle>
      <div className="mt-2 flex flex-wrap gap-2">
        {LENGTH_PRESETS.map((preset) => {
          const active = targetWords === preset.words;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.words)}
              disabled={disabled}
              aria-pressed={active}
              title={preset.hint}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center rounded-full border px-2 whitespace-nowrap transition-colors",
                DESK.body,
                FOCUS_RING,
                "disabled:cursor-not-allowed disabled:opacity-50",
                active ? SEG_ON : SEG_OFF,
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <PopoverTitle>{COPY.lengthCustomTitle}</PopoverTitle>
        {/* range 는 h-* 가 트랙이 아니라 **입력 상자 전체**를 잡는다. 트랙 높이로 두면
            히트박스가 4px 뿐이라 마우스로도 자주 빗나간다(프리셋 칩으로는 못 가는
            중간 분량이 이 슬라이더에만 있다). → 상자는 h-9 그대로 두고, 얇아지는 것은
            보이는 트랙뿐이다. 트랙·채움·손잡이 전량 저작 스타일 — 근거는
            RANGE_INPUT_CLASS 주석. 인라인 스타일은 채움 경계 **좌표 하나**만 나른다
            (색은 팔레트 변수로 승격돼 있어 여기 하드코딩이 생기지 않는다). */}
        <input
          type="range"
          min={MIN_TARGET_WORDS}
          max={MAX_TARGET_WORDS}
          step={10}
          value={targetWords}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={AUTHORING_COPY.A11Y.targetWords}
          aria-valuetext={COPY.words(targetWords)}
          style={
            { "--desk-range-fill": rangeFillEdge(targetWords) } as CSSProperties
          }
          className={cn(RANGE_INPUT_CLASS, FOCUS_RING)}
        />
        {/* 막대의 양 끝이 몇 단어인지 — 없으면 "어디까지 가는 물건"인지 알 수 없다.
            조작에 필요한 정보라 힌트보다 진한 slate-600(7.56:1)이다. */}
        <div
          className={cn(
            DESK.meta,
            "flex items-center justify-between tabular-nums text-slate-600",
          )}
        >
          <span>{COPY.words(MIN_TARGET_WORDS)}</span>
          <span>{COPY.words(MAX_TARGET_WORDS)}</span>
        </div>
      </div>

      <SelectionNote>
        <span className="font-bold text-slate-800">{COPY.words(targetWords)}</span>
        {activePreset ? ` · ${activePreset.hint}` : ""}
        <br />
        {describeReadingLoad(targetWords, gradeBand)}
      </SelectionNote>
    </>
  );
}

/**
 * 뼈대 — 갈래(무슨 종류의 글인가)와 골격(논지가 어떤 순서로 꺾이는가)이 한 팝오버에
 * 산다. 골격에는 부연을 붙이지 않는다 — 라벨 자체가 이미 "통념 → 반박 → 재정의"
 * 같은 순서 문장이라, 설명을 한 줄 더 붙이면 13줄 목록이 26줄이 되어 팝오버 스크롤만
 * 길어진다.
 */
function SpineControls({
  genre,
  skeleton,
  disabled,
  onGenre,
  onSkeleton,
}: {
  genre: PassageGenre;
  skeleton: PassageSkeleton;
  disabled: boolean;
  onGenre: (genre: PassageGenre) => void;
  onSkeleton: (skeleton: PassageSkeleton) => void;
}) {
  return (
    <>
      <PopoverTitle>{SPINE_GENRE_TITLE}</PopoverTitle>
      <div className="mt-2">
        <OptionList<PassageGenre>
          ariaLabel={SPINE_GENRE_TITLE}
          value={genre}
          disabled={disabled}
          onSelect={onGenre}
          options={PASSAGE_GENRES.map((value) => ({
            value,
            label: PASSAGE_GENRE_LABELS[value],
            hint: PASSAGE_GENRE_KO_HINTS[value],
          }))}
        />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <PopoverTitle>{SPINE_SKELETON_TITLE}</PopoverTitle>
        <div className="mt-2">
          <OptionList<PassageSkeleton>
            ariaLabel={SPINE_SKELETON_TITLE}
            value={skeleton}
            disabled={disabled}
            onSelect={onSkeleton}
            options={PASSAGE_SKELETONS.map((value) => ({
              value,
              label: PASSAGE_SKELETON_LABELS[value],
            }))}
          />
        </div>
      </div>
    </>
  );
}

/**
 * 겨냥 문항 — 이 패널의 **유일한 다중 선택**(최대 3개). 상한을 넘기면 안 고른 항목이
 * 눌리지 않고, 그 이유는 아래 안내 한 줄이 말한다(상충하는 배치 요구는 한 편에 다
 * 담기지 않는다 — schema.ts). 첫 칸 '겨냥하지 않기'는 다른 축의 '자동'과 같은
 * 자리라서, "고르지 않아도 된다"가 먼저 읽힌다.
 */
function QuestionKindPicker({
  value,
  disabled,
  onChange,
}: {
  value: readonly QuestionKind[];
  disabled: boolean;
  onChange: (next: QuestionKind[]) => void;
}) {
  const atMax = value.length >= MAX_TARGET_QUESTION_TYPES;
  const toggle = (kind: QuestionKind) => {
    if (value.includes(kind)) {
      onChange(value.filter((item) => item !== kind));
      return;
    }
    if (atMax) return;
    onChange([...value, kind]);
  };

  // 세그먼트와 같은 골격(min-h-9 · break-keep · 채운 파랑). 다중 선택이라 Segments
  // 컴포넌트를 쓸 수 없을 뿐, 손에 잡히는 모양은 같아야 한다.
  const cell =
    "inline-flex min-h-9 cursor-pointer items-center justify-center break-keep rounded-md border px-2 text-center leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      <div
        role="group"
        aria-label={COPY.ROW.questionKinds}
        className="grid grid-cols-2 gap-2"
      >
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={disabled}
          aria-pressed={value.length === 0}
          className={cn(
            cell,
            "col-span-2",
            DESK.body,
            FOCUS_RING,
            value.length === 0 ? SEG_ON : SEG_OFF,
          )}
        >
          {COPY.questionKindsNone}
        </button>

        {QUESTION_KINDS.map((kind) => {
          const active = value.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              // 상한에 닿으면 **안 고른 것만** 잠근다 — 고른 것은 눌러서 뺄 수 있어야
              // 다른 유형으로 갈아탈 수 있다.
              disabled={disabled || (!active && atMax)}
              aria-pressed={active}
              className={cn(cell, DESK.body, FOCUS_RING, active ? SEG_ON : SEG_OFF)}
            >
              {QUESTION_KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      <SelectionNote>
        <span className="font-bold text-slate-800">
          {describeQuestionKinds(value)}
        </span>
        <br />
        {COPY.questionKindsMax}
      </SelectionNote>
    </>
  );
}
