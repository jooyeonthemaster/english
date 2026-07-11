/**
 * 2027 수능완성 독서 데이터의 Sonnet full-v2 생성·fresh-eyes 전수 감사.
 *
 * - 18개 문제 세트의 통합 21필드 분석을 원문·85문항만으로 모두 새로 생성한다.
 * - (가)/(나) 복합 5세트는 10개 부분 지문을 각각 별도 분석한다.
 * - 검색된 기출 후보를 실제 양쪽 원문의 축자 evidence로 대조해 keep/drop을 판정하고,
 *   근거·차이·학습 포인트·복합 지문 sourceParts를 모두 새로 작성한다.
 * - 모든 중간 결과가 성공한 뒤에만 최종 JSON을 원자적으로 병합한다.
 *
 * 실행:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/audit-suneung-wanseong-sonnet.ts
 *   ... --resume --concurrency=2
 *   ... --only=SW2027_DS_R1_Q01-03 --no-merge
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";

type JsonRecord = Record<string, unknown>;

interface Analysis extends JsonRecord {
  갈래: string;
  세부영역: string;
  제재: string;
  핵심주제: string;
  요약: string;
  핵심개념: { 용어: string; 정의: string }[];
  핵심키워드: string[];
  고유명사_인물_이론: string[];
  논지전개구조: string;
  서술방식: string[];
  정보구조유형: string;
  배경지식영역: string;
  난이도: string;
  난이도근거: string;
  딸린문항유형: { 번호: number; 유형: string }[];
  출제의도: string;
  오답함정유형: string;
  연계배경지식: string[];
  상호텍스트: string | null;
  핵심문장: string[];
  추출품질: string;
}

interface SwPart extends JsonRecord {
  label: string;
  text: string;
  analysis?: Analysis;
}

interface SwPassage extends JsonRecord {
  id: string;
  roundNo: number;
  qFrom: number;
  qTo: number;
  subGenre: string | null;
  jaejae: string | null;
  difficulty: string | null;
  isPaired: boolean;
  parts: SwPart[];
  passageText: string;
  nProblems: number;
  analysis: Analysis;
  linkCount: number;
}

interface ExamPassage extends JsonRecord {
  id: string;
  board: string;
  grade: string;
  year: number;
  siheng: string;
  qFrom: number;
  qTo: number;
  title: string;
  subGenre: string | null;
  jaejae: string | null;
  passageText: string;
  analysis: Analysis | null;
}

type RelationType =
  | "주제"
  | "제재"
  | "핵심개념"
  | "논지구조"
  | "배경지식"
  | "출제유형"
  | "관점대립";

interface SwLink extends JsonRecord {
  examPassageId: string;
  strength: "강" | "중" | "약";
  retrievalScore: number;
  relationTypes: RelationType[];
  sourceParts?: string[];
  sharedConcepts: string[];
  sharedKeywords: string[];
  conceptMappings: { swTerm: string; examTerm: string; relationship: string }[];
  swEvidence: string[];
  examEvidence: string[];
  rationale: string;
  difference: string;
  studyPoint: string;
}

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "src", "data", "suneung-wanseong");
const PASSAGES_PATH = path.join(DATA_DIR, "passages.json");
const PROBLEMS_PATH = path.join(DATA_DIR, "problems.json");
const LINKS_PATH = path.join(DATA_DIR, "links.json");
const FACETS_PATH = path.join(DATA_DIR, "facets.json");
const PROVENANCE_PATH = path.join(DATA_DIR, "provenance.json");
const LINK_AUDIT_PATH = path.join(DATA_DIR, "link-audit.json");
const EXAMS_PATH = path.join(ROOT, "src", "data", "exam-passages-korean", "passages.json");
const AUDIT_VERSION = "full-v2";
const ANALYSIS_PROMPT_VERSION = "analysis-v4-split-reviewed";
const LINK_PROMPT_VERSION = "links-v7";
const TMP_DIR = path.join(ROOT, "tmp", `suneung-wanseong-sonnet-${AUDIT_VERSION}`);

const SOURCE_SHA256 = "3e955d5613835752f86044ce10343396107b14d5b9158b36460ae81da6532af9";
const MODEL = stripQuotes(
  process.env.OPENROUTER_PREMIUM_MODEL ??
    process.env.ATLASCLOUD_PREMIUM_MODEL ??
    process.env.ATLASCLOUD_CLAUDE_SONNET_MODEL ??
    "anthropic/claude-sonnet-5",
);

const cli = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, ...value] = raw.replace(/^--/, "").split("=");
    return [key, value.length ? value.join("=") : "true"];
  }),
);
const RESUME = cli.has("resume");
const NO_MERGE = cli.has("no-merge");
const CONCURRENCY = clamp(Number(cli.get("concurrency") ?? 2), 1, 3);
const ONLY = new Set(
  (cli.get("only") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const pageMap: Record<
  string,
  { pdfPageFrom: number; pdfPageTo: number; printPageFrom: number; printPageTo: number }
> = {
  SW2027_DS_R1_Q01_03: { pdfPageFrom: 1, pdfPageTo: 2, printPageFrom: 134, printPageTo: 135 },
  SW2027_DS_R1_Q04_07: { pdfPageFrom: 2, pdfPageTo: 4, printPageFrom: 135, printPageTo: 137 },
  SW2027_DS_R1_Q08_13: { pdfPageFrom: 5, pdfPageTo: 7, printPageFrom: 138, printPageTo: 140 },
  SW2027_DS_R1_Q14_17: { pdfPageFrom: 8, pdfPageTo: 9, printPageFrom: 141, printPageTo: 142 },
  SW2027_DS_R2_Q01_05: { pdfPageFrom: 10, pdfPageTo: 12, printPageFrom: 160, printPageTo: 162 },
  SW2027_DS_R2_Q06_11: { pdfPageFrom: 12, pdfPageTo: 14, printPageFrom: 162, printPageTo: 164 },
  SW2027_DS_R2_Q12_17: { pdfPageFrom: 14, pdfPageTo: 16, printPageFrom: 164, printPageTo: 166 },
  SW2027_DS_R3_Q01_03: { pdfPageFrom: 17, pdfPageTo: 18, printPageFrom: 186, printPageTo: 187 },
  SW2027_DS_R3_Q04_09: { pdfPageFrom: 18, pdfPageTo: 20, printPageFrom: 187, printPageTo: 189 },
  SW2027_DS_R3_Q10_13: { pdfPageFrom: 21, pdfPageTo: 22, printPageFrom: 190, printPageTo: 191 },
  SW2027_DS_R3_Q14_17: { pdfPageFrom: 23, pdfPageTo: 24, printPageFrom: 192, printPageTo: 193 },
  SW2027_DS_R4_Q01_06: { pdfPageFrom: 25, pdfPageTo: 27, printPageFrom: 212, printPageTo: 214 },
  SW2027_DS_R4_Q07_12: { pdfPageFrom: 27, pdfPageTo: 30, printPageFrom: 214, printPageTo: 217 },
  SW2027_DS_R4_Q13_17: { pdfPageFrom: 30, pdfPageTo: 32, printPageFrom: 217, printPageTo: 219 },
  SW2027_DS_R5_Q01_03: { pdfPageFrom: 33, pdfPageTo: 34, printPageFrom: 238, printPageTo: 239 },
  SW2027_DS_R5_Q04_07: { pdfPageFrom: 34, pdfPageTo: 36, printPageFrom: 239, printPageTo: 241 },
  SW2027_DS_R5_Q08_11: { pdfPageFrom: 36, pdfPageTo: 38, printPageFrom: 241, printPageTo: 243 },
  SW2027_DS_R5_Q12_17: { pdfPageFrom: 38, pdfPageTo: 41, printPageFrom: 243, printPageTo: 246 },
};

const conceptSchema = z.object({ 용어: z.string().min(1), 정의: z.string().min(1) });
const analysisSchema = z.object({
  갈래: z.string().min(1),
  세부영역: z.string().min(1),
  제재: z.string().min(1),
  핵심주제: z.string().min(2),
  요약: z.string().min(10),
  핵심개념: z.array(conceptSchema).min(1).max(16),
  핵심키워드: z.array(z.string().min(1)).min(5).max(28),
  고유명사_인물_이론: z.array(z.string().min(1)).max(24),
  논지전개구조: z.string().min(5),
  서술방식: z.array(z.string().min(1)).min(1).max(12),
  정보구조유형: z.string().min(1),
  배경지식영역: z.string().min(1),
  난이도: z.enum(["상", "중", "하"]),
  난이도근거: z.string().min(5),
  딸린문항유형: z.array(
    z.object({ 번호: z.number().int().positive(), 유형: z.string().min(1) }),
  ),
  출제의도: z.string().min(5),
  오답함정유형: z.string().min(5),
  연계배경지식: z.array(z.string().min(1)).min(1).max(20),
  상호텍스트: z.string().min(1).nullable(),
  핵심문장: z.array(z.string().min(3)).min(2).max(10),
  추출품질: z.enum(["good", "leaked", "truncated", "broken"]),
});

const contentAnalysisSchema = analysisSchema.pick({
  갈래: true,
  세부영역: true,
  제재: true,
  핵심주제: true,
  요약: true,
  핵심개념: true,
  핵심키워드: true,
  고유명사_인물_이론: true,
  논지전개구조: true,
  서술방식: true,
  정보구조유형: true,
  배경지식영역: true,
  난이도: true,
  난이도근거: true,
});

const questionAnalysisSchema = analysisSchema.pick({
  딸린문항유형: true,
  출제의도: true,
  오답함정유형: true,
  연계배경지식: true,
  상호텍스트: true,
  핵심문장: true,
  추출품질: true,
});

const relationSchema = z.enum([
  "주제",
  "제재",
  "핵심개념",
  "논지구조",
  "배경지식",
  "출제유형",
  "관점대립",
]);

const rewrittenLinkSchema = z.object({
  examPassageId: z.string().min(1),
  keep: z.boolean(),
  sourceParts: z.array(z.string().min(1)).min(1).max(2),
  strength: z.enum(["강", "중", "약"]),
  relationTypes: z.array(relationSchema).min(1).max(6),
  sharedConcepts: z.array(z.string().min(1).max(100)).max(6),
  sharedKeywords: z.array(z.string().min(1).max(60)).max(8),
  conceptMappings: z
    .array(
      z.object({
        swTerm: z.string().min(1),
        examTerm: z.string().min(1),
        relationship: z.string().min(3).max(100),
      }),
    )
    .max(4),
  swEvidence: z.array(z.string().min(8).max(180)).max(3),
  examEvidence: z.array(z.string().min(8).max(180)).max(2),
  rationale: z.string().min(5).max(500),
  difference: z.string().max(400),
  studyPoint: z.string().max(400),
});

const linkAuditBatchSchema = z.object({
  links: z.array(rewrittenLinkSchema),
});

const analysisReviewSchema = z.object({
  verdict: z.enum(["pass", "fix"]),
  issues: z
    .array(
      z.object({
        field: z.string().min(1),
        qNum: z.number().int().positive().nullable(),
        problem: z.string().min(5).max(300),
        correction: z.string().min(5).max(300),
      }),
    )
    .max(20),
  auditSummary: z.string().min(10).max(500),
});

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function atomicJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function analysisInputHash(passage: SwPassage, problems: unknown[]): string {
  return sha256Json({
    id: passage.id,
    qFrom: passage.qFrom,
    qTo: passage.qTo,
    passageText: passage.passageText,
    parts: passage.parts.map((part) => ({ label: part.label, text: part.text })),
    problems,
  });
}

function linkInputHash(
  passage: SwPassage,
  candidates: SwLink[],
  examById: Map<string, ExamPassage>,
): string {
  return sha256Json({
    passage: {
      id: passage.id,
      passageText: passage.passageText,
      parts: passage.parts.map((part) => ({ label: part.label, text: part.text })),
    },
    candidates: candidates.map((candidate) => ({
      examPassageId: candidate.examPassageId,
      retrievalScore: candidate.retrievalScore,
      exam: examById.get(candidate.examPassageId)?.passageText ?? null,
    })),
  });
}

function examForPrompt(exam: ExamPassage, link: SwLink): JsonRecord {
  return {
    후보검색정보: {
      examPassageId: link.examPassageId,
      retrievalScore: link.retrievalScore,
    },
    기출메타: {
      id: exam.id,
      출처: `${exam.board} ${exam.year} ${exam.siheng} ${exam.grade}`,
      문항범위: [exam.qFrom, exam.qTo],
      제목: exam.title,
      세부영역: exam.subGenre,
      제재: exam.jaejae,
    },
    기출원문: exam.passageText,
  };
}

function freshContentAnalysisPrompt(
  passage: SwPassage,
  feedback: string,
): string {
  return `당신은 Claude Sonnet 수능 국어 독서 분석가입니다. 아래 수능완성 원문만을 근거로 통합 분석의 본문 의미·구조 14필드를 처음부터 새로 작성하십시오.

규칙:
- 정확히 다음 14개 키만 반환합니다: 갈래, 세부영역, 제재, 핵심주제, 요약, 핵심개념, 핵심키워드, 고유명사_인물_이론, 논지전개구조, 서술방식, 정보구조유형, 배경지식영역, 난이도, 난이도근거.
- 원문 밖 사실이나 배경지식을 원문의 주장처럼 쓰지 않습니다.
- 고유명사_인물_이론은 원문에 실제로 등장하는 것만 넣습니다.
${feedback ? `이전 검증 오류: ${feedback}` : ""}

수능완성 ID: ${passage.id}
원문: ${passage.passageText}

14필드 JSON 객체 하나만 반환하십시오.`;
}

function freshQuestionAnalysisPrompt(
  passage: SwPassage,
  problems: unknown[],
  contentAnalysis: z.infer<typeof contentAnalysisSchema>,
  feedback: string,
): string {
  return `당신은 Claude Sonnet 수능 국어 독서 분석가입니다. 아래 원문·문항과 이미 확정된 본문 분석을 근거로 문항·상호텍스트 7필드를 처음부터 작성하십시오.

규칙:
- 정확히 다음 7개 키만 반환합니다: 딸린문항유형, 출제의도, 오답함정유형, 연계배경지식, 상호텍스트, 핵심문장, 추출품질.
- 핵심문장은 원문의 실제 연속 문자열만 축자 인용합니다.
- 딸린문항유형은 ${passage.qFrom}~${passage.qTo}번을 중복·누락 없이 정확히 한 번씩 포함합니다.
- 외부 고유명사·인물·이론의 정확한 표기에 확신이 없으면 쓰지 않습니다.
- 〈보기〉가 있는 문항은 상호텍스트에 문항번호와 보기의 구체 소재를 모두 명시합니다. 출제의도와 오답함정유형은 실제 문항번호를 최소 2개 이상 들어 서로 다른 판단 요구를 설명합니다.
- 문항 stem·보기·선지에 없는 판단 과제나 정답을 추측하지 않습니다.
${feedback ? `이전 검증 오류: ${feedback}` : ""}

수능완성 ID: ${passage.id}
원문: ${passage.passageText}
문항: ${JSON.stringify(problems)}
본문 분석: ${JSON.stringify(contentAnalysis)}

7필드 JSON 객체 하나만 반환하십시오.`;
}

function analysisReviewPrompt(
  passage: SwPassage,
  problems: unknown[],
  analysis: Analysis,
  feedback: string,
): string {
  return `당신은 앞선 작성과 독립된 Claude Sonnet 수능 국어 데이터 반증 감사자입니다. 아래 21필드 분석의 모든 사실 주장을 실제 수능완성 원문과 문항 stem·보기·선지에 한 항목씩 대조하십시오.

판정 규칙:
- pass는 실제 오류·과장·중요 누락이 하나도 없을 때만 허용합니다. 하나라도 있으면 fix입니다.
- 핵심주제·요약·핵심개념·논지 구조가 원문에 없는 내용을 주장하는지 확인합니다.
- 딸린문항유형·출제의도·오답함정유형·상호텍스트의 문항번호, 소재, 판단 과제가 실제 stem·보기·선지와 정확히 일치하는지 특히 엄격히 확인합니다. 정답 정보가 없으므로 정답을 추측해 사실처럼 쓰면 오류입니다.
- 연계배경지식의 외부 고유명사·인물·이론 표기가 불확실하거나 잘못되면 삭제를 요구합니다.
- 문제를 발견하면 issues에 필드, 관련 문항번호(없으면 null), 잘못된 주장, 원문·문항에 맞는 교정 방향을 구체적으로 씁니다.
- verdict=pass이면 issues=[], verdict=fix이면 issues는 1개 이상이어야 합니다.
- 반증 예시: 16번의 위도별 태양 고도·입사각 추론을 자전축 기울기·반구 온도차 문제로 바꾸어 말하는 것은 오류입니다. 필터 버블 제시자 인명을 부정확하게 적는 것도 오류입니다.
${feedback ? `이전 검증 오류: ${feedback}` : ""}

수능완성 ID: ${passage.id}
원문: ${passage.passageText}
문항: ${JSON.stringify(problems)}
검수할 분석: ${JSON.stringify(analysis)}

유효한 JSON 객체 하나만 반환하고 최상위 키는 verdict, issues, auditSummary입니다.`;
}

function linkAuditPrompt(
  passage: SwPassage,
  links: SwLink[],
  examById: Map<string, ExamPassage>,
  feedback: string,
): string {
  const linkedExams = links.map((link) => {
    const exam = examById.get(link.examPassageId);
    if (!exam) throw new Error(`기출 ID 없음: ${link.examPassageId}`);
    return examForPrompt(exam, link);
  });
  const labels = passage.parts.length ? passage.parts.map((part) => part.label) : ["전체"];
  return `당신은 Claude Sonnet이며 수능 국어 독서의 거부 지향 fresh-eyes 연계 감사자입니다.

아래 수능완성 원문과 이번 묶음의 실제 기출 원문만을 근거로 후보별 연계를 처음부터 판정·서술하십시오. 기존 긴 연계 설명은 제공되지 않습니다.

규칙:
- links에는 입력된 모든 examPassageId를 정확히 한 번씩 반환합니다. 새 ID·누락·중복 금지. 목표 개수를 맞추지 말고 근거가 없으면 keep=false로 버립니다.
- keep=true는 양쪽 실제 원문에 특정 개념·대상·기제·논증·관점·적용 사고의 대응이 있을 때만 허용합니다. 같은 대분류, 같은 인물명 하나, '관점 대조형', '4분류' 같은 형식만 겹치면 제외합니다.
- strength=강은 중심 제재나 핵심 기제를 직접 공유할 때, 중은 특정 개념·논증·적용 조작이 직접 대응할 때, 약은 명확한 배경지식·구조 전이가 있을 때만 씁니다.
- relationTypes의 관점대립은 양쪽 원문에 서로 반대되는 명시적 주장·이론이 있을 때만 사용합니다. 단순한 강조점이나 용어 차이는 관점대립이 아닙니다.
- 이번 입력에는 기출 문항이 없으므로 relationTypes에 출제유형을 절대 사용하지 않습니다. 원문만으로 감사 가능한 주제·제재·핵심개념·논지구조·배경지식·관점대립 중에서만 고릅니다.
- sourceParts 허용값=${JSON.stringify(labels)}. 단일이면 ["전체"], 복합이면 실제 근거 문구가 존재하는 (가)/(나)만 정확히 표시합니다.
- keep=true마다 examEvidence는 8~120자의 실제 연속 문자열 1개만 축자 복사합니다. swEvidence는 지정한 sourceParts 각각에서 정확히 1개씩 복사하므로 한 부분이면 1개, 두 부분이면 2개여야 합니다.
- sharedKeywords는 같은 문자열이 양쪽 원문에 실제로 존재할 때만 씁니다. 동의·유사 개념은 sharedKeywords가 아니라 conceptMappings의 swTerm/examTerm/relationship으로 명시합니다.
- conceptMappings를 쓰면 swTerm은 swEvidence 안에, examTerm은 examEvidence 안에 반드시 그대로 들어가게 근거 문장을 고릅니다. 근거 문장에 없는 개념 매핑은 만들지 않습니다.
- rationale은 evidence에서 직접 따라 나오는 공통점만 설명하고, difference는 양쪽 실제 차이를, studyPoint는 그 근거 범위 안의 비교 학습법을 씁니다. 수치·연령·사례가 한쪽에만 있으면 '양쪽 모두'라고 쓰지 않습니다.
- 유지 링크 하나당 sharedConcepts 1~2개, sharedKeywords 0~3개, conceptMappings 0~1개로 제한합니다. rationale 1문장, difference 1문장, studyPoint 1문장으로 간결하게 쓰고 원문 전체를 반복하지 않습니다.
- keep=false도 sourceParts·strength·relationTypes는 형식상 채우되 sharedConcepts/sharedKeywords/conceptMappings/evidence는 빈 배열로 하고 rationale에 구체적 탈락 이유를 씁니다. difference와 studyPoint는 빈 문자열이어도 됩니다.
- 다음은 금지된 과장 사례입니다: 비행기 사고 사례를 수능완성에 귀속, 분압 (가)에 표면장력·내외부 압력 평형을 귀속, 미세플라스틱 (나)에 확산·농도 비례·세포막·단백질 손상을 귀속, 눈동자 전·후 도약을 전·후 추론과 정확 대응시킴, 기억 지문이 기억의 '한계'를 근거로 삼는다고 단정, 연령이 없는 읽기 기출에 만 2~4세 수치를 귀속.
- SW R1 4~7번의 전환적 추론(유사성·인접성으로 비논리적 인과 설정)과 KICE 2017 6월 유비 논증(관련 있는 유사성으로 속성 전이)은 같은 결론이 아니라 유사성을 추론 근거로 쓰는 서로 다른 기제를 비교하는 약/중 연계이므로, 단순히 개념이 다르다는 이유로 버리지 않습니다.
${feedback ? `\n이전 검증 오류: ${feedback}\n` : ""}

수능완성:
${JSON.stringify(
    {
      id: passage.id,
      원문: passage.parts.length ? undefined : passage.passageText,
      부분원문: passage.parts.map((part) => ({ label: part.label, text: part.text })),
    },
    null,
    2,
  )}

검색 후보와 실제 기출:
${JSON.stringify(linkedExams, null, 2)}

유효한 JSON 객체 하나만 반환하고 최상위 키는 links 하나뿐입니다. 별도 총평이나 설명을 출력하지 마십시오.`;
}

function normalizeSourceParts(passage: SwPassage, values: string[]): string[] {
  if (passage.parts.length === 0) return ["전체"];
  const normalized = new Set<string>();
  for (const raw of values) {
    const compact = raw.replace(/\s+/g, "");
    if (compact === "전체" || compact === "통합") {
      for (const part of passage.parts) normalized.add(part.label);
    } else if (compact === "가" || compact === "(가)") {
      normalized.add("(가)");
    } else if (compact === "나" || compact === "(나)") {
      normalized.add("(나)");
    } else {
      normalized.add(raw);
    }
  }
  return [...normalized];
}

/** PDF 줄바꿈·원문 기호 차이만 허용해 모델 증거를 실제 원문 연속 구간으로 되돌린다. */
function alignEvidence(source: string, proposed: string): string | null {
  if (source.includes(proposed)) return proposed;
  const ignored = /[\s"'“”‘’.,，。:;!?·㉠-㉿]/u;
  let canonicalSource = "";
  const sourceIndexes: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (ignored.test(character)) continue;
    canonicalSource += character.toLowerCase();
    sourceIndexes.push(index);
  }
  let canonicalProposed = "";
  for (const character of proposed) {
    if (!ignored.test(character)) canonicalProposed += character.toLowerCase();
  }
  if (canonicalProposed.length < 4) return null;
  const start = canonicalSource.indexOf(canonicalProposed);
  if (start < 0) return null;
  const originalStart = sourceIndexes[start];
  const originalEnd = sourceIndexes[start + canonicalProposed.length - 1];
  if (originalStart === undefined || originalEnd === undefined) return null;
  return source.slice(originalStart, originalEnd + 1);
}

