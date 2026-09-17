"use server";

// ============================================================================
// 클래스 스튜디오 — 기출 **문항** 반입 (docs/gichul-question-bank-spec.md §5)
//
// 「시험지 조판」 뷰의 [기출 문제 불러오기] 모달이 고른 은행 항목(bankId)을 학원 DB 의
// Passage + Question 행으로 반입하고 클래스에 담는 **1왕복 합본** 액션이다.
//   ① 지문: 기출 지문 반입 정본(importExamPassages)을 그대로 호출 — 같은 지문은 같은
//      Passage 행(tags `kice:<passageId>`)을 공유한다(지문관리 기출 탭과 동일 행).
//   ② 문항: 은행 항목의 직렬화 완성본(questionText/options/correctAnswer/structuredData)을
//      컬럼에 옮겨 적는다. 멱등 마커는 tags `gichul:<bankId>` — **클래스 스코프가 아니라
//      학원 스코프**로 판정한다(같은 기출 문항을 두 클래스에 담아도 Question 행은 하나).
//   ③ 클래스 담기: addPassagesToStudioClass(50개 청크, 같은 프로세스 안 함수 호출).
//   ④ mode:"pick"(§11.4-6·§11.4-6c): 인라인 기출 브라우저의 「체크 = 시험지에 넣기」 경로.
//      지문함 createdAt 터치·revalidatePath 를 전부 생략한다(조판 픽은 로컬 상태로 충분하고,
//      revalidate 는 직렬 액션 큐 위에서 스튜디오 전체 RSC 리프레시를 유발해 랙의 한 축이었다).
//
// 서버 액션은 직렬 처리라 지문 등록·문항 생성·클래스 담기를 따로 부르면 왕복 3회가
// 그대로 체감 지연이 된다(src/actions/studio/passages.ts:363-375 실측) — 반드시 합본.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { importExamPassages } from "@/actions/workbench/exam-passages";
import { addPassagesToStudioClass } from "@/actions/studio/passages";
import { getExamBankItemsByIds } from "@/lib/exam-passages/question-bank";
import { getExamBankSetForMember } from "@/lib/exam-passages/question-bank-sets";
import { persistExamBankSets } from "@/lib/exam-passages/question-bank-set-persistence";
import { EXAM_BANK_IMPORT_MAX, type ExamBankItem } from "@/lib/exam-passages/question-bank-types";
import { examShortLabel } from "@/lib/exam-passages/format";
import { mergeQuestionGenerationPlanTag } from "@/lib/question-generation-plans";

/** 문항 멱등 마커 — 기계용 키 태그(getDisplayQuestionTags 가 표시에서 숨긴다). */
const GICHUL_TAG_PREFIX = "gichul:";
/** 출처 회차 키 태그(스펙 §2-7) — 기계용 키라 표시에서 숨는다(isMachineKeyTag). `kice:` 와 접두 충돌 없음(`kice-`). */
const KICE_EXAM_TAG_PREFIX = "kice-exam:";

