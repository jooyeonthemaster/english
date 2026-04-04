"use server";

// ============================================================================
// 세션 사전 생성 빌더
// 지문의 문제 풀(NaeshinQuestion)을 카테고리별 세션으로 분배
// ============================================================================

import { prisma } from "@/lib/prisma";
import {
  SESSIONS_PER_CATEGORY,
  QUESTIONS_PER_SESSION,
  MASTERY_SUBTYPES,
  MASTERY_QUESTIONS_PER_SUBTYPE,
  type LearningCategory,
  SUBTYPE_TO_CATEGORY,
} from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// 유틸: Fisher-Yates 셔플
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// 라운드로빈 분배: subType별 큐에서 순환하며 세션 채우기
// ---------------------------------------------------------------------------

/** 문제의 핵심 내용 키 추출 — 같은 키 = 유사 문제 */
function extractContentKey(questionText: string, subType: string | null): string {
  try {
    const data = JSON.parse(questionText);
    switch (subType) {
      case "WORD_MEANING":
      case "WORD_MEANING_REVERSE":
      case "VOCAB_SYNONYM":
      case "VOCAB_DEFINITION":
        return data.word || data.koreanMeaning || "";
      case "SENTENCE_INTERPRET":
      case "SENTENCE_COMPLETE":
        return (data.englishSentence || data.koreanSentence || "").slice(0, 60);
      case "GRAMMAR_SELECT":
      case "ERROR_FIND":
      case "ERROR_CORRECT":
      case "GRAM_BINARY":
      case "KEY_EXPRESSION":
      case "WORD_FILL":
      case "VOCAB_COLLOCATION":
      case "VOCAB_CONFUSABLE":
        return (data.sentence || data.contextSentence || "").slice(0, 60);
      case "GRAM_TRANSFORM":
        return (data.originalSentence || "").slice(0, 60);
      case "WORD_ARRANGE":
      case "SENT_CHUNK_ORDER":
        return (data.koreanSentence || data.koreanHint || "").slice(0, 60);
      case "TRUE_FALSE":
        return (data.statement || "").slice(0, 60);
      case "CONTENT_QUESTION":
        return (data.question || data.contextExcerpt || "").slice(0, 60);
      case "PASSAGE_FILL":
        return (data.excerpt || "").slice(0, 60);
      case "CONNECTOR_FILL":
        return (data.sentenceBefore || "").slice(0, 60);
      default:
        return "";
    }
  } catch {
    return "";
  }
}