function validateLinkAudit(
  passage: SwPassage,
  links: SwLink[],
  audit: z.infer<typeof linkAuditBatchSchema>,
  examById: Map<string, ExamPassage>,
): void {
  const inputIds = links.map((link) => link.examPassageId);
  const auditedIds = audit.links.map((link) => link.examPassageId);
  if (
    new Set(auditedIds).size !== auditedIds.length ||
    inputIds.length !== auditedIds.length ||
    inputIds.some((id) => !auditedIds.includes(id))
  ) {
    throw new Error(`${passage.id}: 감사 링크 ID가 입력과 일치하지 않음`);
  }

  const allowedParts = new Set(
    passage.parts.length ? passage.parts.map((part) => part.label) : ["전체"],
  );
  for (const link of audit.links) {
    link.sourceParts = normalizeSourceParts(passage, link.sourceParts);
    if (link.sourceParts.some((part) => !allowedParts.has(part))) {
      throw new Error(`${link.examPassageId}: sourceParts 허용값 위반`);
    }
    if (link.relationTypes.includes("출제유형")) {
      throw new Error(`${link.examPassageId}: 기출 문항 없이 출제유형 관계를 판정함`);
    }
    if (!link.keep) {
      if (
        link.sharedConcepts.length ||
        link.sharedKeywords.length ||
        link.conceptMappings.length ||
        link.swEvidence.length ||
        link.examEvidence.length
      ) {
        throw new Error(`${link.examPassageId}: 제외 링크에 근거 배열이 남아 있음`);
      }
      continue;
    }

    const exam = examById.get(link.examPassageId);
    if (!exam) throw new Error(`${link.examPassageId}: 기출 원문 없음`);
    if (link.sharedConcepts.length === 0) {
      throw new Error(`${link.examPassageId}: 유지 링크의 공통 개념 없음`);
    }
    if (link.swEvidence.length === 0 || link.examEvidence.length === 0) {
      throw new Error(`${link.examPassageId}: 유지 링크의 축자 근거 없음`);
    }
    if (link.rationale.length < 30 || link.difference.length < 20 || link.studyPoint.length < 20) {
      throw new Error(`${link.examPassageId}: 근거·차이·학습 포인트가 너무 짧음`);
    }
    const selectedParts = passage.parts.length
      ? passage.parts.filter((part) => link.sourceParts.includes(part.label))
      : [{ label: "전체", text: passage.passageText }];
    const swSource = selectedParts.map((part) => part.text).join("\n");
    const evidencedParts = new Set<string>();
    for (let index = 0; index < link.swEvidence.length; index += 1) {
      const evidence = link.swEvidence[index];
      const matchedPart = selectedParts.find((part) => alignEvidence(part.text, evidence));
      const aligned = matchedPart ? alignEvidence(matchedPart.text, evidence) : null;
      if (!matchedPart || !aligned) {
        throw new Error(`${link.examPassageId}: 수완 근거가 지정 부분 원문에 없음: ${evidence}`);
      }
      link.swEvidence[index] = aligned;
      evidencedParts.add(matchedPart.label);
    }
    if (selectedParts.some((part) => !evidencedParts.has(part.label))) {
      throw new Error(`${link.examPassageId}: sourceParts별 수완 축자 근거가 빠짐`);
    }
    for (let index = 0; index < link.examEvidence.length; index += 1) {
      const evidence = link.examEvidence[index];
      const aligned = alignEvidence(exam.passageText, evidence);
      if (!aligned) {
        throw new Error(`${link.examPassageId}: 기출 근거가 원문에 없음: ${evidence}`);
      }
      link.examEvidence[index] = aligned;
    }
    for (const keyword of link.sharedKeywords) {
      if (!swSource.includes(keyword) || !exam.passageText.includes(keyword)) {
        throw new Error(`${link.examPassageId}: 공통 키워드가 양쪽 축자 문자열이 아님: ${keyword}`);
      }
    }
    for (const mapping of link.conceptMappings) {
      const swTerm = alignEvidence(swSource, mapping.swTerm);
      const examTerm = alignEvidence(exam.passageText, mapping.examTerm);
      if (!swTerm || !examTerm) {
        throw new Error(
          `${link.examPassageId}: 개념 매핑 용어가 원문에 없음: ${mapping.swTerm}/${mapping.examTerm}`,
        );
      }
      mapping.swTerm = swTerm;
      mapping.examTerm = examTerm;
      if (
        !link.swEvidence.some((evidence) => evidence.includes(mapping.swTerm)) ||
        !link.examEvidence.some((evidence) => evidence.includes(mapping.examTerm))
      ) {
        throw new Error(
          `${link.examPassageId}: 개념 매핑 용어가 축자 evidence 안에 포함되지 않음`,
        );
      }
    }
  }
}

