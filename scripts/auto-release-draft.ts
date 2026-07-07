/**
 * 배포 시 자동 소식 초안 생성 (관리자 승인형).
 *
 * Vercel 빌드 단계(prebuild)에서 실행된다. 마지막 처리 커밋 이후의 변경(커밋
 * 메시지 + 변경 파일)을 모아 AI에게 넘겨 "스모트 소식" 초안을 만들고, 상태를
 * DRAFT 로 저장한다. 관리자가 /admin/announcements 에서 검토·수정 후 발행해야
 * 이용자에게 노출된다.
 *
 * 안전:
 *  - 프로덕션(VERCEL_ENV=production) 또는 수동(AUTO_DRAFT_FORCE=1)일 때만 동작.
 *  - 어떤 오류가 나도 빌드를 실패시키지 않는다(항상 exit 0).
 *  - releaseSlug=auto-<HEAD7> 로 멱등(같은 배포 재빌드 시 중복 초안 없음).
 *  - AI 가 "이용자에게 알릴 변화 없음"으로 판단하면 초안을 만들지 않는다.
 */
import { execSync } from "node:child_process";

const FORCE = process.env.AUTO_DRAFT_FORCE === "1";
const IS_PROD = process.env.VERCEL_ENV === "production";

const SYSTEM_PROMPT = `당신은 영어·국어 학원용 AI 학습자료 서비스 "스모트"의 업데이트 소식을 쓰는 편집자입니다.
독자는 개발을 전혀 모르는 원장·강사·학생·학부모입니다. 중학생이 읽어도 이해돼야 합니다.
아래 커밋 메시지와 변경 파일 목록을 보고, 이용자에게 알릴 만한 변화가 있으면 소식 초안을 씁니다.

규칙:
1. 기술 용어 절대 금지. OCR→"사진·PDF에서 글자를 자동으로 읽어오는 기능", 렌더링·모달·파이프라인·리팩터·마이그레이션·API·버그·배포·커밋 같은 개발 용어 금지, HWPX→"한글(HWP) 파일", DOCX→"워드 파일".
2. 커밋 어휘(WIP·머지·fix·refactor·flag 등)와 내부 정보(서버 비용·보안·오류 원인·파일명·개발 도구명)를 절대 노출하지 않습니다.
3. "무엇을 개발했다"가 아니라 "이제 무엇을 할 수 있다" 혜택 중심으로 씁니다.
4. 밝고 친근한 존댓말(습니다체)로, 제목과 핵심 문장에는 느낌표를 자연스럽게 씁니다. 제목은 20자 이내.
5. 구성: 요약 한 문장 → 불릿 2~5개(각 불릿은 "- "로 시작).
6. 사소한 내부 변경(리팩터·의존성·테스트·설정·오타 수정)만 있으면 hasUserFacingChanges=false 로 하고 초안을 만들지 않습니다.
7. 확실하지 않은 내용은 지어내지 말고, 커밋에서 분명히 드러난 사실만 씁니다.

반드시 아래 JSON "하나만" 출력하세요(코드블록·설명 금지):
{"hasUserFacingChanges": true, "title": "20자 이내 제목!", "category": "UPDATE", "body": "요약 문장!\\n\\n- 불릿1\\n- 불릿2"}
category 는 UPDATE | MAINTENANCE | EVENT | GENERAL 중 하나.`;

function safeGit(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

interface Changes {
  commits: string[];
  files: string[];
}

const NOISE = /^(release-notes\/|package-lock|pnpm-lock|yarn\.lock|\.next\/|node_modules\/|prisma\/backups\/)/;

function collectChanges(lastSha: string, headSha: string): Changes {
  const haveLast =
    !!lastSha && safeGit(`git cat-file -t ${lastSha}`) === "commit" && lastSha !== headSha;
  const range = haveLast ? `${lastSha}..${headSha}` : "";

  const logRaw = range
    ? safeGit(`git log ${range} --no-merges --format=%s`)
    : safeGit(`git log -n 20 --no-merges --format=%s`);
  const commits = logRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  const filesRaw = range
    ? safeGit(`git diff --name-only ${range}`)
    : safeGit(`git show --name-only --format= ${headSha}`);
  const files = filesRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !NOISE.test(f))
    .slice(0, 100);

  return { commits, files };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const brace = text.match(/\{[\s\S]*\}/);
  return (brace ? brace[0] : text).trim();
}

