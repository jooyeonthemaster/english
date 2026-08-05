import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ATLAS_OCR_MODEL_ID } from "@/lib/atlas-ai";
import { postAtlasChatCompletionAsGeminiLike } from "@/lib/atlas-chat-rest";
import { getStaffSession } from "@/lib/auth";
import { ACCEPTED_IMAGE_MIMES } from "@/lib/extraction/constants";
import { prepareLlmImages } from "@/lib/exam-report/llm-images";
import type { MaterialRole } from "@/lib/passage-authoring/schema";
import { recordAiCost } from "@/lib/platform-api-costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============================================================================
// POST /api/workbench/passage-authoring/read-material — 자료 이미지 → 텍스트
//
// AI 지문 생성의 입력은 전부 "텍스트"다(schema.ts §1). 텍스트 파일·docx·xlsx·
// hwpx 는 브라우저에서 바로 풀리지만(material-readers.ts), PDF 페이지와 사진은
// 시각 판독이 필요해 여기로 온다. 클라이언트가 페이지를 이미지로 만들어 배치로
// 보내고(현재 PDF 는 2쪽/배치, 라우트 상한은 4장), 여기서 판독 모델 1콜로 글자를
// 그대로 옮긴다.
//
// 설계 계약:
//   - **무료**: 크레딧을 차감하지 않는다. 자료를 붙이는 행위 자체에 값을 매기면
//     선생님이 자료를 안 붙이고, 그러면 생성 품질이 떨어진다. 원가는 recordAiCost
//     (operationType=TEXT_EXTRACTION)로만 남긴다.
//   - **판독만**: 요약·번역·해석 금지. 선생님이 "AI 가 무엇을 읽었는지"를 눈으로
//     확인하고 고칠 수 있어야 하므로, 이 단계에서 의미를 건드리면 안 된다.
//     (서식 표시 **강조**·[BOX]·마크다운 표는 "의미를 건드리는 것"이 아니라
//      원본에 있던 시각 정보를 텍스트로 보존하는 것이다 — 밑줄·굵게·네모 박스는
//      어법 자료에서 정답 위치 그 자체라 소실되면 자료가 무의미해진다.)
//   - **잘림은 조용히 삼키지 않는다**: candidates[0].finishReason === "MAX_TOKENS"
//     이면 { truncated: true } 를 함께 돌려준다. 이 값은 atlas-chat-rest.ts:280
//     (normalizeFinishReason: "length" → "MAX_TOKENS")이 이미 매핑해 주고 있었는데
//     여태 버리고 있었다. 밀도 높은 교재 4쪽은 출력 예산을 넘겨 **뒷쪽이 조용히
//     사라졌고**, 화면에는 성공으로 보였다. 출력 예산 자체도 12,000 → 24,000 으로
//     올리고(배치 2쪽화와 이중 안전) 그래도 넘치면 사용자에게 알린다.
//   - **꼬리줄 [[ROLE=…]] [[LAYOUT=…]]**: 같은 콜의 **출력 20토큰**이다. 추가 LLM
//     콜이 아니다(아래 :237 계약 주석 참조). 콜 수·과금은 불변이다.
//   - **남용 가드**: 이미지 판독은 무료여도 원가가 든다. 학원당 60초 창에서
//     **장수(60장)와 콜 수(20콜)를 함께** 세어 429 를 돌려준다. 장수만 세면
//     1장짜리 요청 반복으로 콜 단위 원가(콜당 최대 24,000 출력 토큰)를 4배까지
//     통과시킨다 — 크레딧이 0인 라우트라 경제적 상한이 없어 그대로 플랫폼 손실이다.
//     ⚠️ 남은 한계: 모듈 스코프 Map 은 인스턴스별 근사치라 다중 인스턴스에서는
//     배수만큼 통과한다. 완전 차단은 DB/KV 기반 일일 상한이 필요하다(후속 과제).
// ============================================================================

// ── 요청 계약 ───────────────────────────────────────────────────────────────

/** base64 문자열 상한(문자 수). 디코드 시 약 6MB — Vercel 요청 본문 예산 안. */
const MAX_BASE64_CHARS = 8 * 1024 * 1024;

