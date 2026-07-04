// ============================================================================
// KO 공통 봉투 zod 스키마 (KO-DESIGN-SPEC §3) — 모든 유형 스키마의 베이스
// ============================================================================
// 유형 모듈은 koQuestionEnvelope(...) 로 봉투를 만들고 유형 특화 필드를 extend
// 한다. 지문 전문 복사 필드는 두지 않는다(마킹지문은 렌더타임 재구성).
// ============================================================================

import { z } from "zod";
import { KO_STIMULUS_KINDS } from "../core/render-model";

export const koEvidenceSchema = z.object({
  optionLabel: z
    .string()
    .describe("근거가 뒷받침/반박하는 선지 라벨(①~⑤). 발문·서술형 근거면 생략")
    .optional(),
  spanText: z
    .string()
    .min(4)
    .describe("지문에서 그대로 복사한 근거 구절 (verbatim — 변형·요약 금지, 8~60자 권장)"),
  relation: z
    .enum(["SUPPORTS", "CONTRADICTS", "NOT_MENTIONED", "DISTORTS"])
    .describe(
      "근거와 선지의 관계: SUPPORTS=선지를 지지, CONTRADICTS=선지와 모순(오답 근거), NOT_MENTIONED=지문에 없는 내용임을 표시(spanText는 가장 가까운 관련 구절), DISTORTS=지문 내용의 왜곡",
    ),
  note: z.string().describe("근거-선지 관계 한 줄 설명 (한국어)").optional(),
});

export const koMarkerSchema = z.object({
  family: z
    .enum(["KOR_CIRCLED", "LATIN_CIRCLED", "RANGE_BRACKET"])
    .describe("㉠계열=KOR_CIRCLED(구절·문장), ⓐ계열=LATIN_CIRCLED(단어·시어), [A]계열=RANGE_BRACKET(행 범위 블록)"),
  label: z.string().describe("㉠/㉡/… 또는 ⓐ/ⓑ/… 또는 [A]/[B] — 순서대로"),
  spanText: z
    .string()
    .min(1)
    .describe("지문에서 그대로 복사한 마킹 대상 (verbatim — 한 글자도 바꾸지 말 것)"),
  occurrenceIndex: z
    .number()
    .int()
    .min(0)
    .describe("같은 표현이 지문에 여러 번 나올 때 0부터 세는 n번째 지정. 유일하면 0")
    .optional(),
  surroundingText: z
    .string()
    .describe("spanText 앞뒤를 포함한 20자 이상의 지문 원문 문맥 (위치 확증용)")
    .optional(),
  targetSurface: z
    .enum(["passage", "stimulus"])
    .describe(
      "마킹 대상 표면 — 생략 시 'passage'(지문). 'stimulus'=자체자료(koStimulus)의 행 내부를 마킹(화법 발화·작문 초고 문장 등). spanText 는 해당 표면에서 verbatim 이어야 함",
    )
    .optional(),
});

export const koBogiSchema = z.object({
  label: z
    .enum(["보기", "보기 1", "보기 2", "자료", "학습 활동"])
    .describe("박스 라벨 — 일반적으로 '보기'"),
  lines: z
    .array(z.string())
    .min(1)
    .describe("보기 내용 행 배열. 항목 나열은 'ㄱ. …' 형식, 화자는 '학생 1: …' 형식"),
});

export const koFootnoteSchema = z.object({
  term: z.string().describe("각주 대상 어휘 (지문에 * 표시될 단어)"),
  gloss: z.string().describe("뜻풀이 (간결한 한국어)"),
});

/**
 * 자체 생성 자료(stimulus) 블록 — 화법(발표문·대화·토론)·작문(초고·계획)·
 * 매체(화면 구성)·국어사(중세 자료) 유형이 지문 대신/과 함께 문항에 동봉한다
 * (수능 35~45번 구조). 행(lines 원소)이 관행의 최소 의미 단위 — 렌더는 행을
 * 병합하지 않는다.
 */
export const koStimulusBlockSchema = z.object({
  kind: z
    .enum(KO_STIMULUS_KINDS)
    .describe(
      "자료 갈래: SPEECH_SCRIPT=발표문, DIALOGUE=대화·대담·면접, DEBATE=토론(입론·반대 신문·반론), DRAFT=학생 초고, PLAN_NOTE=글쓰기 계획·메모, MEDIA_SCREEN=매체 화면 구성(텍스트 목업), ARCHAIC_TEXT=중세 국어 자료",
    ),
  label: z
    .string()
    .describe("복수 자료 병기·발문 지시용 라벨 — '(가)', '(나)', '[자료]' 등 (필요시)")
    .optional(),
  title: z
    .string()
    .describe("자료 표제 — 발표 제목·초고 제목·화면 이름 등 (필요시)")
    .optional(),
  lines: z
    .array(z.string())
    .min(1)
    .describe(
      "자료 본문 행 배열 — 관행 표기를 행 단위로 보존: 화자 라벨 '학생 1: …', 괄호 지시문 '(자료를 가리키며)', 장면 번호 'S#1', 중세 자료는 원문 행 바로 다음에 '[현대어 풀이] …' 행 쌍. 옛한글 조합 글리프(아래아·첫가끝) 대신 현대어 전사 권장",
    ),
  footnotes: z.array(koFootnoteSchema).describe("자료 하단 각주 (필요시)").optional(),
});