interface Draft {
  hasUserFacingChanges: boolean;
  title?: string;
  category?: string;
  body?: string;
}

async function aiDraft(changes: Changes): Promise<Draft | null> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.ATLASCLOUD_API_KEY;
  if (!apiKey) {
    console.log("[auto-draft] AI 키 없음(OPENROUTER_API_KEY) — 건너뜀");
    return null;
  }
  const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const model =
    process.env.OPENROUTER_STANDARD_MODEL ||
    process.env.OPENROUTER_GEMINI_FLASH_MODEL ||
    "google/gemini-3.5-flash";

  const userPrompt = [
    "이번 배포의 변경 내역입니다.",
    "",
    "[커밋 메시지]",
    changes.commits.length ? changes.commits.map((c) => `- ${c}`).join("\n") : "(없음)",
    "",
    "[변경된 파일(일부)]",
    changes.files.length ? changes.files.join("\n") : "(없음)",
    "",
    "위 내용을 바탕으로 이용자용 소식 초안을 JSON 으로 작성하세요.",
  ].join("\n");

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Title": "smoat-release-draft",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      console.log("[auto-draft] AI 응답 실패:", res.status);
      return null;
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    if (!text) return null;
    return JSON.parse(extractJson(text)) as Draft;
  } catch (err) {
    console.log("[auto-draft] AI 호출 오류:", (err as Error)?.message);
    return null;
  }
}

function normalizeCategory(c: string | undefined): string {
  const up = (c ?? "").toUpperCase();
  return ["UPDATE", "MAINTENANCE", "EVENT", "GENERAL"].includes(up) ? up : "UPDATE";
}

async function main() {
  if (!IS_PROD && !FORCE) {
    console.log(
      "[auto-draft] 프로덕션 배포가 아니라 건너뜁니다. (수동 실행: AUTO_DRAFT_FORCE=1)",
    );
    return;
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    const headSha = safeGit("git rev-parse HEAD") || process.env.VERCEL_GIT_COMMIT_SHA || "";
    if (!headSha) {
      console.log("[auto-draft] HEAD 커밋을 알 수 없어 건너뜁니다.");
      return;
    }
    const slug = `auto-${headSha.slice(0, 7)}`;

    const exists = await prisma.platformAnnouncement.findUnique({
      where: { releaseSlug: slug },
      select: { id: true },
    });
    if (exists) {
      console.log("[auto-draft] 이미 초안이 있습니다:", slug);
      return;
    }

    const pointer = await prisma.platformSetting.findUnique({
      where: { key: "lastAutoDraftSha" },
    });
    const lastSha = pointer?.value ?? "";

    const changes = collectChanges(lastSha, headSha);
    if (!changes.commits.length && !changes.files.length) {
      console.log("[auto-draft] 감지된 변경이 없어 건너뜁니다.");
      await savePointer(prisma, headSha);
      return;
    }

    const draft = await aiDraft(changes);
    if (!draft) {
      console.log("[auto-draft] 초안 생성 불가(AI 미응답). 포인터는 갱신하지 않음(다음 배포에서 재시도).");
      return;
    }
    if (!draft.hasUserFacingChanges || !draft.title || !draft.body) {
      console.log("[auto-draft] 이용자에게 알릴 변화 없음 — 초안 생성 안 함.");
      await savePointer(prisma, headSha);
      return;
    }

    await prisma.platformAnnouncement.create({
      data: {
        title: draft.title.slice(0, 200),
        content: draft.body,
        category: normalizeCategory(draft.category),
        status: "DRAFT",
        publishedAt: null,
        isPinned: false,
        audiences: "ALL",
        sourceType: "AUTO",
        releaseSlug: slug,
      },
    });
    console.log(`[auto-draft] DRAFT 생성 완료: "${draft.title}" (승인 대기)`);
    await savePointer(prisma, headSha);
  } finally {
    await prisma.$disconnect();
  }
}

async function savePointer(
  prisma: { platformSetting: { upsert: (a: unknown) => Promise<unknown> } },
  sha: string,
) {
  await prisma.platformSetting.upsert({
    where: { key: "lastAutoDraftSha" },
    update: { value: sha },
    create: { key: "lastAutoDraftSha", value: sha },
  });
}

main()
  .catch((e) => console.error("[auto-draft] 오류(무시하고 빌드 계속):", (e as Error)?.message))
  .finally(() => process.exit(0));