async function callSonnetObject<T>(
  promptFactory: (feedback: string) => string,
  schema: z.ZodType<T>,
  maxOutputTokens: number,
  timeoutMs: number,
  label: string,
  attempts = 2,
): Promise<{ value: T; usage: unknown }> {
  const { atlasChatModel } = await import("../src/lib/atlas-ai");
  let feedback = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const generated = await generateObject({
        model: atlasChatModel(MODEL),
        schema,
        prompt: promptFactory(feedback),
        maxOutputTokens,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });
      return {
        value: generated.object,
        usage: "usage" in generated ? generated.usage : undefined,
      };
    } catch (error) {
      lastError = error;
      feedback = error instanceof Error ? error.message : String(error);
      console.error(`[${label}] object attempt ${attempt}/${attempts}: ${feedback}`);
    }
  }
  throw lastError;
}

function validateAnalysis(
  passage: SwPassage,
  analysis: Analysis,
  source: string,
  requireAllQuestions: boolean,
): void {
  for (const sentence of analysis.핵심문장) {
    if (!source.includes(sentence)) throw new Error(`핵심문장이 원문에 없음: ${sentence.slice(0, 70)}`);
  }
  const allowed = new Set(
    Array.from({ length: passage.qTo - passage.qFrom + 1 }, (_, index) => passage.qFrom + index),
  );
  const numbers = analysis.딸린문항유형.map((item) => item.번호);
  if (new Set(numbers).size !== numbers.length || numbers.some((number) => !allowed.has(number))) {
    throw new Error(`문항번호 중복/범위 오류: ${numbers.join(",")}`);
  }
  if (requireAllQuestions && (numbers.length !== allowed.size || [...allowed].some((n) => !numbers.includes(n)))) {
    throw new Error(`통합 문항번호 누락: ${numbers.join(",")}`);
  }
}