export const koWrongOptionExplanationSchema = z.object({
  label: z.string().describe("오답 선지 라벨 (①~⑤)"),
  explanation: z
    .string()
    .describe("이 오답이 매력적으로 보이는 이유 + 틀렸음을 결정하는 지문 근거 (1~2문장, 한국어)"),
});

export const koEssaySchema = z.object({
  conditions: z
    .array(z.string())
    .min(1)
    .describe("<조건> 항목들 — '~할 것' 명사형 종결 (내용 조건 + 형식 조건)"),
  answerSheet: z.object({
    model: z.string().describe("모범답안 (조건을 전부 충족하는 완성 답안)"),
    accepted: z.array(z.string()).describe("인정답안 (표현 차이 허용 범위)").optional(),
    rubric: z
      .array(
        z.object({
          item: z.string().describe("채점 항목 (조건과 1:1 이상 대응)"),
          points: z.number().describe("배점"),
        }),
      )
      .min(1)
      .describe("채점기준표 — conditions 의 모든 항목이 최소 1개 채점 항목에 반영되어야 함"),
  }),
});

/** 공통 봉투. answerFormat 별 필수 필드는 유형 스키마에서 강제한다. */
export function koQuestionEnvelope<T extends z.ZodRawShape>(extension: T) {
  return z.object({
    direction: z
      .string()
      .describe(
        "발문 — 반드시 '~것은?' 종결. 긍정발문은 '가장 적절한 것은?', 부정발문은 '적절하지 않은 것은?' 계열. 밑줄·[3점] 마크업은 넣지 말 것(시스템 처리)",
      ),
    options: z
      .array(z.object({ label: z.string().describe("① ② ③ ④ ⑤"), text: z.string() }))
      .length(5)
      .describe("5지선다 선지 — 객관식만. 어미·길이·추상 수준 평행 유지")
      .optional(),
    correctAnswer: z
      .string()
      .describe("객관식: 정답 라벨(예: ③). 단답/서술형: 정답 텍스트"),
    explanation: z
      .string()
      .describe("해설 3~5문장 (한국어) — 지문 근거 문장을 직접 인용하며 정답 도출 과정을 서술"),
    wrongOptionExplanations: z
      .array(koWrongOptionExplanationSchema)
      .describe("객관식 필수 — 오답 선지마다 정확히 1개(4개)")
      .optional(),
    evidence: z
      .array(koEvidenceSchema)
      .min(1)
      .describe("근거앵커 — 객관식은 모든 선지(①~⑤)에 각 1개 이상. 근거 없는 선지는 금지"),
    bogi: koBogiSchema.optional(),
    koStimulus: z
      .array(koStimulusBlockSchema)
      .min(1)
      .describe(
        "자체 생성 자료 — 지문이 아니라 문항에 동봉하는 자료(화법·작문·매체·국어사 유형만). 복수 자료는 label '(가)'/'(나)' 로 구분",
      )
      .optional(),
    markers: z
      .array(koMarkerSchema)
      .describe("지문/자료 내 마킹 (해당 유형만) — targetSurface 생략 시 지문 마킹")
      .optional(),
    footnotes: z.array(koFootnoteSchema).describe("어려운 어휘 각주 (필요시)").optional(),
    essay: koEssaySchema.optional(),
    points: z.number().int().min(2).max(10).describe("배점 — 유형 기본값과 다르게 줄 때만").optional(),
    sourceLine: z
      .string()
      .describe('문학 출처 표기 "- 작가, 「작품」 -" (지문에 출처 정보가 있을 때만)')
      .optional(),
    keyPoints: z.array(z.string()).length(3).describe("핵심 학습 포인트 3개 (한국어)"),
    tags: z.array(z.string()).describe("유형·성취기준·소재 태그 (한국어)"),
    difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
    ...extension,
  });
}

export type KoQuestionEnvelope = z.infer<ReturnType<typeof koQuestionEnvelope<Record<string, never>>>>;

/** 5지선다 봉투 — options·wrongOptionExplanations·correctAnswer 라벨을 필수 강제. */
export function koMc5Envelope<T extends z.ZodRawShape>(extension: T) {
  return koQuestionEnvelope({
    options: z
      .array(z.object({ label: z.enum(["①", "②", "③", "④", "⑤"]), text: z.string().min(1) }))
      .length(5)
      .describe("5지선다 선지 — 라벨 ①~⑤ 순서 고정, 어미·길이·추상 수준 평행"),
    correctAnswer: z.enum(["①", "②", "③", "④", "⑤"]).describe("정답 라벨"),
    wrongOptionExplanations: z
      .array(koWrongOptionExplanationSchema)
      .length(4)
      .describe("오답 4개 각각 정확히 1개 — 매력 이유 + 배제를 결정하는 지문 근거"),
    ...extension,
  });
}
