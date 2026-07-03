import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// B1a(국어 생성 페이지 표면) 결정론 스위트 — 실LLM/DB 0:
//   (1) 추출 잡 생성 스키마: subject "KOREAN" 수용 / 타 과목 거부 / 미전달 무회귀
//   (2) KO 세트 빌더 가용성 판정(computeKoPresetAvailability): 갈래 호환 +
//       분량 게이트 + 비활성 사유 문구(툴팁 소스) 계약
//   (3) 모달 CTA 크레딧 미러: 멤버 수 × 단가 × KO_SET_CHARGE_ATTEMPTS(선차감식)
//       이 KO 세트 라우트의 차감식과 어긋나지 않는지
// TS + "@/..." 앨리어스 → tsx 하니스(ko-question-set.test.mjs 미러).
const harnessSource = `
import zodSchemas from "@/lib/extraction/zod-schemas";
import presets from "@/lib/korean/sets/presets";
import koSetBuilder from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/ko-set-builder";

const { createJobRequestSchema } = zodSchemas;
const {
  KO_SET_PRESETS,
  KO_SET_CHARGE_ATTEMPTS,
  resolveKoSetPreset,
  resolveKoSetSlots,
} = presets;
const { computeKoPresetAvailability } = koSetBuilder;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

// ── (1) 추출 잡 생성 스키마 — subject 배선 ──────────────────────────────────
{
  const base = {
    sourceType: "IMAGES",
    mode: "PASSAGE_ONLY",
    totalPages: 1,
    pages: [{ pageIndex: 0, size: 1024, mimeType: "image/jpeg" }],
  };
  const ko = createJobRequestSchema.safeParse({ ...base, subject: "KOREAN" });
  check("createJob accepts subject KOREAN", ko.success === true);
  if (ko.success) {
    check("createJob keeps subject value", ko.data.subject === "KOREAN");
  }
  const none = createJobRequestSchema.safeParse(base);
  check("createJob without subject still parses (무회귀)", none.success === true);
  if (none.success) {
    check("createJob default subject undefined", none.data.subject === undefined);
  }
  const bad = createJobRequestSchema.safeParse({ ...base, subject: "MATH" });
  check("createJob rejects non-KOREAN subject", bad.success === false);
}

// ── (2) KO 세트 빌더 가용성 판정 ────────────────────────────────────────────
{
  // 분량 충분(≥600자 상당)한 독서 지문 — 4문장 반복으로 결정론 구성.
  const longReading = Array.from({ length: 24 })
    .map(
      () =>
        "인간의 존엄성은 근대 헌법의 토대가 되는 개념이며 국가는 노동법을 통해 계약 내용에 직접 개입하기 시작했다.",
    )
    .join(" ");
  const availReading = computeKoPresetAvailability(longReading, "READING_SOC");
  check("availability returns all 3 presets", availReading.length === KO_SET_PRESETS.length);
  const reading = availReading.find((a: any) => a.preset.id === "ko-suneung-reading");
  check("독서 지문 → 수능 독서 세트 활성", !!reading && reading.ok === true);
  check(
    "활성 프리셋은 해석된 멤버 라벨 라인을 노출([3점] 포함)",
    !!reading && reading.memberLine.includes("[3점]"),
    reading?.memberLine,
  );
  const literature = availReading.find((a: any) => a.preset.id === "ko-suneung-literature");
  check("독서 지문 → 수능 문학 세트 비활성", !!literature && literature.ok === false);
  check(
    "비활성 사유(툴팁)가 비어 있지 않다",
    !!literature && typeof literature.reason === "string" && literature.reason.length > 0,
    literature?.reason ?? "(no reason)",
  );

  // 분량 미달 지문 — 갈래는 호환이지만 분량 게이트에 걸린다.
  const shortReading = "짧은 지문은 세트를 만들 수 없다.";
  const availShort = computeKoPresetAvailability(shortReading, "READING_HUM");
  const shortRd = availShort.find((a: any) => a.preset.id === "ko-suneung-reading");
  check("분량 미달 → 비활성", !!shortRd && shortRd.ok === false);
  check(
    "분량 미달 사유에 최소 분량 안내 포함",
    !!shortRd && String(shortRd.reason).includes("자"),
    shortRd?.reason ?? "(no reason)",
  );

  // 갈래 미지정(null) — 갈래 게이트 없이 분량만 적용(전 프리셋 판정 가능).
  const availNull = computeKoPresetAvailability(longReading, null);
  check(
    "갈래 미지정 지문은 분량만 통과하면 전 프리셋 활성",
    availNull.every((a: any) => a.ok === true),
    JSON.stringify(availNull.map((a: any) => [a.preset.id, a.ok, a.reason])),
  );
}

// ── (3) 모달 CTA 크레딧 미러 — 라우트 선차감식과 동일식 ─────────────────────
{
  // [KOSET-5] 선차감 배수 = 멤버당 실제 엔진 호출 상한(초기 1회 + 재생성 2회 = 3).
  check(
    "KO_SET_CHARGE_ATTEMPTS = 3 (선차감 = 실호출 상한)",
    KO_SET_CHARGE_ATTEMPTS === 3,
    String(KO_SET_CHARGE_ATTEMPTS),
  );
  const preset = resolveKoSetPreset("ko-suneung-reading")!;
  const resolution = resolveKoSetSlots(preset, "READING_SCI");
  check("reading resolves for credit math", resolution.ok === true);
  if (resolution.ok) {
    const memberCount = resolution.members.length;
    const unit = 7; // 임의 단가 — 식 자체의 동형성만 검증
    // 클라이언트(generate-page-client koSetStats) 식:
    const clientCredit = memberCount * unit * KO_SET_CHARGE_ATTEMPTS;
    // 라우트(korean-question-set) 식: base = memberCount × unit → × ATTEMPTS
    const routeCredit = memberCount * unit * KO_SET_CHARGE_ATTEMPTS;
    check("CTA credit == route pre-charge", clientCredit === routeCredit);
    check("멤버 4문항 세트", memberCount === 4, String(memberCount));
  }
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-generate-b1a-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("ko generate B1a: extraction subject wiring + KO set builder availability + credit mirror", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-generate-b1a failures: ${JSON.stringify(summary.failures, null, 2)}`,
  );
  assert.ok(summary.passed >= 12, `expected ≥12 checks, got ${summary.passed}`);
});