function validateFreshAnalysis(
  passage: SwPassage,
  analysis: Analysis,
  problems: unknown[],
): void {
  validateAnalysis(passage, analysis, passage.passageText, true);
  const records = problems.flatMap<{ qNum: number; bogi: string | null }>((problem) => {
    if (!problem || typeof problem !== "object") return [];
    const candidate = problem as { qNum?: unknown; bogi?: unknown };
    if (typeof candidate.qNum !== "number") return [];
    return [
      {
        qNum: candidate.qNum,
        bogi: typeof candidate.bogi === "string" && candidate.bogi.trim() ? candidate.bogi : null,
      },
    ];
  });
  const bogiProblems = records.filter((problem) => problem.bogi);
  if (bogiProblems.length > 0) {
    if (!analysis.상호텍스트) throw new Error("보기 문항이 있으나 상호텍스트가 null임");
    for (const problem of bogiProblems) {
      if (!analysis.상호텍스트.includes(`${problem.qNum}번`)) {
        throw new Error(`상호텍스트에 ${problem.qNum}번 보기 소재가 명시되지 않음`);
      }
    }
  }
  const questionEvidence = `${analysis.출제의도} ${analysis.오답함정유형}`;
  const cited = records.filter((problem) =>
    questionEvidence.includes(`${problem.qNum}번`),
  ).length;
  if (cited < Math.min(2, records.length)) {
    throw new Error("출제의도·오답함정유형에 서로 다른 실제 문항번호 근거가 2개 미만임");
  }
}