/**
 * 한 콜에 실을 수 있는 페이지/사진 수. 다중 이미지 verbatim 충실도 임계.
 * ※ 클라이언트(material-readers)는 해상도 상향과 함께 배치를 2쪽으로 줄였지만,
 *   이 값은 **라우트의 방어 상한**이라 4 로 둔다(사진 여러 장 경로도 통과해야 한다).
 */
const MAX_IMAGES_PER_CALL = 4;

const readMaterialRequestSchema = z.object({
  images: z
    .array(
      z.object({
        mimeType: z.string().min(1).max(100),
        base64: z.string().min(1).max(MAX_BASE64_CHARS),
      }),
    )
    .min(1)
    .max(MAX_IMAGES_PER_CALL),
  name: z.string().max(200).optional(),
  kind: z.enum(["PDF_PAGES", "IMAGE"]),
});

// ── 남용 가드(학원당 슬라이딩 윈도우) ───────────────────────────────────────
// ⚠️ 모듈 스코프 Map 이므로 서버리스 **인스턴스별 근사치**다. 인스턴스가 여러 개면
// 실제 허용량은 그 배수가 된다. 정밀한 쿼터가 아니라 "실수로 100쪽 PDF 를 연달아
// 던지는" 사고를 막는 안전핀이 목적이라 이 정도면 충분하다(DB 왕복 없이 0ms).

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_IMAGES_PER_WINDOW = 60;

/**
 * 콜 수 상한. 이미지 장수만 세면 원가 구조와 어긋난다 — 실제 원가는 콜당
 * 프롬프트 + 최대 24,000 출력 토큰이 지배하므로 1장짜리 요청을 반복하면 의도
 * (4장×15콜)의 4배인 60콜/분이 통과한다. 그래서 장수와 **콜 수**를 함께 센다.
 * 정상 사용의 상한: PDF 20쪽 = 10콜(2쪽 배치), 사진 12장(자료 상한) = 12콜.
 * 20콜은 그 둘 중 큰 쪽을 여전히 덮는다.
 */
const RATE_MAX_CALLS_PER_WINDOW = 20;

interface RateBucket {
  /** 이미지 1장당 타임스탬프 1개. */
  images: number[];
  /** 콜 1건당 타임스탬프 1개. */
  calls: number[];
}

const rateWindow = new Map<string, RateBucket>();

function prune(stamps: number[], cutoff: number): number[] {
  return stamps.filter((stamp) => stamp > cutoff);
}

function consumeRateBudget(academyId: string, images: number): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  // 만료된 버킷은 훑는 김에 버린다 — 장수 인스턴스에서 Map 이 무한히 자라지 않게.
  for (const [key, bucket] of rateWindow) {
    const alive: RateBucket = {
      images: prune(bucket.images, cutoff),
      calls: prune(bucket.calls, cutoff),
    };
    if (alive.images.length === 0 && alive.calls.length === 0) {
      rateWindow.delete(key);
    } else {
      rateWindow.set(key, alive);
    }
  }

  const current = rateWindow.get(academyId) ?? { images: [], calls: [] };
  if (current.images.length + images > RATE_MAX_IMAGES_PER_WINDOW) return false;
  if (current.calls.length + 1 > RATE_MAX_CALLS_PER_WINDOW) return false;
  for (let i = 0; i < images; i += 1) current.images.push(now);
  current.calls.push(now);
  rateWindow.set(academyId, current);
  return true;
}

// ── 판독 프롬프트 ───────────────────────────────────────────────────────────

const READ_SYSTEM_PROMPT = [
  "You are a precise document transcription engine.",
  "You copy the characters you see. You never summarise, translate, or explain.",
].join(" ");

/**
 * 꼬리줄이 제시하는 역할 후보. `satisfies` 로 schema.ts 의 MaterialRole 과
 * 컴파일 타임에 묶어 둔다 — 역할 축이 바뀌면 여기서 타입 에러가 난다.
 * ※ SOURCE_TO_VARY 처럼 "선생님의 의도"에 속하는 역할은 일부러 넣지 않는다.
 *   페이지 그림만 보고는 판정할 수 없어서, 넣으면 오분류만 늘어난다.
 */
const READ_ROLE_TAGS = [
  "GRAMMAR_POINTS",
  "VOCABULARY",
  "SOURCE_PASSAGE",
  "TOPIC_BRIEF",
  "STYLE_SAMPLE",
  "EXAM_SAMPLE",
  "OTHER",
] as const satisfies readonly MaterialRole[];

