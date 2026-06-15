/**
 * 커스텀 유형 v2(FormatSpec 계약) 생성 감사 — 실제 Gemini 호출.
 *
 * 괴랄한 내신 형식 6종(표 매칭 선지·3칸 연결어 조합·어법 기호 2개 조합·서술형 조건+답슬롯·
 * 안내문 불일치·순서배열)을 FormatSpec 으로 정의하고 generateFromCustomType 를 돌려:
 *  1) 형식 계약 게이트 통과율(재시도 포함)
 *  2) 조립된 questionText(시험지/DOCX/HWPX 가 먹는 DSL) 형태
 *  3) LayoutDoc 구조(웹 고충실도 렌더 페이로드)
 * 를 검사한다.
 *
 * 실행: npx tsx scripts/audit-custom-layout-generation.ts [fixtureKey ...]
 * 결과: scripts/_gen_audit_out/custom-layout-<ts>.json + 콘솔 요약
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

import { generateFromCustomType } from "../src/lib/custom-question-types/generator";
import { parseFormatSpec } from "../src/lib/custom-question-types/format-spec";
import { parseCompiledCustomType } from "../src/lib/custom-question-types/types";
import type { CompiledCustomType } from "../src/lib/custom-question-types/types";

const PASSAGE = [
  "We are taught from an early age that \"sharing is caring.\" Thanks to popular websites and apps,",
  "people can share their cars, their spare bedrooms, their power tools, and even their own time and talents.",
  "Because both parties review each other, these digital platforms create a trusting environment even among",
  "complete strangers. According to one of its earliest supporters, author Rachel Botsman, the gig economy",
  "takes advantage of \"idle capacity\" to better utilize assets. This should be good for the owner, the",
  "community, and the environment. However, most of the major players in the new sharing economy are",
  "for-profit companies, and they take a cut of every transaction. While some sites continue to offer true",
  "sharing, most are in fact selling a product, much like a traditional business. With so much money at stake,",
  "the new world of work can be a dark, unfriendly place.",
].join(" ");

const NOTICE_PASSAGE = [
  "The Riverside Community Center is hosting its annual Spring Book Festival on May 9, from 10 a.m. to 5 p.m.",
  "at Emton Park. The festival features free book swaps between 1 p.m. and 3 p.m., storytelling sessions",
  "throughout the day, and bookmark-making classes for children. There is no entry fee, and parking is",
  "available for free. For the full schedule, visit the community center website.",
].join(" ");

interface Fixture {
  key: string;
  name: string;
  passage: string;
  spec: CompiledCustomType;
}

function makeSpec(args: {
  prompt: string;
  invariants: string[];
  variableAxes: string[];
  format: unknown;
  passageBased?: boolean;
  answerShape?: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "OTHER";
  optionCount?: number;
  correctAnswerCount?: number;
}): CompiledCustomType {
  return parseCompiledCustomType({
    specFormat: 2,
    tier: "GENERIC",
    passageBased: args.passageBased ?? true,
    stimulusKind: "PASSAGE",
    answerShape: args.answerShape ?? "MULTIPLE_CHOICE",
    optionCount: args.optionCount ?? 5,
    correctAnswerCount: args.correctAnswerCount ?? 1,
    difficulty: "INTERMEDIATE",
    invariants: args.invariants,
    variableAxes: args.variableAxes,
    prompt: args.prompt,
    format: parseFormatSpec(args.format),
  });
}

const FIXTURES: Fixture[] = [
  {
    key: "word-table",
    name: "단어/구-뜻 표 매칭(ⓐ~ⓔ 밑줄 + 표 선지)",
    passage: PASSAGE,
    spec: makeSpec({
      prompt:
        "지문에서 핵심 어휘/구 5개를 골라 ⓐ~ⓔ 라벨 밑줄로 표시하고, 각 어휘의 문맥 의미를 영어 정의로 묻는 표 형태 문항을 만든다. 정답 1개는 문맥상 옳은 정의, 오답 4개는 해당 어휘의 다른 의미·반대 의미·그럴듯한 오정의.",
      invariants: [
        "지문 속 5개 어휘/구에 ⓐ~ⓔ 라벨 밑줄",
        "선지는 [어휘 | 영어 정의] 2열 표의 행",
        "오답 정의는 사전적이지만 문맥과 불일치해야 함",
      ],
      variableAxes: ["타겟 어휘 5개", "정답 위치", "오정의 방식"],
      format: {
        stem: { pattern: "다음 글의 밑줄 친 단어/구의 문맥상 의미로 가장 적절한 것은?", language: "ko" },
        stimulus: {
          present: true,
          form: "PASSAGE",
          boxed: true,
          underlineMarks: { count: 5, labelStyle: "CIRCLED_ALPHA_LOWER", target: "핵심 어휘/구" },
          language: "en",
        },
        choices: {
          present: true,
          count: 5,
          markerStyle: "CIRCLED_NUM",
          layout: "TABLE",
          itemPattern: "TABLE_ROW",
          columnHeaders: ["Word / Phrase", "Meaning"],
          language: "en",
        },
        answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
      },
    }),
  },
  {
    key: "triple-connector",
    name: "(X)(Y)(Z) 연결어 3칸 조합",
    passage: PASSAGE,
    spec: makeSpec({
      prompt:
        "지문을 재구성해 흐름상 연결어가 들어갈 자리 3곳을 (X), (Y), (Z) 빈칸으로 만들고, 연결어 3개 조합 선지 5개 중 문맥에 맞는 조합 1개를 고르게 한다.",
      invariants: [
        "빈칸 3개에 라벨 (X)(Y)(Z)",
        "선지는 연결어 3개 조합(표 형태)",
        "오답은 1~2칸만 맞는 그럴듯한 조합",
      ],
      variableAxes: ["빈칸 위치", "연결어 후보 풀"],
      format: {
        stem: { pattern: "위 글의 (X), (Y), (Z)에 들어갈 말로 가장 적절한 것은?", language: "ko" },
        stimulus: {
          present: true,
          form: "PASSAGE",
          blanks: { count: 3, labelStyle: "PAREN_ALPHA_UPPER", renderStyle: "LABELED_UNDERSCORES" },
          language: "en",
        },
        choices: {
          present: true,
          count: 5,
          markerStyle: "CIRCLED_NUM",
          layout: "TABLE",
          itemPattern: "TRIPLE",
          columnHeaders: ["(X)", "(Y)", "(Z)"],
          language: "en",
        },
        answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
      },
    }),
  },
  {
    key: "grammar-combo",
    name: "어법 ⓐ~ⓔ 틀린 것 2개 조합 선지",
    passage: PASSAGE,
    spec: makeSpec({
      prompt:
        "지문 문장들에 어법 요소 5곳을 ⓐ~ⓔ 라벨 밑줄로 표시하되 그중 정확히 2곳을 어법상 틀리게 변형한다. 선지는 틀린 기호 2개 조합 5개이고 정답은 실제 틀린 2곳의 조합 1개.",
      invariants: [
        "ⓐ~ⓔ 5개 라벨 밑줄, 정확히 2곳이 어법 오류",
        "선지는 기호 2개 조합(예: ⓐ, ⓒ)",
        "오답 조합은 옳은 기호를 포함",
      ],
      variableAxes: ["오류를 심을 어법 포인트", "조합 구성"],
      format: {
        stem: {
          pattern: "다음 글의 밑줄 친 ⓐ~ⓔ 중, 어법상 틀린 것끼리 짝지어진 것은?",
          language: "ko",
          negativeForm: true,
        },
        stimulus: {
          present: true,
          form: "PASSAGE",
          underlineMarks: { count: 5, labelStyle: "CIRCLED_ALPHA_LOWER", target: "어법 요소(동사형·관계사·분사 등)" },
          language: "en",
        },
        choices: {
          present: true,
          count: 5,
          markerStyle: "CIRCLED_NUM",
          layout: "INLINE",
          itemPattern: "COMBINATION",
          language: "en",
        },
        answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
        layoutNotes: ["선지의 조합은 'ⓐ, ⓒ' 처럼 콤마+공백으로 잇는다", "다섯 조합은 서로 달라야 한다"],
      },
    }),
  },
  {
    key: "essay-conditions",
    name: "서술형: 조건 박스 + (A)(B) 답 슬롯 + 답란 3줄",
    passage: PASSAGE,
    spec: makeSpec({
      answerShape: "SHORT_ANSWER",
      optionCount: 0,
      prompt:
        "지문의 핵심 문장 하나를 빈칸 2개짜리로 제시하고, 조건 2개(본문 단어 활용, 어형 변형 지시)에 맞게 (A), (B)에 들어갈 말을 쓰게 하는 서술형 문항을 만든다.",
      invariants: ["빈칸 (A), (B) 2개", "조건 정확히 2개", "모범답안은 (A)/(B) 라벨로 제시"],
      variableAxes: ["대상 문장", "조건 내용"],
      format: {
        stem: { pattern: "위 글의 빈칸 (A), (B)에 들어갈 말을 <조건>에 맞게 쓰시오.", language: "ko" },
        stimulus: {
          present: true,
          form: "PASSAGE",
          blanks: { count: 2, labelStyle: "PAREN_ALPHA_UPPER", renderStyle: "LABELED_UNDERSCORES" },
          language: "en",
        },
        boxes: [{ kind: "CONDITIONS", label: "조건", ordered: true, itemCount: 2 }],
        choices: { present: false, count: 0 },
        answer: {
          shape: "SHORT_ANSWER",
          correctCount: 1,
          subjective: {
            answerLineCount: 3,
            answerBlankCount: 2,
            blankLabelStyle: "PAREN_ALPHA_UPPER",
            answerFormat: "각 빈칸에 한 단어 또는 짧은 구",
            conditionsCount: 2,
          },
        },
      },
    }),
  },
  {
    key: "notice-mismatch",
    name: "안내문(포스터) 내용 불일치",
    passage: NOTICE_PASSAGE,
    spec: makeSpec({
      prompt:
        "지문 내용을 행사 안내문(제목 + When & Where / Highlights / Notes 섹션과 • 불릿)으로 재구성하고, 안내문과 일치하지 않는 것을 고르는 한국어 선지 5개 문항을 만든다. 오답(일치) 4개는 안내문 정보의 정확한 패러프레이즈, 정답(불일치) 1개는 수치·시간·대상 중 하나를 미세하게 비튼 것.",
      invariants: [
        "안내문은 제목 1줄 + 섹션 헤더 + • 불릿",
        "선지는 한국어 단문",
        "불일치 포인트는 수치/시간/조건의 미세 변형",
      ],
      variableAxes: ["행사 소재", "불일치 포인트 위치"],
      format: {
        stem: { pattern: "다음 안내문의 내용과 일치하지 않는 것은?", language: "ko", negativeForm: true },
        stimulus: {
          present: true,
          form: "NOTICE",
          boxed: true,
          titleLine: true,
          bulletSections: { present: true, headerCount: 3, bulletMarker: "•" },
          language: "en",
        },
        choices: { present: true, count: 5, markerStyle: "CIRCLED_NUM", layout: "VERTICAL", itemPattern: "TEXT", language: "ko" },
        answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
      },
    }),
  },
  {
    key: "order-boxed",
    name: "순서배열: 주어진 문장 + (A)(B)(C) 박스 단락 + 순서 선지",
    passage: PASSAGE,
    spec: makeSpec({
      prompt:
        "지문을 주어진 문장 1개 + 단락 (A)(B)(C) 3개로 분할해, 주어진 문장 뒤에 이어질 순서를 고르게 한다. 단락 경계는 응집 장치(대명사/연결어)가 단서가 되도록 자른다.",
      invariants: ["주어진 문장 박스", "(A)(B)(C) 단락 3개", "선지는 순서 나열 5개"],
      variableAxes: ["분할 위치", "정답 순서"],
      format: {
        stem: { pattern: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?", language: "ko" },
        stimulus: {
          present: true,
          form: "PASSAGE",
          paragraphLabels: { count: 3, style: "PAREN_ALPHA_UPPER" },
          language: "en",
        },
        boxes: [{ kind: "GIVEN", label: "주어진 문장", ordered: false, itemCount: 0 }],
        choices: { present: true, count: 5, markerStyle: "CIRCLED_NUM", layout: "TWO_COLUMN", itemPattern: "SEQUENCE", language: "en" },
        answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
      },
    }),
  },
];

interface AuditRow {
  key: string;
  name: string;
  ok: boolean;
  subType?: string;
  llmAttempts?: number;
  elapsedMs: number;
  error?: string;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  layoutBlockKinds?: string[];
  choiceLayout?: string;
  checks?: string[];
}

function postChecks(key: string, q: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const text = String(q.questionText ?? "");
  const layout = (q.layout ?? null) as { blocks?: Array<{ kind: string }>; choices?: { items?: unknown[] } } | null;
  if (!text.trim()) problems.push("questionText 비어 있음");
  if (/undefined|\[object Object\]/.test(text)) problems.push("questionText 에 직렬화 사고");
  if (key === "grammar-combo") {
    const marks = ["ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ"].filter((m) => text.includes(m)).length;
    if (marks < 5) problems.push(`본문 기호 ${marks}/5`);
  }
  if (key === "essay-conditions" && !text.includes("[조건]")) problems.push("[조건] 브래킷 누락");
  if (key === "order-boxed" && !text.includes("[주어진 문장]")) problems.push("[주어진 문장] 누락");
  if (key === "notice-mismatch" && !text.includes("•")) problems.push("불릿 누락");
  if (layout?.blocks?.length === 0) problems.push("layout.blocks 비어 있음");
  return problems;
}

async function main() {
  const filter = process.argv.slice(2);
  const targets = filter.length > 0 ? FIXTURES.filter((f) => filter.includes(f.key)) : FIXTURES;
  const rows: AuditRow[] = [];

  for (const fixture of targets) {
    const started = Date.now();
    process.stdout.write(`\n=== ${fixture.key} — ${fixture.name} ===\n`);
    try {
      const result = await generateFromCustomType({
        spec: fixture.spec,
        passage: fixture.passage,
        gradeInfo: "고2",
      });
      const q = result.question;
      const layout = (q.layout ?? null) as
        | { blocks?: Array<{ kind: string }>; choices?: { layout?: string } }
        | null;
      const checks = postChecks(fixture.key, q);
      rows.push({
        key: fixture.key,
        name: fixture.name,
        ok: checks.length === 0,
        subType: result.subType,
        llmAttempts: result.llmAttempts,
        elapsedMs: Date.now() - started,
        questionText: String(q.questionText ?? ""),
        options: Array.isArray(q.options) ? (q.options as Array<{ label: string; text: string }>) : [],
        correctAnswer: String(q.correctAnswer ?? ""),
        layoutBlockKinds: layout?.blocks?.map((b) => b.kind) ?? [],
        choiceLayout: layout?.choices?.layout ?? "",
        checks,
      });
      console.log(`subType=${result.subType} attempts=${result.llmAttempts} elapsed=${Date.now() - started}ms`);
      console.log(`layout blocks: ${(layout?.blocks ?? []).map((b) => b.kind).join(", ") || "(없음)"}`);
      console.log("--- questionText ---");
      console.log(String(q.questionText ?? "").slice(0, 1200));
      if (Array.isArray(q.options) && (q.options as unknown[]).length > 0) {
        console.log("--- options ---");
        for (const opt of q.options as Array<{ label: string; text: string }>) {
          console.log(` ${opt.label} ${opt.text}`);
        }
      }
      console.log(`정답: ${String(q.correctAnswer ?? "")}`);
      if (checks.length > 0) console.log(`!! 후행 검사 실패: ${checks.join(" / ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({
        key: fixture.key,
        name: fixture.name,
        ok: false,
        elapsedMs: Date.now() - started,
        error: message,
      });
      console.log(`!! 생성 실패: ${message}`);
    }
  }

  const outDir = path.join(process.cwd(), "scripts", "_gen_audit_out");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `custom-layout-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf8");

  const okCount = rows.filter((r) => r.ok).length;
  console.log(`\n==== 요약: ${okCount}/${rows.length} OK → ${outPath} ====`);
  for (const row of rows) {
    console.log(
      ` - ${row.ok ? "OK " : "FAIL"} ${row.key} (${row.elapsedMs}ms${row.llmAttempts ? `, ${row.llmAttempts}회 시도` : ""})${row.error ? ` — ${row.error.slice(0, 160)}` : ""}${row.checks?.length ? ` — ${row.checks.join("/")}` : ""}`,
    );
  }
  process.exit(0);
}

void main();