function distributeRoundRobin(
  questions: { id: string; subType: string | null; questionText: string }[],
  sessionsCount: number,
  questionsPerSession: number
): string[][] {
  // 문제 ID → 핵심 내용 키 맵
  const contentKeyMap = new Map<string, string>();
  for (const q of questions) {
    contentKeyMap.set(q.id, extractContentKey(q.questionText, q.subType));
  }

  // subType별 그룹핑
  const bySubType = new Map<string, string[]>();
  for (const q of questions) {
    const key = q.subType ?? "UNKNOWN";
    if (!bySubType.has(key)) bySubType.set(key, []);
    bySubType.get(key)!.push(q.id);
  }

  // 각 subType 내에서 셔플
  for (const [key, ids] of bySubType) {
    bySubType.set(key, shuffle(ids));
  }

  const subTypes = [...bySubType.keys()];
  const sessions: string[][] = Array.from({ length: sessionsCount }, () => []);
  // 각 세션에 들어간 핵심 키 추적
  const sessionKeys: Set<string>[] = Array.from({ length: sessionsCount }, () => new Set());

  // 각 세션마다 subType을 순환하며 1개씩 채움
  for (let si = 0; si < sessionsCount; si++) {
    const offset = si * Math.ceil(subTypes.length / 2);
    let stIdx = offset % subTypes.length;

    while (sessions[si].length < questionsPerSession) {
      let added = false;
      for (let attempt = 0; attempt < subTypes.length; attempt++) {
        const st = subTypes[(stIdx + attempt) % subTypes.length];
        const pool = bySubType.get(st)!;
        if (pool.length > 0) {
          // 유사 문제 확인: 같은 핵심 키가 이미 세션에 있으면 건너뛰기
          let picked = false;
          for (let pi = 0; pi < pool.length; pi++) {
            const candidateId = pool[pi];
            const ck = contentKeyMap.get(candidateId) || "";
            if (!ck || !sessionKeys[si].has(ck)) {
              // 이 문제 사용
              pool.splice(pi, 1);
              sessions[si].push(candidateId);
              if (ck) sessionKeys[si].add(ck);
              picked = true;
              added = true;
              break;
            }
          }
          // 유사 문제밖에 없으면 그냥 첫 번째 사용 (풀 소진 방지)
          if (!picked && pool.length > 0) {
            sessions[si].push(pool.shift()!);
            added = true;
          }
          if (sessions[si].length >= questionsPerSession) break;
        }
      }
      stIdx = (stIdx + 1) % subTypes.length;
      if (!added) break;
    }

    sessions[si] = shuffle(sessions[si]);
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// 마스터리 세션 빌드: 지문 문장 순서대로 배치
// ---------------------------------------------------------------------------

async function buildMasteryQuestionIds(
  passageId: string,
  questions: { id: string; subType: string | null; sentenceIndex: number | null; questionText: string }[]
): Promise<string[]> {
  const masterySet = new Set<string>(MASTERY_SUBTYPES as unknown as string[]);

  // 마스터리 대상 문제만 필터
  const eligible = questions.filter((q) => q.subType && masterySet.has(q.subType));

  // subType별 그룹 → 각 subType에서 N개 선택
  const bySubType = new Map<string, typeof eligible>();
  for (const q of eligible) {
    const key = q.subType!;
    if (!bySubType.has(key)) bySubType.set(key, []);
    bySubType.get(key)!.push(q);
  }

  const selected: typeof eligible = [];
  for (const [, group] of bySubType) {
    const shuffled = shuffle(group);
    selected.push(...shuffled.slice(0, MASTERY_QUESTIONS_PER_SUBTYPE));
  }

  // sentenceIndex 기준 정렬 (지문 문장 순서)
  // sentenceIndex가 없는 문제는 contextSentence로 추정하거나 맨 뒤로
  selected.sort((a, b) => {
    const aIdx = a.sentenceIndex ?? extractSentenceIndexFromText(a.questionText);
    const bIdx = b.sentenceIndex ?? extractSentenceIndexFromText(b.questionText);
    return aIdx - bIdx;
  });

  return selected.map((q) => q.id);
}

/** questionText JSON에서 sentenceIndex 추출 시도 */
function extractSentenceIndexFromText(questionText: string): number {
  try {
    const data = JSON.parse(questionText);
    if (typeof data.sentenceIndex === "number") return data.sentenceIndex;
    // contextSentence가 있으면 999 (순서 불명이지만 맨 뒤보다는 앞)
    if (data.contextSentence || data.contextExcerpt || data.englishSentence) return 500;
    return 999;
  } catch {
    return 999;
  }
}

// ---------------------------------------------------------------------------
// 메인: 지문의 세션 사전 생성
// ---------------------------------------------------------------------------

export async function buildPrebuiltSessions(passageId: string) {
  // 1. 해당 지문의 전체 문제 로드
  const allQuestions = await prisma.naeshinQuestion.findMany({
    where: { passageId },
    select: {
      id: true,
      learningCategory: true,
      subType: true,
      sentenceIndex: true,
      questionText: true,
    },
  });

  if (allQuestions.length === 0) {
    throw new Error("해당 지문에 문제가 없습니다.");
  }

  // 2. 카테고리별 분류
  const categories: LearningCategory[] = ["VOCAB", "INTERPRETATION", "GRAMMAR", "COMPREHENSION"];
  const byCategory = new Map<string, typeof allQuestions>();
  for (const cat of categories) {
    byCategory.set(cat, allQuestions.filter((q) => q.learningCategory === cat));
  }

  // 3. 기존 PrebuiltSession 삭제 (재생성)
  await prisma.prebuiltSession.deleteMany({ where: { passageId } });

  // 4. 카테고리별 세션 생성
  const sessionsToCreate: {
    passageId: string;
    category: string;
    sessionSeq: number;
    questionIds: string;
    questionCount: number;
  }[] = [];

  for (const cat of categories) {
    const questions = byCategory.get(cat) ?? [];
    if (questions.length === 0) continue;

    const distributed = distributeRoundRobin(questions, SESSIONS_PER_CATEGORY, QUESTIONS_PER_SESSION);

    for (let i = 0; i < distributed.length; i++) {
      if (distributed[i].length === 0) continue;
      sessionsToCreate.push({
        passageId,
        category: cat,
        sessionSeq: i + 1,
        questionIds: JSON.stringify(distributed[i]),
        questionCount: distributed[i].length,
      });
    }
  }

  // 5. 마스터리 세션 생성
  const masteryIds = await buildMasteryQuestionIds(passageId, allQuestions);
  if (masteryIds.length > 0) {
    sessionsToCreate.push({
      passageId,
      category: "MASTERY",
      sessionSeq: 1,
      questionIds: JSON.stringify(masteryIds),
      questionCount: masteryIds.length,
    });
  }

  // 6. DB 일괄 생성
  await prisma.prebuiltSession.createMany({ data: sessionsToCreate });

  return {
    passageId,
    totalSessions: sessionsToCreate.length,
    totalQuestions: sessionsToCreate.reduce((sum, s) => sum + s.questionCount, 0),
    breakdown: categories.map((cat) => ({
      category: cat,
      sessions: sessionsToCreate.filter((s) => s.category === cat).length,
      questions: sessionsToCreate
        .filter((s) => s.category === cat)
        .reduce((sum, s) => sum + s.questionCount, 0),
    })),
    mastery: {
      questions: masteryIds.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 유틸: 전체 지문 일괄 빌드
// ---------------------------------------------------------------------------

export async function buildAllPrebuiltSessions(academyId: string) {
  const passages = await prisma.passage.findMany({
    where: { academyId },
    select: { id: true, title: true },
  });

  const results = [];
  for (const passage of passages) {
    // 문제가 있는 지문만 빌드
    const count = await prisma.naeshinQuestion.count({
      where: { passageId: passage.id },
    });
    if (count === 0) continue;

    const result = await buildPrebuiltSessions(passage.id);
    results.push({ passageTitle: passage.title, ...result });
  }

  return results;
}
