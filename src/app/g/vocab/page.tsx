// ============================================================================
// /g/vocab — 학생 누적 취약 단어장 (서버 가드 + 데이터 조립)
//
// 학생이 모든 학습지에서 틀린 어휘를 지문과 무관하게 한 곳에 누적한다.
// worksheet_study_item_logs(wordKey 있는 로그)를 학생 스코프로 전량 조회해
// 단어별 오답 이력을 집계한다. 원본 학습지 재파싱 없이 wordMeaning 스냅샷으로
// 자립. 문구는 전부 합니다체.
// ============================================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { prisma } from "@/lib/prisma";
import {
  StudentVocabClient,
  type StudentVocabData,
  type WeakWordEntry,
  type WeakWordHistoryRow,
} from "./vocab-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "취약 단어장 | SMOAT",
  robots: { index: false, follow: false },
};

const KST_OFFSET = 9 * 3_600_000;
function seoulDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET) / 86_400_000);
}

/** spec §5 판정 — correct 또는 selfGrade. read/flash 무판정 로그는 null. */
function judgeCorrect(log: { correct: boolean | null; selfGrade: string | null }): boolean | null {
  if (log.correct === true) return true;
  if (log.correct === false) return false;
  if (log.selfGrade === "O") return true;
  if (log.selfGrade === "D" || log.selfGrade === "X") return false;
  return null;
}

export default async function StudentVocabPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  // 학생 스코프 state → 과제 제목 조인
  const states = await prisma.worksheetStudyState.findMany({
    where: { academyId: session.academyId, studentId: session.studentId },
    select: { id: true, assignmentId: true },
  });

  let data: StudentVocabData = {
    entries: [],
    totalWrongWords: 0,
    newThisWeek: 0,
    recoveredCount: 0,
  };

  if (states.length > 0) {
    const assignmentIdByState = new Map(states.map((s) => [s.id, s.assignmentId]));
    const assignmentIds = [...new Set(states.map((s) => s.assignmentId))];
    const assignments = await prisma.studyAssignment.findMany({
      where: { id: { in: assignmentIds }, academyId: session.academyId },
      select: { id: true, title: true },
    });
    const titleById = new Map(assignments.map((a) => [a.id, a.title]));

    const raw = await prisma.worksheetStudyItemLog.findMany({
      where: {
        academyId: session.academyId,
        stateId: { in: states.map((s) => s.id) },
        wordKey: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        stateId: true,
        wordKey: true,
        wordMeaning: true,
        correct: true,
        selfGrade: true,
        attempt: true,
        response: true,
        createdAt: true,
      },
    });

    // 단어별 그룹 (raw 는 createdAt desc)
    const byWord = new Map<string, typeof raw>();
    for (const log of raw) {
      const key = log.wordKey as string;
      const arr = byWord.get(key) ?? [];
      arr.push(log);
      byWord.set(key, arr);
    }

    // 서버 컴포넌트(force-dynamic) — 요청 시각 기준 "이번 주" 판정. 클라 렌더가
    // 아니므로 순수성 규칙은 해당 없음(false positive).
    // eslint-disable-next-line react-hooks/purity
    const todayIdx = seoulDayIndex(Date.now());
    const entries: WeakWordEntry[] = [];
    let recoveredCount = 0;
    let newThisWeek = 0;

    for (const [word, logs] of byWord) {
      let wrongCount = 0;
      let totalCount = 0;
      let lastWrongAt: Date | null = null;
      let firstWrongAt: Date | null = null;
      for (const log of logs) {
        if (log.attempt !== 1) continue;
        const correct = judgeCorrect(log);
        if (correct === null) continue;
        totalCount += 1;
        if (!correct) {
          wrongCount += 1;
          if (!lastWrongAt) lastWrongAt = log.createdAt; // desc → 첫 오답이 최근
          firstWrongAt = log.createdAt; // 계속 덮어써 마지막(가장 오래된) 오답 = 처음 틀린 시각
        }
      }
      if (wrongCount === 0) continue;

      // 가장 최근 판정 로그의 정오 → recovered
      let recovered = false;
      for (const log of logs) {
        const correct = judgeCorrect(log);
        if (correct === null) continue;
        recovered = correct;
        break;
      }
      if (recovered) recoveredCount += 1;

      // 이번 주(최근 7일) 처음 틀린 단어
      if (firstWrongAt && todayIdx - seoulDayIndex(firstWrongAt.getTime()) < 7) {
        newThisWeek += 1;
      }

      const meaning = logs.find((l) => l.wordMeaning && l.wordMeaning.trim())?.wordMeaning ?? null;

      // 무판정 로그(카드 열람 등)는 이력에서 제외 — null 을 오답(✗)으로 강등하지 않는다
      const history: WeakWordHistoryRow[] = logs
        .filter((log) => judgeCorrect(log) !== null)
        .slice(0, 20)
        .map((log) => ({
          worksheetTitle: titleById.get(assignmentIdByState.get(log.stateId) ?? "") ?? "(삭제된 과제)",
          at: log.createdAt.toISOString(),
          correct: judgeCorrect(log) === true,
          response: log.response,
          attempt: log.attempt,
        }));

      entries.push({
        word,
        meaning,
        wrongCount,
        totalCount,
        lastWrongAt: (lastWrongAt ?? logs[0].createdAt).toISOString(),
        recovered,
        history,
      });
    }

    // 최근 오답순
    entries.sort((a, b) => new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime());

    data = {
      entries,
      totalWrongWords: entries.length,
      newThisWeek,
      recoveredCount,
    };
  }

  return <StudentVocabClient data={data} />;
}
