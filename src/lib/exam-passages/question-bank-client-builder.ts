// 은행 항목 → 조판기 BuilderQuestion(클라이언트, 「체크 즉시 조판」 §11.13).
//
// 서버 반입 액션(src/actions/studio/exam-questions.ts tx.question.create)과 **같은 컬럼 매핑**으로
// 만든다 — 반입이 착지한 뒤 실제 행으로 개명돼도 인쇄 결과가 바뀌지 않아야 한다(structuredData
// `_gichul`·태그·배점·난이도·각주). 반입 매핑이 바뀌면 여기와 question-bank-render.ts 도 같이 바꾼다.
//
// 지문 본문은 은행 JSON 에 없다(코퍼스 중복 적재 금지). 지문 박스 유형은 passageContentOverride
// 우선, 없으면 GET /api/exam-passages?ids=<passageId> 로 받는다(bank-preview 와 같은 경로).

import type { BuilderQuestion } from "@/components/exams/paper-builder/types";
import { clientQuestionIdFor } from "@/components/exams/paper-builder/client-question-registry";
import { examShortLabel } from "./format";
import type { ExamBankItem, ExamBankSet } from "./question-bank-types";
import { bankSetToBuilderRender } from "./question-bank-grouping";

/** 지문 박스 유형 — 본문이 questionText 밖(Passage.content)에 있어 조판 전에 받아야 한다 */
const SOURCE_PASSAGE_SUBTYPES = new Set(["TOPIC", "MAIN_IDEA", "TITLE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"]);

function difficultyOf(item: ExamBankItem): string {
  return item.points === 3 ? "KILLER" : "MEDIUM";
}

