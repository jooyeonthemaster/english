/* eslint-disable no-console */
/**
 * 리포트 사본의 복수 선택 답안 복원 — 스테일 `chosenChoice` 외과적 패치
 * =============================================================================
 * 실행:
 *   npx tsx --env-file-if-exists=.env --env-file-if-exists=.env.local \
 *     scripts/_backfill-report-chosen-choice.ts            # dry-run(기본)
 *   … scripts/_backfill-report-chosen-choice.ts --apply    # 실제 기록
 *
 * ## 왜 필요한가 (2026-07-26 확정)
 * 학생 답안은 두 곳에 산다.
 *   [A] ExamSubmission.responses[].input   — 응시 원본. 복수 선택은 {choices:["2","5"]}
 *   [B] ExamReportStudent.responses[].chosenChoice — 리포트 사본. 규약상 복수는 ", " join
 * 현재 브리지(internal-analysis.buildChosenChoice)는 [A]→[B] 를 `"2, 5"` 로 올바르게
 * 만든다. 그런데 과거에 쓰인 일부 행은 `"2"` 만 담고 있어(= 두 번째 선택 유실),
 * 리포트 경로로 들어온 화면과 변형 생성 시드가 학생 답을 절반만 보여준다.
 * → **스키마 문제가 아니라 스테일 데이터**다. 필드 하나만 되살리면 끝난다.
 *
 * ## 안전 설계 (이 스크립트가 지키는 것)
 *  1. 전체 재동기화 금지. `chosenChoice` **한 필드만** 교체한다.
 *     status·earnedPoints·note·reviewed·source·aiRead·studentAnswer 는 손대지 않는다
 *     — 강사가 정오표에서 손으로 확정한 판정을 덮으면 안 된다.
 *  2. 대상은 「응시 원본이 복수 선택인데 사본이 그와 다른」 행뿐.
 *     단일 선택·서답형·원본 없는(사진 업로드) 리포트는 건드리지 않는다.
 *  3. 쓰기 전 대상 행의 `responses` 원문을 백업 파일로 남긴다(되돌리기 근거).
 *  4. 기본은 dry-run. `--apply` 를 명시해야 기록한다.
 *  5. 점수(scoreSummary)는 재계산하지 않는다 — 이 패치로 정오 판정이 바뀌지 않는다.
 *
 * ## 되돌리기
 * 백업 JSON(.tmp-qa/backfill-chosen-choice-backup-*.json)의 각 항목을
 * `{ id, responses }` 그대로 examReportStudent.update 하면 원상복구된다.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { normalizeChoiceList } from "../src/lib/exam-scoring/normalize";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = ".tmp-qa";

interface SubmissionResponseRow {
  orderNum?: number;
  questionId?: string;
  input?: { choice?: string; choices?: string[] } | null;
}
interface ReportResponseRow {
  number?: string;
  chosenChoice?: string;
  [k: string]: unknown;
}

/** internal-analysis.buildChosenChoice 와 동일 규칙(복수는 ", " join) */
function expectedChosenChoice(
  input: SubmissionResponseRow["input"],
): string | undefined {
  if (!input) return undefined;
  if (Array.isArray(input.choices) && input.choices.length > 0) {
    const tokens = normalizeChoiceList(input.choices);
    return tokens.length > 0 ? tokens.join(", ") : undefined;
  }
  if (input.choice) return normalizeChoiceList(input.choice)[0];
  return undefined;
}

async function main() {
  console.log(`모드: ${APPLY ? "APPLY(실제 기록)" : "DRY-RUN(기록 없음)"}\n`);

  const subs = await prisma.examSubmission.findMany({
    where: { examReportStudentId: { not: null } },
    select: { id: true, examReportStudentId: true, responses: true },
  });
  const reportIds = [...new Set(subs.map((s) => s.examReportStudentId!).filter(Boolean))];
  const reports = await prisma.examReportStudent.findMany({
    where: { id: { in: reportIds }, deletedAt: null },
    select: { id: true, studentName: true, responses: true, version: true },
  });
  const reportById = new Map(reports.map((r) => [r.id, r]));

  /** reportId → { number → 기대값 } */
  const patches = new Map<string, Map<string, string>>();
  let scannedMulti = 0;

  for (const sub of subs) {
    const report = reportById.get(sub.examReportStudentId!);
    if (!report) continue;
    const repRows = (report.responses ?? []) as ReportResponseRow[];
    const byNumber = new Map(repRows.map((r) => [String(r.number), r]));

    for (const row of (sub.responses ?? []) as SubmissionResponseRow[]) {
      const input = row.input;
      // 복수 선택만 대상 — 단일·서답형은 이미 정확하고 건드릴 이유가 없다
      if (!Array.isArray(input?.choices) || input.choices.length < 2) continue;
      scannedMulti++;
      const expected = expectedChosenChoice(input);
      if (!expected) continue;
      const number = String(row.orderNum ?? "");
      const current = byNumber.get(number)?.chosenChoice;
      if (current === expected) continue;
      if (!byNumber.has(number)) continue; // 사본에 없는 문항은 건너뛴다(구조 불일치)
      const m = patches.get(report.id) ?? new Map<string, string>();
      m.set(number, expected);
      patches.set(report.id, m);
    }
  }

  console.log(`복수 선택 응답 스캔: ${scannedMulti}건`);
  console.log(`패치 대상 리포트: ${patches.size}건\n`);

  if (patches.size === 0) {
    console.log("바꿀 것이 없습니다.");
    return;
  }

  // 변경 예정 목록 — dry-run 에서도 실제로 무엇이 바뀌는지 전부 보여준다
  const backup: { id: string; studentName: string; responses: unknown }[] = [];
  for (const [reportId, fixes] of patches) {
    const report = reportById.get(reportId)!;
    const rows = (report.responses ?? []) as ReportResponseRow[];
    console.log(`· ${report.studentName} (${reportId})`);
    for (const [number, expected] of fixes) {
      const before = rows.find((r) => String(r.number) === number)?.chosenChoice;
      console.log(`    ${number}번  chosenChoice: ${JSON.stringify(before)} → ${JSON.stringify(expected)}`);
    }
    backup.push({ id: reportId, studentName: report.studentName, responses: report.responses });
  }

  if (!APPLY) {
    console.log("\n(dry-run — 기록하지 않았습니다. --apply 로 실행하세요)");
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}/backfill-chosen-choice-backup-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`\n백업 저장: ${backupPath}`);

  let updated = 0;
  for (const [reportId, fixes] of patches) {
    const report = reportById.get(reportId)!;
    const rows = (report.responses ?? []) as ReportResponseRow[];
    // 한 필드만 갈아끼운 새 배열 — 나머지 키는 스프레드로 그대로 보존
    const next = rows.map((r) => {
      const expected = fixes.get(String(r.number));
      return expected ? { ...r, chosenChoice: expected } : r;
    });
    await prisma.examReportStudent.update({
      where: { id: reportId },
      // version 은 낙관적 락 축이라 건드리지 않는다(표시 데이터 보정이지 채점 변경이 아니다)
      data: { responses: next as object },
    });
    updated++;
  }
  console.log(`기록 완료: 리포트 ${updated}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