/**
 * 지면 형태. 하이브리드(생성 콜에 원본 페이지 이미지를 함께 보낼지)의 기본값을
 * 이 값으로 정한다 — TABLE_HEAVY·DIAGRAM 이면 텍스트만으로는 뜻이 통하지 않는다.
 * ※ 타입을 export 하지 않는 이유: route.ts 는 Next 가 export 형상을 검사하는
 *   파일이라 부수 export 를 두지 않는다. 소비자는 응답 JSON 을 자기 쪽에서 좁힌다.
 */
const READ_LAYOUT_TAGS = ["TABLE_HEAVY", "DIAGRAM", "PLAIN"] as const;
type MaterialLayout = (typeof READ_LAYOUT_TAGS)[number];

function buildReadPrompt(kind: "PDF_PAGES" | "IMAGE", name: string): string {
  return [
    "이미지 속 글자를 있는 그대로 텍스트로 옮겨라.",
    "",
    "규칙:",
    "- 보이는 글자를 그대로 옮긴다. 요약·번역·해석·교정을 하지 마라.",
    "- 한국어 자료는 한국어 그대로, 영어 자료는 영어 그대로 둔다.",
    "- 줄바꿈과 문단 구분을 원본대로 유지한다.",
    // 서식: 어법 자료에서 밑줄·굵게는 "정답 위치" 그 자체다. 표시를 잃으면
    // 자료가 통째로 쓸모없어지므로 텍스트로 보존한다.
    "- 밑줄·굵게·색으로 강조된 부분은 **표시**로 감싼다(예: **has been**).",
    "- 네모 박스로 묶인 부분은 [BOX] 와 [/BOX] 사이에 옮긴다.",
    // 표: 탭 구분은 붙여넣기·재렌더에서 열이 어긋나 사실상 복원 불가였다.
    "- 표는 마크다운 파이프 테이블로 옮긴다(헤더 아래 |---|---| 구분선 포함).",
    "- 병합된 셀은 비워 두지 말고 값을 반복해 채운다.",
    kind === "PDF_PAGES"
      ? "- 여러 페이지가 들어오면 페이지 순서대로 옮기고, 페이지 사이는 빈 줄 하나로 나눈다."
      : "- 사진이 기울어졌거나 일부가 잘렸어도 읽히는 글자만 옮긴다.",
    "- 머리말·쪽번호처럼 본문과 무관한 요소는 생략해도 된다.",
    "- 설명 문장이나 코드블록 없이 옮긴 텍스트만 출력한다.",
    "",
    // 꼬리줄 — 같은 콜의 출력 20토큰. 추가 콜이 아니다(:237 계약 주석 참조).
    "마지막으로, 옮긴 텍스트 맨 끝에 빈 줄 하나를 두고 아래 두 표시를 붙여라.",
    `[[ROLE=${READ_ROLE_TAGS.join("|")}]]`,
    `[[LAYOUT=${READ_LAYOUT_TAGS.join("|")}]]`,
    "각 표시에서 해당하는 값 하나만 남긴다. 예: [[ROLE=EXAM_SAMPLE]] [[LAYOUT=TABLE_HEAVY]]",
    "",
    "ROLE 기준:",
    "- GRAMMAR_POINTS: 어법·문법 규칙 설명이나 어법 문제 모음",
    "- VOCABULARY: 표제어와 뜻이 나열된 단어장",
    "- SOURCE_PASSAGE: 문제 없이 지문(본문)만 있는 자료",
    "- TOPIC_BRIEF: 주제·요구사항·수업 계획 같은 지시성 메모",
    "- STYLE_SAMPLE: 특정 문체를 보여 주는 글",
    "- EXAM_SAMPLE: 문항 번호·선지(①②③④⑤)·정답표가 있는 시험지나 기출",
    "- OTHER: 위 어디에도 뚜렷하게 속하지 않음",
    "",
    "LAYOUT 기준:",
    "- TABLE_HEAVY: 표나 격자가 지면의 상당 부분을 차지함",
    "- DIAGRAM: 그림·도식·그래프가 있어 글자만으로는 뜻이 통하지 않음",
    "- PLAIN: 글줄 위주",
    "",
    name ? `자료 이름: ${name}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── 꼬리줄 파싱 ─────────────────────────────────────────────────────────────

/** 꼬리줄을 찾을 범위(끝에서 이만큼). 본문 한복판의 위조 마커를 채택하지 않는다. */
const TAIL_SCAN_CHARS = 400;

interface ParsedTail {
  text: string;
  role?: MaterialRole;
  layout?: MaterialLayout;
}

/**
 * [[ROLE=…]] · [[LAYOUT=…]] 을 읽어 내고 본문에서는 지운다.
 *
 * 인젝션 방어 두 겹:
 *   ① **채택**은 꼬리 구간(끝 400자)에서 발견한 값만. 자료 이미지 한복판에
 *      "[[ROLE=…]]" 가 인쇄돼 있어도 역할이 뒤집히지 않는다.
 *   ② **제거**는 위치를 가리지 않는다. 위조 마커가 본문에 남아 생성 프롬프트까지
 *      흘러 들어가면 그쪽에서 또 다른 표면이 된다.
 * 값에 "|" 가 남아 있으면(=템플릿을 그대로 뱉음) 무효로 본다.
 */
function parseReadTail(raw: string): ParsedTail {
  const marker = /\[\[\s*(ROLE|LAYOUT)\s*=\s*([^\]]*?)\s*\]\]/g;
  const tailStart = Math.max(0, raw.length - TAIL_SCAN_CHARS);

  let role: MaterialRole | undefined;
  let layout: MaterialLayout | undefined;

  for (const match of raw.matchAll(marker)) {
    if ((match.index ?? 0) < tailStart) continue;
    const value = (match[2] ?? "").trim().toUpperCase();
    if (!value || value.includes("|")) continue;
    if (match[1] === "ROLE") {
      if ((READ_ROLE_TAGS as readonly string[]).includes(value)) {
        role = value as MaterialRole;
      }
      continue;
    }
    if ((READ_LAYOUT_TAGS as readonly string[]).includes(value)) {
      layout = value as MaterialLayout;
    }
  }

  return { text: raw.replace(marker, "").trim(), role, layout };
}

// ── 핸들러 ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 지연 계측 — 클라(material-readers.logRead)는 **총 시간**만 알고, 그 안에서
  // 업로드·서버·모델이 각각 얼마인지는 아무도 몰랐다. 그래서 "판독이 느리다"의
  // 원인이 늘 추정으로만 말해졌다(그 추정이 틀린 채로 설계 판단에 쓰였다).
  // 두 숫자를 함께 남기면 그 자리에서 갈린다:
  //   총 − 모델 ≈ 업로드 + 콜드스타트 + 재압축   /   모델 = 축자 전사 자체
  // 개인정보 없는 숫자만 남긴다(본문·파일명 금지 — logRead 와 같은 규칙).
  const receivedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const parsed = readMaterialRequestSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const { images, kind } = parsed.data;
  const name = (parsed.data.name ?? "").trim();

  const unsupported = images.find(
    (image) =>
      !(ACCEPTED_IMAGE_MIMES as readonly string[]).includes(image.mimeType),
  );
  if (unsupported) {
    return NextResponse.json(
      { error: "JPG·PNG·WEBP 이미지만 판독할 수 있습니다." },
      { status: 400 },
    );
  }

  if (!consumeRateBudget(staff.academyId, images.length)) {
    return NextResponse.json(
      {
        error:
          "자료 판독 요청이 너무 많습니다. 1분 뒤에 다시 시도해 주세요.",
      },
      { status: 429 },
    );
  }

  const buffers = images.map((image) => Buffer.from(image.base64, "base64"));
  if (buffers.some((buffer) => buffer.byteLength === 0)) {
    return NextResponse.json(
      { error: "이미지 데이터를 읽지 못했습니다. 다시 올려 주세요." },
      { status: 400 },
    );
  }

  try {
    // 총 12MB 예산으로 재압축 — 원본 카메라 사진 여러 장이면 게이트웨이가 502 를
    // 돌려주는 실측 사례가 있어 전송 전에 반드시 통과시킨다(llm-images.ts).
    const prepared = await prepareLlmImages(buffers);
    const preparedAt = Date.now();

    const response = await postAtlasChatCompletionAsGeminiLike({
      model: ATLAS_OCR_MODEL_ID,
      systemPrompt: READ_SYSTEM_PROMPT,
      userPrompt: buildReadPrompt(kind, name),
      images: prepared,
      temperature: 0,
      // 12,000 은 밀도 높은 교재 4쪽에서 실제로 모자랐다(뒷쪽 조용한 소실).
      // 배치 2쪽화(material-readers)와 함께 이중 안전으로 24,000 으로 올린다.
      maxOutputTokens: 24_000,
      timeoutInMs: 90_000,
    });
    const modelMs = Date.now() - preparedAt;

    // 원가는 성공·부분성공 여부와 무관하게 먼저 남긴다(호출이 일어났으므로).
    await recordAiCost({
      sourceType: "AI_INTERACTIVE",
      sourceDetail: "passage-authoring-read-material",
      academyId: staff.academyId,
      model: ATLAS_OCR_MODEL_ID,
      operationType: "TEXT_EXTRACTION",
      // Gemini-like 응답 전체를 넘긴다 — readAiUsageTokens 가 중첩 usageMetadata
      // (promptTokenCount/candidatesTokenCount·costUsd)를 그대로 훑는다.
      usage: response,
    });

    if (response.error?.message) {
      throw new Error(response.error.message);
    }

    const raw = (response.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    // (critical) 출력 예산 초과 = 뒷쪽 소실. 이걸 버리면 화면에는 성공으로 보이고
    // 실제로는 교재 뒷장이 통째로 사라진다. atlas-chat-rest 가 finish_reason
    // "length" 를 "MAX_TOKENS" 로 정규화해 이미 실어 준다.
    const truncated = response.candidates?.[0]?.finishReason === "MAX_TOKENS";

    // 잘린 응답은 꼬리줄까지 잘려 나가므로 role/layout 이 비는 것이 정상이다.
    const { text, role, layout } = parseReadTail(raw);

    // 계측 한 줄. 출력 토큰 수가 이 콜의 지연을 지배하는지(=축자 전사가 원인인지),
    // 아니면 그 앞 구간(업로드·콜드스타트·재압축)이 원인인지를 이 줄 하나로 가른다.
    // usage 는 게이트웨이 응답 모양에 따라 없을 수 있어 방어적으로 읽는다.
    const usage = (response as { usageMetadata?: Record<string, unknown> })
      .usageMetadata;
    const outTokens =
      typeof usage?.candidatesTokenCount === "number"
        ? usage.candidatesTokenCount
        : null;
    console.log("[passage-authoring:read-material]", {
      kind,
      images: images.length,
      model: ATLAS_OCR_MODEL_ID,
      // 총 − 모델 = 업로드 수신 + 인증 + 재압축 (+ 콜드스타트).
      totalMs: Date.now() - receivedAt,
      modelMs,
      outputChars: text.length,
      outputTokens: outTokens,
      truncated,
    });

    if (!text) {
      return NextResponse.json(
        {
          error:
            "이미지에서 글자를 찾지 못했어요. 더 밝고 선명한 사진으로 다시 올려 주세요.",
        },
        { status: 502 },
      );
    }

    // 자료마다 **추가 LLM 콜**을 붙이지 않는다는 계약은 그대로다. 파일 하나 붙일
    // 때마다 별도 분류 콜이 붙으면 "붙이는 행위 자체가 과금"이 되기 때문이다.
    // 규제 대상은 **콜 수**이며, 같은 콜의 출력 끝에 20토큰짜리 꼬리줄
    // ([[ROLE=…]] [[LAYOUT=…]])을 얹는 것은 그 대상이 아니다 — 콜 수·과금 불변,
    // 증가분은 출력 토큰 약 20개뿐이다.
    // 이 값을 서버가 주는 이유: 클라이언트 키워드 휴리스틱
    // (material-intake.guessMaterialRole)이 경계 없는 includes 로 기출 시험지를
    // 단어장으로 잡아 커버리지가 "200개 중 3개(2%)"라는 거짓 신호를 냈다. 지면을
    // 실제로 본 판정이 그보다 낫다. roleLocked(선생님이 직접 고른 상태)면 여전히
    // 사용자 값이 우선이다.
    return NextResponse.json({ text, role, layout, truncated });
  } catch (error) {
    console.error("[passage-authoring:read-material] 판독 실패", error);
    return NextResponse.json(
      { error: "자료 판독에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