/** 은행 항목이 이미 들고 있는 `_gichul`(세트 멤버의 set·optionList 등) — 덮어쓰지 말고 펼쳐 병합한다(§12.2). */
function readGichulMeta(structuredData: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = structuredData?._gichul;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function buildTags(item: ExamBankItem): string[] {
  return ["기출", String(item.year), examShortLabel(item.exam), item.typeGroup, `gichul:${item.id}`, `kice-exam:${item.examId}`];
}

export function bankItemNeedsPassageContent(item: ExamBankItem): boolean {
  if (item.setKey) return false;
  return SOURCE_PASSAGE_SUBTYPES.has(item.subType) && !(item.passageContentOverride && item.passageContentOverride.trim());
}

/** 은행 항목 + (있으면) 지문 본문 → 임시 id(`bank:<id>`) BuilderQuestion */
export function bankItemToBuilderQuestion(item: ExamBankItem, passageContent: string | null): BuilderQuestion {
  const set = item.setKey ? setCache.get(item.setKey) : undefined;
  if (item.setKey && !set) throw new Error("장문 공통 지문을 불러오지 못했습니다. 다시 선택해 주세요.");
  if (set && set.memberIds.some((id) => !itemCache.has(id))) throw new Error("장문 문항을 모두 불러오지 못했습니다. 다시 선택해 주세요.");
  const setRender = set ? bankSetToBuilderRender(set, set.memberIds.flatMap((id) => {
    const member = itemCache.get(id);
    return member ? [member] : [];
  }), clientQuestionIdFor) : null;
  const tags = buildTags(item);
  const content = (item.passageContentOverride && item.passageContentOverride.trim()) || passageContent || "";
  return {
    id: clientQuestionIdFor(item.id),
    type: "MULTIPLE_CHOICE",
    subType: item.subType,
    questionText: item.questionText,
    structuredData: {
      ...item.structuredData,
      _typeId: item.subType,
      _generationPlan: "STANDARD",
      tags,
      difficulty: difficultyOf(item),
      _gichul: {
        // 세트 멤버의 `set`·`optionList`(§12.2)는 은행 항목 structuredData._gichul 에 이미 실려 있다 —
        // 통째로 덮어쓰면 조판기의 세트 분기(멤버 본문 발문+선지만 · 42/44 선지 한 줄)가 조용히 꺼진다.
        // 먼저 펼친 뒤 반입 메타를 덧쓴다(반입 액션 exam-questions.ts·렌더 하네스 question-bank-render.ts 와 동형).
        ...readGichulMeta(item.structuredData),
        bankId: item.id,
        examId: item.examId,
        year: item.year,
        exam: item.exam,
        board: item.board,
        grade: item.grade,
        qNum: item.qNum,
        points: item.points,
        footnotes: set?.footnotes ?? item.footnotes,
      },
    },
    options: JSON.stringify(item.options),
    correctAnswer: item.correctAnswer,
    points: item.points,
    difficulty: difficultyOf(item),
    tags: JSON.stringify(tags),
    aiGenerated: false,
    approved: true,
    starred: false,
    createdAt: new Date(0).toISOString(),
    setId: setRender?.id ?? null,
    setRender,
    passage: {
      id: `bankpassage:${item.passageId}`,
      title: item.passageTitle,
      content: set?.displayedPassage ?? content,
      grade: null,
      semester: null,
      publisher: null,
      school: null,
    },
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

// ── 프리페치 캐시(§11.13.1 「체크 = 네트워크 0」) ─────────────────────────────────────────
// 패널이 페이지(40건)를 받을 때 전체 항목(?ids=…&full=1)과 지문 박스 유형의 본문을 미리 받아 두면
// 체크 시 단건 GET 없이 즉시 조판된다(실측: 단건 GET 66ms + 본문 53ms + 렌더 → 프리페치 후 렌더만).
// 모듈 스코프 Map · 상한 400건(페이지 10장) 넘으면 오래된 것부터 버린다(은행은 불변 데이터라 무효화 불필요).
const ITEM_CACHE_MAX = 400;
const itemCache = new Map<string, ExamBankItem>();
const passageCache = new Map<string, string | null>();
const setCache = new Map<string, ExamBankSet>();
export function primeBankSets(sets: Record<string, ExamBankSet> = {}): void {
  for (const set of Object.values(sets)) remember(setCache, set.key, set);
}
function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > ITEM_CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}
export function primeBankItems(items: readonly ExamBankItem[]): void {
  for (const it of items) remember(itemCache, it.id, it);
}
export function primeBankPassages(entries: readonly { id: string; text: string | null }[]): void {
  for (const e of entries) remember(passageCache, e.id, e.text);
}
export function isBankItemPrimed(bankId: string): boolean {
  const it = itemCache.get(bankId);
  if (!it) return false;
  if (it.setKey) {
    const set = setCache.get(it.setKey);
    if (!set || set.memberIds.some((id) => !itemCache.has(id))) return false;
  }
  return !bankItemNeedsPassageContent(it) || passageCache.has(it.passageId);
}
/** 프리페치가 아직 필요한 지문 id(지문 박스 유형 · override 없음 · 캐시 미보유) */
export function bankPassageIdsToPrime(items: readonly ExamBankItem[]): string[] {
  const out = new Set<string>();
  for (const it of items) if (bankItemNeedsPassageContent(it) && !passageCache.has(it.passageId)) out.add(it.passageId);
  return [...out];
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * 체크 즉시 조판용 문항 조립: 단건 GET(+ 지문 박스 유형이면 본문 GET). 두 요청은 API 라우트라
 * 서버 액션 직렬 큐를 타지 않는다(실측 수십 ms). 지문 본문 실패는 본문 없이 진행(실패 아님).
 */
export async function fetchBankItemAsBuilderQuestion(bankId: string, signal?: AbortSignal): Promise<BuilderQuestion> {
  // 캐시 적중 = 네트워크 0(프리페치 §11.13.1). 지문 본문도 캐시에 있으면 그대로 조립한다.
  const cached = itemCache.get(bankId);
  if (cached && isBankItemPrimed(bankId)) {
    return bankItemToBuilderQuestion(cached, passageCache.get(cached.passageId) ?? null);
  }
  const response = !cached || (cached.setKey && !isBankItemPrimed(bankId))
    ? await fetchJson<{ item: ExamBankItem | null; set?: ExamBankSet; members?: ExamBankItem[] }>(`/api/exam-passages/questions/${encodeURIComponent(bankId)}`, signal)
    : { item: cached };
  const item = response.item;
  if (response.set) primeBankSets({ [response.set.key]: response.set });
  if (response.members) primeBankItems(response.members);
  if (!item) throw new Error("은행에 없는 문항입니다");
  remember(itemCache, item.id, item);
  let passageContent: string | null = null;
  if (bankItemNeedsPassageContent(item)) {
    try {
      const res = await fetchJson<{ items?: { id: string; text?: string; content?: string }[] }>(
        `/api/exam-passages?ids=${encodeURIComponent(item.passageId)}`,
        signal,
      );
      const rec = res.items?.find((p) => p.id === item.passageId) ?? res.items?.[0];
      passageContent = rec?.text ?? rec?.content ?? null;
      remember(passageCache, item.passageId, passageContent);
    } catch (err) {
      if (signal?.aborted) throw err;
      passageContent = null;
    }
  }
  return bankItemToBuilderQuestion(item, passageContent);
}