export interface ImportExamQuestionsResult {
  success: boolean;
  /** 전체 실패 메시지, 또는 success:true 여도 클래스 담기 청크가 실패했을 때의 마지막 메시지(그 항목은 skippedBankIds). */
  error?: string;
  /** 이번에 새로 만든 Question.id — 목록 도착 후 자동 체크 대상 */
  createdQuestionIds: string[];
  /** 이미 있어 재사용한 Question.id(같은 학원에 같은 기출 문항이 이미 반입됨) */
  existingQuestionIds: string[];
  /** 은행에서 찾지 못했거나 지문을 만들지 못해 건너뛴 bankId */
  skippedBankIds: string[];
  /** 관련 Passage.id(신규+기존) */
  passageIds: string[];
  /** 이번 호출로 클래스에 새로 링크된 지문 수 */
  addedToClassCount: number;
  /**
   * 요청 bankIds 순서 그대로의 Question.id(신규·기존 무관, 건너뛴 항목만 빠진다) —
   * 호스트 자동 체크 대기열의 **유일한** 재료. created/existing 분리 배열은 순서를
   * 잃는다(같은 학원의 두 번째 클래스는 전건 existing — 검수 「순서 계약 붕괴」).
   */
  questionIdsInOrder: string[];
  /**
   * 요청 bankId ↔ 확정 Question.id(신규·기존 무관, 요청 순서, skipped 제외) — §11.8 호스트 bankMap
   * 증분 갱신 재료. `questionIdsInOrder` 는 skipped 가 있으면 요청 배열과 정렬이 어긋나므로
   * 매핑 재료로 쓰지 않는다. inline/types.ts ExamBankImportMappingEntry 와 동형.
   */
  mapping: { bankId: string; questionId: string }[];
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function difficultyOf(item: ExamBankItem): "BASIC" | "INTERMEDIATE" | "KILLER" {
  return item.points >= 3 ? "KILLER" : "INTERMEDIATE";
}

/** 은행 항목이 이미 들고 있는 `_gichul`(장문 세트 멤버의 set·optionList 등, §12.2) — 덮어쓰지 말고 펼쳐 병합한다. */
function readGichulMeta(structuredData: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = structuredData?._gichul;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function buildTags(item: ExamBankItem): string[] {
  // 플랜 태그(STANDARD)를 접두로 붙인다 — 없으면 listStudioClassQuestions 의 프리미엄 판정이
  // 레거시 폴백 질의(workbenchAiJob PREMIUM 역교집합)를 목록 조회마다 1회 더 돌린다.
  return mergeQuestionGenerationPlanTag(
    [
      "기출",
      String(item.year),
      examShortLabel(item.exam),
      item.typeGroup,
      `${GICHUL_TAG_PREFIX}${item.id}`,
      `${KICE_EXAM_TAG_PREFIX}${item.examId}`,
    ],
    "STANDARD",
  );
}

export async function importExamQuestionsToStudioClass(input: {
  bankIds: string[];
  classId: string;
  /**
   * "pick" = 조판 픽 경로(§11.4-6·§11.4-6c): createdAt 터치·revalidate 생략.
   * 생략(기본) = 기존 모달 경로 동작 그대로(무회귀).
   */
  mode?: "pick";
}): Promise<ImportExamQuestionsResult> {
  const empty: ImportExamQuestionsResult = {
    success: false,
    createdQuestionIds: [],
    existingQuestionIds: [],
    skippedBankIds: [],
    passageIds: [],
    addedToClassCount: 0,
    questionIdsInOrder: [],
    mapping: [],
  };
  const isPick = input.mode === "pick";
  try {
    const staff = await requireStaffAuth();
    const academyId = staff.academyId;
    const classId = typeof input.classId === "string" ? input.classId : "";
    const ids = Array.from(new Set((input.bankIds ?? []).map((s) => String(s).trim()).filter(Boolean))).slice(0, EXAM_BANK_IMPORT_MAX);
    if (ids.length === 0) return { ...empty, error: "담을 기출 문항을 선택해 주세요." };
    if (!classId) return { ...empty, error: "클래스 정보가 올바르지 않습니다." };
    const cls = await prisma.class.findFirst({ where: { id: classId, academyId }, select: { id: true } });
    if (!cls) return { ...empty, error: "클래스를 찾을 수 없습니다." };

    // 1) 은행 해석(서버 신뢰 소스 — 클라이언트는 id 만 보낸다)
    const selectionKeys = [...new Set(ids.map((id) => getExamBankSetForMember(id)?.key ?? id))];
    const items = getExamBankItemsByIds(selectionKeys);
    const found = new Set(items.map((i) => i.id));
    const skippedBankIds = ids.filter((id) => !found.has(id) && !items.some((item) => item.setKey === id));
    if (items.length === 0) return { ...empty, error: "선택한 기출 문항을 찾을 수 없습니다.", skippedBankIds };

    // 2) 지문 행 확보 — 기출 지문 반입 정본(멱등 kice:<passageId>). passageId(코퍼스) → Passage.id
    //    대응은 반환 `passageIdByExamId`(기존+신규, 요청분)로 받는다 — 예전엔 tags `kice:` 전량을
    //    다시 스캔했다(왕복 1회 + 학원 지문 수에 비례하는 파싱, §11.4-6 에서 제거).
    const passageKeys = Array.from(new Set(items.map((i) => i.passageId)));
    // 코퍼스 절단 지문(요약문 등 7건, 26-09-08 실측)은 은행이 원형 복원본을 들고 있다 → 지문 행 생성 시 본문 대체
    const contentOverrides: Record<string, string> = {};
    for (const i of items) {
      if (typeof i.passageContentOverride === "string" && i.passageContentOverride.trim()) contentOverrides[i.passageId] = i.passageContentOverride;
    }
    const imported = await importExamPassages(
      passageKeys,
      contentOverrides,
      isPick ? { touchCreatedAt: false, revalidate: false } : undefined,
    );
    if (!imported.success) return { ...empty, error: imported.error ?? "기출 지문 등록에 실패했습니다.", skippedBankIds };
    // 대표 1개(createdAt 오름차순 첫 사본) — 클래스 링크·신규 문항의 부모는 이것.
    const passageIdByKey = new Map<string, string>(Object.entries(imported.passageIdByExamId ?? {}));
    const passageIds = Array.from(new Set(items.map((i) => passageIdByKey.get(i.passageId)).filter((v): v is string => Boolean(v))));
    // 사본 전량 합집합 — 기존 gichul 문항 스캔은 여기서 한다. 한 기출 지문이 지문함에 여러 번
    // 있으면 예전 반입 문항이 대표가 아닌 사본에 붙어 있을 수 있고, 대표만 보면 그 문항을 못 찾아
    // 같은 bankId 를 한 번 더 만든다(멱등 붕괴).
    const passageIdsAllCopies = Array.from(
      new Set(items.flatMap((i) => imported.passageIdsByExamId?.[i.passageId] ?? [])),
    );

    // 3) 문항 멱등 — 이 학원에 같은 bankId 문항이 있으면 재사용(휴지통 제외)
    const existingRows = passageIdsAllCopies.length
      ? await prisma.question.findMany({
          where: { academyId, deletedAt: null, passageId: { in: passageIdsAllCopies }, tags: { contains: GICHUL_TAG_PREFIX } },
          select: { id: true, tags: true },
        })
      : [];
    const questionIdByBankId = new Map<string, string>();
    for (const row of existingRows) {
      for (const t of parseTags(row.tags)) {
        if (t.startsWith(GICHUL_TAG_PREFIX)) {
          const bankId = t.slice(GICHUL_TAG_PREFIX.length);
          if (!questionIdByBankId.has(bankId)) questionIdByBankId.set(bankId, row.id);
        }
      }
    }

    const existingQuestionIds: string[] = [];
    const toCreate: { item: ExamBankItem; passageId: string }[] = [];
    // 요청 bankId → 이번 호출이 확정한 Question.id(기존 재사용 + 신규 생성). 반환 순서
    // 계약(questionIdsInOrder)은 이 맵을 요청 ids 순서로 읽어 만든다.
    const resolvedQuestionIdByBankId = new Map<string, string>();
    for (const item of items) {
      const passageId = passageIdByKey.get(item.passageId);
      if (!passageId) { skippedBankIds.push(item.id); continue; }
      const existing = questionIdByBankId.get(item.id);
      if (existing) { existingQuestionIds.push(existing); resolvedQuestionIdByBankId.set(item.id, existing); continue; }
      toCreate.push({ item, passageId });
    }

    // 4) 생성 — 은행 직렬화 완성본을 컬럼에 옮겨 적는다(생성 문항과 동형: question-generation-persistence.ts 계약)
    const createdQuestionIds: string[] = [];
    if (toCreate.length > 0 || items.some((item) => item.setKey)) {
      await prisma.$transaction(
        async (tx) => {
          for (const { item, passageId } of toCreate) {
            const created = await tx.question.create({
              data: {
                academyId,
                passageId,
                type: "MULTIPLE_CHOICE",
                subType: item.subType,
                questionText: item.questionText,
                structuredData: {
                  ...item.structuredData,
                  _typeId: item.subType,
                  _generationPlan: "STANDARD",
                  tags: buildTags(item),
                  difficulty: difficultyOf(item),
                  // footnotes: 출처형·요약문은 각주가 questionText 밖이라 렌더러(paper-item-utils makePaperItem)가 지문 박스 아래에 인쇄한다
                  // ⚠ 세트 멤버의 `set`·`optionList`(§12.2)는 은행 항목이 이미 _gichul 에 싣고 있다 — 통째로 덮어쓰면
                  //   조판기 세트 분기가 조용히 꺼진다. 먼저 펼친 뒤 반입 메타를 덧쓴다(client-builder·render 와 동형).
                  _gichul: { ...readGichulMeta(item.structuredData), bankId: item.id, examId: item.examId, year: item.year, exam: item.exam, board: item.board, grade: item.grade, qNum: item.qNum, points: item.points, footnotes: item.footnotes },
                } as object,
                options: JSON.stringify(item.options),
                correctAnswer: item.correctAnswer,
                points: item.points,
                difficulty: difficultyOf(item),
                tags: JSON.stringify(buildTags(item)),
                aiGenerated: false,
                approved: true,
              },
              select: { id: true },
            });
            createdQuestionIds.push(created.id);
            resolvedQuestionIdByBankId.set(item.id, created.id);
          }
          await persistExamBankSets(tx, academyId, items, resolvedQuestionIdByBankId, passageIdByKey);
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    }

    // 5) 클래스 담기(멱등, 50개 청크 — 같은 프로세스 안 함수 호출이라 왕복은 늘지 않는다)
    //    청크가 실패하면(클래스 소실·과목 스코프 탈락 등) 그 청크의 지문에 매달린 항목은 클래스에
    //    없는 채로 questionIdsInOrder 에 실려 호스트가 「체크됨」으로 착지시키던 결함 → 실패 청크의
    //    항목은 skippedBankIds 로 옮기고 mapping/questionIdsInOrder 에서 뺀다(Question 행은 남는다 —
    //    학원 스코프 멱등이라 다음 반입이 재사용). 마지막 실패 메시지는 error 로 동봉한다.
    let addedToClassCount = 0;
    let linkError: string | undefined;
    for (let i = 0; i < passageIds.length; i += 50) {
      const chunk = passageIds.slice(i, i + 50);
      const res = await addPassagesToStudioClass({
        classId,
        passageIds: chunk,
        ...(isPick ? { revalidate: false } : {}),
      });
      if (res.success && res.data) {
        addedToClassCount += res.data.addedCount;
        continue;
      }
      linkError = res.error ?? "클래스에 지문을 담지 못했습니다.";
      const failedPassageIds = new Set(chunk);
      for (const item of items) {
        const pid = passageIdByKey.get(item.passageId);
        if (!pid || !failedPassageIds.has(pid)) continue;
        if (!resolvedQuestionIdByBankId.delete(item.id)) continue;
        skippedBankIds.push(item.id);
      }
    }

    // 요청 순서 보존(ids 는 중복 제거된 요청 순서) — 건너뛴 bankId 는 맵에 없어 자연 탈락.
    // A bundle key returns its members in source order; member-ID callers retain their requested order.
    const requestedMemberIds = getExamBankItemsByIds(ids).map((item) => item.id);
    const questionIdsInOrder = requestedMemberIds
      .map((bankId) => resolvedQuestionIdByBankId.get(bankId))
      .filter((v): v is string => typeof v === "string");
    const mapping: { bankId: string; questionId: string }[] = [];
    for (const bankId of requestedMemberIds) {
      const questionId = resolvedQuestionIdByBankId.get(bankId);
      if (questionId) mapping.push({ bankId, questionId });
    }

    return {
      success: true,
      ...(linkError ? { error: linkError } : {}),
      createdQuestionIds,
      existingQuestionIds,
      skippedBankIds,
      passageIds,
      addedToClassCount,
      questionIdsInOrder,
      mapping,
    };
  } catch (err) {
    console.error("[importExamQuestionsToStudioClass] failed", err);
    return { ...empty, error: err instanceof Error ? err.message : "기출 문항 반입에 실패했습니다." };
  }
}

/**
 * 이 클래스에 이미 담긴 기출 문항 bankId — 모달 「담김」 배지·중복 반입 차단용.
 * 클래스 스코프를 먼저 건다(StudioClassPassage → passageIds → Question) — Question 은 학원당
 * 수만 건이라 `contains` 전량 스캔은 금지(정찰 렌즈 3 함정).
 */
export async function listStudioClassExamBankIds(input: { classId: string }): Promise<{
  success: boolean;
  entries: { bankId: string; questionId: string }[];
}> {
  try {
    const staff = await requireStaffAuth();
    const classId = typeof input.classId === "string" ? input.classId : "";
    if (!classId) return { success: false, entries: [] };
    // take 상한 없음 — orderBy 없는 상한은 300 초과 클래스에서 「담김」을 무작위로
    // 빠뜨린다(검수 minor). 클래스 지문 링크는 수천 이하라 전량 조회가 안전하다.
    const links = await prisma.studioClassPassage.findMany({
      where: { academyId: staff.academyId, classId },
      select: { passageId: true },
    });
    if (links.length === 0) return { success: true, entries: [] };
    const rows = await prisma.question.findMany({
      where: {
        academyId: staff.academyId,
        deletedAt: null,
        passageId: { in: links.map((l) => l.passageId) },
        tags: { contains: GICHUL_TAG_PREFIX },
      },
      select: { id: true, tags: true },
    });
    const entries: { bankId: string; questionId: string }[] = [];
    for (const row of rows) {
      for (const t of parseTags(row.tags)) {
        if (t.startsWith(GICHUL_TAG_PREFIX)) entries.push({ bankId: t.slice(GICHUL_TAG_PREFIX.length), questionId: row.id });
      }
    }
    return { success: true, entries };
  } catch (err) {
    console.error("[listStudioClassExamBankIds] failed", err);
    return { success: false, entries: [] };
  }
}