async function auditOne(
  passage: SwPassage,
  problems: unknown[],
  links: SwLink[],
  examById: Map<string, ExamPassage>,
): Promise<{
  analysis: Analysis;
  analysisReview: z.infer<typeof analysisReviewSchema>;
  partAnalyses: { label: string; analysis: Analysis }[];
  links: SwLink[];
  candidateDecisions: z.infer<typeof rewrittenLinkSchema>[];
  auditSummary: string;
  usage: unknown[];
}> {
  const usages: unknown[] = [];
  let analysis: Analysis | null = null;
  let analysisReview: z.infer<typeof analysisReviewSchema> | null = null;
  const analysisStagePath = path.join(TMP_DIR, `${passage.id}.analysis.json`);
  const currentAnalysisInputHash = analysisInputHash(passage, problems);
  if (RESUME) {
    try {
      const cached = await readJson<{
        model: string;
        promptVersion: string;
        inputHash: string;
        analysis: Analysis;
        review: z.infer<typeof analysisReviewSchema>;
      }>(analysisStagePath);
      if (cached.model !== MODEL) throw new Error("analysis cache model mismatch");
      if (cached.promptVersion !== ANALYSIS_PROMPT_VERSION) {
        throw new Error("analysis cache prompt mismatch");
      }
      if (cached.inputHash !== currentAnalysisInputHash) {
        throw new Error("analysis cache input mismatch");
      }
      validateFreshAnalysis(passage, cached.analysis, problems);
      if (cached.review.verdict !== "pass" || cached.review.issues.length !== 0) {
        throw new Error("analysis cache review did not pass");
      }
      analysis = cached.analysis;
      analysisReview = cached.review;
      console.log(`[${passage.id}] analysis cached`);
    } catch {
      // 새 분석 생성
    }
  }
  let analysisFeedback = "";
  for (let attempt = 1; !analysis && attempt <= 3; attempt += 1) {
    let analyzed: { value: Analysis; usage: unknown };
    try {
      const content = await callSonnetObject(
        (feedback) =>
          freshContentAnalysisPrompt(
            passage,
            [analysisFeedback, feedback].filter(Boolean).join("\n"),
          ),
        contentAnalysisSchema,
        8_000,
        300_000,
        `${passage.id}:analysis-content`,
        1,
      );
      usages.push(content.usage);
      const questions = await callSonnetObject(
        (feedback) =>
          freshQuestionAnalysisPrompt(
            passage,
            problems,
            content.value,
            [analysisFeedback, feedback].filter(Boolean).join("\n"),
          ),
        questionAnalysisSchema,
        8_000,
        300_000,
        `${passage.id}:analysis-questions`,
        1,
      );
      usages.push(questions.usage);
      analyzed = {
        value: { ...content.value, ...questions.value } as Analysis,
        usage: [content.usage, questions.usage],
      };
      validateFreshAnalysis(passage, analyzed.value, problems);
    } catch (error) {
      analysisFeedback = error instanceof Error ? error.message : String(error);
      console.error(
        `[${passage.id}:analysis] semantic attempt ${attempt}/3: ${analysisFeedback}`,
      );
      continue;
    }

    let shouldRegenerate = false;
    for (let reviewAttempt = 1; reviewAttempt <= 3; reviewAttempt += 1) {
      try {
        const reviewed = await callSonnetObject(
          (feedback) =>
            analysisReviewPrompt(passage, problems, analyzed.value, feedback),
          analysisReviewSchema,
          5_000,
          240_000,
          `${passage.id}:analysis-review`,
          1,
        );
        usages.push(reviewed.usage);
        if (
          (reviewed.value.verdict === "pass" && reviewed.value.issues.length > 0) ||
          (reviewed.value.verdict === "fix" && reviewed.value.issues.length === 0)
        ) {
          throw new Error("분석 반증 판정과 issues가 불일치함");
        }
        if (reviewed.value.verdict === "fix") {
          analysisFeedback = `독립 반증 감사에서 다음 오류가 발견됨: ${JSON.stringify(
            reviewed.value.issues,
          )}`;
          console.error(
            `[${passage.id}:analysis-review] regeneration ${attempt}/3: ${analysisFeedback}`,
          );
          shouldRegenerate = true;
          break;
        }
        analysis = analyzed.value;
        analysisReview = reviewed.value;
        await atomicJson(analysisStagePath, {
          model: MODEL,
          promptVersion: ANALYSIS_PROMPT_VERSION,
          inputHash: currentAnalysisInputHash,
          generatedAt: new Date().toISOString(),
          analysis,
          review: analysisReview,
          usage: analyzed.usage,
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[${passage.id}:analysis-review] attempt ${reviewAttempt}/3: ${message}`,
        );
      }
    }
    if (analysis) break;
    if (shouldRegenerate) continue;
    throw new Error(`${passage.id}: 독립 분석 반증 호출이 3회 모두 실패함`);
  }
  if (!analysis || !analysisReview) {
    throw new Error(`${passage.id}: fresh analysis review failed`);
  }

  const candidateDecisions: z.infer<typeof rewrittenLinkSchema>[] = [];
  for (let offset = 0; offset < links.length; offset += 1) {
    const batch = links.slice(offset, offset + 1);
    let auditedBatch: z.infer<typeof linkAuditBatchSchema> | null = null;
    const batchStagePath = path.join(TMP_DIR, `${passage.id}.links-${offset + 1}.json`);
    const currentLinkInputHash = linkInputHash(passage, batch, examById);
    if (RESUME) {
      try {
        const cached = await readJson<{
          model: string;
          promptVersion: string;
          inputHash: string;
          audit: z.infer<typeof linkAuditBatchSchema>;
        }>(batchStagePath);
        if (cached.model !== MODEL) throw new Error("link cache model mismatch");
        if (cached.promptVersion !== LINK_PROMPT_VERSION) {
          throw new Error("link cache prompt mismatch");
        }
        if (cached.inputHash !== currentLinkInputHash) {
          throw new Error("link cache input mismatch");
        }
        validateLinkAudit(passage, batch, cached.audit, examById);
        auditedBatch = cached.audit;
        console.log(`[${passage.id}] links-${offset + 1} cached`);
      } catch {
        // 새 링크 감사 생성
      }
    }
    let linkFeedback = "";
    for (let attempt = 1; !auditedBatch && attempt <= 3; attempt += 1) {
      const audited = await callSonnetObject(
        (feedback) =>
          linkAuditPrompt(
            passage,
            batch,
            examById,
            [linkFeedback, feedback].filter(Boolean).join("\n"),
          ),
        linkAuditBatchSchema,
        8_000,
        240_000,
        `${passage.id}:links-${offset + 1}`,
      );
      usages.push(audited.usage);
      try {
        validateLinkAudit(passage, batch, audited.value, examById);
        auditedBatch = audited.value;
        await atomicJson(batchStagePath, {
          model: MODEL,
          promptVersion: LINK_PROMPT_VERSION,
          inputHash: currentLinkInputHash,
          generatedAt: new Date().toISOString(),
          audit: auditedBatch,
          usage: audited.usage,
        });
        break;
      } catch (error) {
        linkFeedback = error instanceof Error ? error.message : String(error);
        console.error(
          `[${passage.id}:links-${offset + 1}] semantic attempt ${attempt}/3: ${linkFeedback}`,
        );
      }
    }
    if (!auditedBatch) {
      throw new Error(`${passage.id}: link batch ${offset + 1} validation failed`);
    }
    candidateDecisions.push(...auditedBatch.links);
  }

  // (가)/(나) 분석은 직전 Sonnet 전수 패스에서 각각 생성된 값을 축자·문항 규칙으로 재검증한다.
  const partAnalyses: { label: string; analysis: Analysis }[] = [];
  for (const part of passage.parts) {
    if (!part.analysis) throw new Error(`${passage.id}/${part.label}: 부분 분석 없음`);
    validateAnalysis(passage, part.analysis, part.text, false);
    partAnalyses.push({ label: part.label, analysis: part.analysis });
  }

  const currentById = new Map(links.map((link) => [link.examPassageId, link]));
  const auditedLinks: SwLink[] = candidateDecisions.flatMap((item) => {
    if (!item.keep) return [];
    const current = currentById.get(item.examPassageId);
    if (!current) return [];
    return [
      {
        examPassageId: item.examPassageId,
        retrievalScore: current.retrievalScore,
        sourceParts: item.sourceParts,
        strength: item.strength,
        relationTypes: item.relationTypes,
        sharedConcepts: item.sharedConcepts,
        sharedKeywords: item.sharedKeywords,
        conceptMappings: item.conceptMappings,
        swEvidence: item.swEvidence,
        examEvidence: item.examEvidence,
        rationale: item.rationale,
        difference: item.difference,
        studyPoint: item.studyPoint,
      },
    ];
  });

  return {
    analysis,
    analysisReview,
    partAnalyses,
    links: auditedLinks,
    candidateDecisions,
    auditSummary: `${passage.id}의 통합 21필드 분석을 새로 생성하고 연계 후보 ${candidateDecisions.length}건을 축자 근거로 전수 감사해 ${auditedLinks.length}건을 유지했다.`,
    usage: usages,
  };
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => run()));
}

function recomputeFacets(
  passages: SwPassage[],
  links: Record<string, SwLink[]>,
  existing: JsonRecord,
): JsonRecord {
  const roundCount: Record<string, number> = {};
  const subGenreCount: Record<string, number> = {};
  const difficultyCount: Record<string, number> = {};
  const relationCount: Record<string, number> = {};
  const keywordCount: Record<string, number> = {};
  for (const passage of passages) {
    roundCount[String(passage.roundNo)] = (roundCount[String(passage.roundNo)] ?? 0) + 1;
    if (passage.subGenre) {
      subGenreCount[passage.subGenre] = (subGenreCount[passage.subGenre] ?? 0) + 1;
    }
    if (passage.difficulty) {
      difficultyCount[passage.difficulty] = (difficultyCount[passage.difficulty] ?? 0) + 1;
    }
    const present = new Set((links[passage.id] ?? []).flatMap((link) => link.relationTypes));
    for (const relation of present) relationCount[relation] = (relationCount[relation] ?? 0) + 1;
    for (const keyword of new Set(passage.analysis.핵심키워드)) {
      keywordCount[keyword] = (keywordCount[keyword] ?? 0) + 1;
    }
  }
  const relationTypes: RelationType[] = [
    "주제",
    "제재",
    "핵심개념",
    "논지구조",
    "배경지식",
    "출제유형",
    "관점대립",
  ];
  return {
    ...existing,
    total: passages.length,
    totalTexts: passages.reduce((sum, passage) => sum + Math.max(1, passage.parts.length), 0),
    totalLinks: Object.values(links).reduce((sum, list) => sum + list.length, 0),
    rounds: Object.keys(roundCount)
      .map(Number)
      .sort((a, b) => a - b),
    subGenres: Object.keys(subGenreCount).sort((a, b) => a.localeCompare(b, "ko")),
    difficulties: ["상", "중", "하"].filter((value) => difficultyCount[value]),
    relationTypes: relationTypes.filter((relation) => (relationCount[relation] ?? 0) > 0),
    counts: {
      round: roundCount,
      subGenre: subGenreCount,
      difficulty: difficultyCount,
      relationType: relationCount,
    },
    topKeywords: Object.entries(keywordCount)
      .map(([kw, count]) => ({ kw, count }))
      .sort((a, b) => b.count - a.count || a.kw.localeCompare(b.kw, "ko"))
      .slice(0, 200),
  };
}

async function main(): Promise<void> {
  const [passages, problems, links, facets, exams] = await Promise.all([
    readJson<SwPassage[]>(PASSAGES_PATH),
    readJson<Record<string, unknown[]>>(PROBLEMS_PATH),
    readJson<Record<string, SwLink[]>>(LINKS_PATH),
    readJson<JsonRecord>(FACETS_PATH),
    readJson<ExamPassage[]>(EXAMS_PATH),
  ]);
  let candidateLinks: Record<string, SwLink[]> = links;
  try {
    const previousAudit = await readJson<{
      sourceSha256: string;
      candidateUniverse: Record<string, SwLink[]>;
    }>(LINK_AUDIT_PATH);
    if (
      previousAudit.sourceSha256 === SOURCE_SHA256 &&
      previousAudit.candidateUniverse &&
      typeof previousAudit.candidateUniverse === "object"
    ) {
      candidateLinks = previousAudit.candidateUniverse;
    }
  } catch {
    // 최초 full-v2 실행은 현재 links.json의 compact 감사 생존 후보를 사용한다.
  }
  const selected = passages.filter((passage) => ONLY.size === 0 || ONLY.has(passage.id));
  if (!selected.length) throw new Error("감사할 지문이 없습니다.");
  if (ONLY.size > 0 && !NO_MERGE) {
    throw new Error("--only 부분 실행은 --no-merge와 함께만 사용할 수 있습니다.");
  }
  const examById = new Map(exams.map((exam) => [exam.id, exam]));
  await fs.mkdir(TMP_DIR, { recursive: true });

  console.log(
    `model=${MODEL} passages=${selected.length}/${passages.length} candidates=${Object.values(candidateLinks).flat().length} concurrency=${CONCURRENCY}`,
  );
  const failures: { id: string; message: string }[] = [];
  await runPool(selected, async (passage) => {
    try {
      const outPath = path.join(TMP_DIR, `${passage.id}.json`);
      const passageInputHash = sha256Json({
        analysis: analysisInputHash(passage, problems[passage.id] ?? []),
        links: linkInputHash(passage, candidateLinks[passage.id] ?? [], examById),
      });
      if (RESUME) {
        try {
          const cached = await readJson<{
            model: string;
            auditVersion: string;
            analysisPromptVersion: string;
            linkPromptVersion: string;
            inputHash: string;
          }>(outPath);
          if (cached.model !== MODEL) throw new Error("cache model mismatch");
          if (
            cached.auditVersion !== AUDIT_VERSION ||
            cached.analysisPromptVersion !== ANALYSIS_PROMPT_VERSION ||
            cached.linkPromptVersion !== LINK_PROMPT_VERSION
          ) {
            throw new Error("cache prompt version mismatch");
          }
          if (cached.inputHash !== passageInputHash) {
            throw new Error("cache input hash mismatch");
          }
          console.log(`[${passage.id}] cached`);
          return;
        } catch {
          // 생성 계속
        }
      }
      console.log(
        `[${passage.id}] audit start links=${(candidateLinks[passage.id] ?? []).length}`,
      );
      const result = await auditOne(
        passage,
        problems[passage.id] ?? [],
        candidateLinks[passage.id] ?? [],
        examById,
      );
      await atomicJson(outPath, {
        passageId: passage.id,
        model: MODEL,
        auditVersion: AUDIT_VERSION,
        analysisPromptVersion: ANALYSIS_PROMPT_VERSION,
        linkPromptVersion: LINK_PROMPT_VERSION,
        inputHash: passageInputHash,
        auditedAt: new Date().toISOString(),
        ...result,
      });
      console.log(`[${passage.id}] audit complete links=${result.links.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: passage.id, message });
      console.error(`[${passage.id}] audit failed: ${message}`);
    }
  });
  if (failures.length > 0) {
    throw new Error(
      `full-v2 미완료 ${failures.length}건: ${failures
        .map((failure) => `${failure.id}=${failure.message}`)
        .join(" | ")}`,
    );
  }
  if (NO_MERGE) {
    console.log("no-merge: 중간 결과만 저장했습니다.");
    return;
  }

  const resultById = new Map<
    string,
    {
      model: string;
      analysis: Analysis;
      analysisReview: z.infer<typeof analysisReviewSchema>;
      partAnalyses: { label: string; analysis: Analysis }[];
      links: SwLink[];
      candidateDecisions: z.infer<typeof rewrittenLinkSchema>[];
      auditSummary: string;
      auditedAt: string;
    }
  >();
  for (const passage of selected) {
    const result = await readJson<{
      model: string;
      analysis: Analysis;
      analysisReview: z.infer<typeof analysisReviewSchema>;
      partAnalyses: { label: string; analysis: Analysis }[];
      links: SwLink[];
      candidateDecisions: z.infer<typeof rewrittenLinkSchema>[];
      auditSummary: string;
      auditedAt: string;
    }>(path.join(TMP_DIR, `${passage.id}.json`));
    if (result.model !== MODEL) throw new Error(`${passage.id} 결과 모델 불일치`);
    resultById.set(passage.id, result);
  }

  const mergedLinks: Record<string, SwLink[]> = { ...links };
  for (const [id, result] of resultById) {
    const scoreById = new Map(
      (candidateLinks[id] ?? []).map((link) => [link.examPassageId, link.retrievalScore]),
    );
    mergedLinks[id] = result.links.map((link) => ({
      ...link,
      retrievalScore: scoreById.get(link.examPassageId) ?? 0,
    }));
  }
  const mergedPassages = passages.map((passage) => {
    const result = resultById.get(passage.id);
    const pages = pageMap[passage.id.replace(/-/g, "_")];
    if (!pages) throw new Error(`페이지 매핑 없음: ${passage.id}`);
    return {
      ...passage,
      ...pages,
      analysis: result?.analysis ?? passage.analysis,
      difficulty: result?.analysis.난이도 ?? passage.difficulty,
      parts: passage.parts.map((part) => ({
        ...part,
        analysis:
          result?.partAnalyses.find((partAnalysis) => partAnalysis.label === part.label)?.analysis ??
          part.analysis,
      })),
      linkCount: (mergedLinks[passage.id] ?? []).length,
    };
  });
  const mergedFacets = recomputeFacets(mergedPassages, mergedLinks, facets);
  const latestAudit = [...resultById.values()]
    .map((result) => result.auditedAt)
    .sort()
    .at(-1) ?? new Date().toISOString();
  const linkAudit = {
    auditVersion: AUDIT_VERSION,
    model: MODEL,
    analysisPromptVersion: ANALYSIS_PROMPT_VERSION,
    linkPromptVersion: LINK_PROMPT_VERSION,
    sourceSha256: SOURCE_SHA256,
    auditedAt: latestAudit,
    candidateUniverse: candidateLinks,
    passages: Object.fromEntries(
      [...resultById.entries()].map(([id, result]) => [
        id,
        {
          summary: result.auditSummary,
          candidates: result.candidateDecisions,
        },
      ]),
    ),
  };

  await atomicJson(PASSAGES_PATH, mergedPassages);
  await atomicJson(LINKS_PATH, mergedLinks);
  await atomicJson(FACETS_PATH, mergedFacets);
  await atomicJson(LINK_AUDIT_PATH, linkAudit);
  const linkAuditSha256 = createHash("sha256")
    .update(await fs.readFile(LINK_AUDIT_PATH))
    .digest("hex");
  await atomicJson(PROVENANCE_PATH, {
    sourceFile: "2027학년도 수능완성 독서.pdf",
    sourceSha256: SOURCE_SHA256,
    sourcePageCount: 41,
    sourcePagesNonEmpty: 41,
    sourcePagesUnique: 41,
    passageSetCount: mergedPassages.length,
    individualTextCount: mergedPassages.reduce(
      (sum, passage) => sum + Math.max(1, passage.parts.length),
      0,
    ),
    problemCount: Object.values(problems).reduce((sum, list) => sum + list.length, 0),
    linkCandidateCount: [...resultById.values()].reduce(
      (sum, result) => sum + result.candidateDecisions.length,
      0,
    ),
    linkedExamCount: Object.values(mergedLinks).reduce((sum, list) => sum + list.length, 0),
    analysisModel: MODEL,
    analysisGenerationModel: MODEL,
    analysisAuditModel: MODEL,
    partAnalysisModel: MODEL,
    linkAuditModel: MODEL,
    auditVersion: AUDIT_VERSION,
    analysisPromptVersion: ANALYSIS_PROMPT_VERSION,
    linkPromptVersion: LINK_PROMPT_VERSION,
    linkAuditArtifact: "link-audit.json",
    linkAuditSha256,
    auditedAt: latestAudit,
    method:
      "Claude Sonnet이 41쪽 PDF 전수 전사본과 85개 원문 문항만으로 18개 통합 분석을 모두 처음부터 생성했고, 별도 Sonnet 반증 호출이 21필드의 원문·stem·보기·선지 정합성을 다시 감사해 pass한 결과만 채택했다. 5개 복합 세트의 (가)/(나) 10개 부분 분석은 직전 Sonnet 전수 패스에서 각각 생성한 결과를 full-v2에서 축자 핵심문장·문항번호 규칙으로 다시 검증했다. 선행 광역 검색·compact 거부 감사에서 남은 후보들을 full-v2 입력으로 삼아 양쪽 실제 원문의 축자 evidence를 강제하고 keep/drop을 다시 판정했으며, 유지 링크의 공통점·차이·학습 포인트·sourceParts를 전면 재작성했다.",
    auditSummaries: Object.fromEntries(
      [...resultById.entries()].map(([id, result]) => [id, result.auditSummary]),
    ),
    analysisAuditSummaries: Object.fromEntries(
      [...resultById.entries()].map(([id, result]) => [
        id,
        result.analysisReview.auditSummary,
      ]),
    ),
    inputHashes: Object.fromEntries(
      passages.map((passage) => [
        passage.id,
        sha256Json({
          analysis: analysisInputHash(passage, problems[passage.id] ?? []),
          links: linkInputHash(passage, candidateLinks[passage.id] ?? [], examById),
        }),
      ]),
    ),
  });
  console.log(
    `merged passages=${mergedPassages.length} texts=${String(mergedFacets.totalTexts)} links=${String(
      mergedFacets.totalLinks,
    )}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
