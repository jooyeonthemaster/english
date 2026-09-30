// ============================================================================
// export-parity / web-facets — 웹 정본(CORE-MODEL 공용 모듈)이 「무엇을 찍는지」 → 문항별 면
//
// 웹 상세·인쇄·빌더 재오픈이 쓰는 그대로 부른다(복제 없음):
//   buildPaperItemsFromExam → buildGroups(그룹 지문 박스) · inlineSourcePassageForItem(문항 안 지문)
//   resolvePaperLayout(답란·메타 기본값) · answerKeyEntries(정답표 표기)
// 탐침(probe.ts)이 심긴 입력을 받으면 그룹/문항 안 지문 텍스트에 탐침이 살아 있는지도 확인한다
// (살아 있지 않으면 내보내기 쪽 계측이 그 지문을 못 보므로 probeLost 로 보고한다).
// 절대 불변 조건(compare.passageInvariantViolations)도 여기서 잰다 — 상대 비교가 못 보는 「세 출력이 같이 틀림」.
// ============================================================================
import {
  buildPaperItemsFromExam,
  isPaperItemSourcePassageMissing,
  parseSavedPaperSettings,
  type SavedPaperExamQuestion,
} from "@/components/exams/paper-builder/saved-paper-items";
import { buildGroups } from "@/components/exams/paper-builder/paper-item-groups";
import { inlineSourcePassageForItem } from "@/components/exams/paper-builder/paper-export-items";
import {
  isFlowStructuredSubtype,
  questionStemAndBody,
  structuredSegments,
} from "@/components/exams/paper-builder/question-body-layout";
import { isSetMemberItem, passageSetKindFor } from "@/components/exams/paper-builder/paper-item-model";
import { isSourcePassageForcedForPrint, questionHasEmbeddedPassage } from "@/components/exams/paper-builder/passage-policy";
import { resolvePaperLayout } from "@/components/exams/paper-builder/paper-layout-defaults";
import { answerKeyEntries } from "@/components/exams/paper-builder/answer-key-entries";
import type { PaperItem } from "@/components/exams/paper-builder/types";
import { findSentinels } from "./probe";
import { passageInvariantViolations, type InvariantViolation, type PassageFacet, type QuestionFacets } from "./compare";

export type WebModel = {
  facets: Map<string, QuestionFacets>;
  /** 문항 id → 같은 웹 그룹(groupId 기준, 비문항 블록으로 쪼개진 조각 포함) 멤버 */
  groupOf: Map<string, Set<string>>;
  subTypeOf: Map<string, string | null>;
  /** 웹이 지문 박스를 그리는데 그 텍스트에서 탐침을 못 찾은 문항(계측 사각지대) */
  probeLost: string[];
  /** 「원문 지문 없음」 — 지문이 필요한 유형인데 인쇄할 지문이 없는 문항(CORE isPaperItemSourcePassageMissing) */
  missingPassage: string[];
  /** 인쇄할 지문이 있고 반드시 실어야 하는 문항(requiresPassageForItem) */
  requiresPassage: Set<string>;
  /** 웹 정본의 절대 불변 조건 위반(지문 두 번 · 실어야 할 지문 없음) — 게이트 FAIL 사유 */
  invariants: InvariantViolation[];
  items: PaperItem[];
};

/**
 * 지문을 반드시 실어야 하는 문항 — 인쇄할 지문(EXAM-PAPER-MODEL §3 결정본)이 있고,
 *  (a) 인쇄 강제 규칙(EXAM-PAPER-MODEL §2 강제 목록 isSourcePassageForcedForPrint — 기출 세트 멤버는 세트 토글이 정하므로 제외), 또는
 *  (b) 판정된 includePassage 가 true 인데 발문에 지문이 들어 있지 않다(발문에 지문 전문이 있으면 지문 필드 박스는
 *      안 찍는 게 맞다 — 실측: SYNONYM 6건이 includePassage=true·발문 내장).
 * 세트·지문 묶음의 멤버는 그룹 박스가 싣는다(passageInvariantViolations 가 그룹 박스를 인정한다).
 */
export function requiresPassageForItem(item: PaperItem): boolean {
  if (item.blockType !== "question" || !item.passageContent.trim()) return false;
  const q = item.sourceQuestion;
  const forced = passageSetKindFor(q) !== "gichul" && isSourcePassageForcedForPrint(q);
  return forced || (item.includePassage && !questionHasEmbeddedPassage(q));
}

/**
 * 웹이 문항 머리 뒤에 찍는 글(발문·본문·문항 안 지문·선지). 구조화 유형은 structuredSegments(세트 멤버는
 * 조판이 버리는 passage 박스 제외 — inlineSourcePassageForItem 과 같은 규칙), 그 밖은 발문 전체.
 */
export function webAfterHeadText(item: PaperItem, inlineText = inlineSourcePassageForItem(item)): string {
  const NL = "\n";
  const options = item.options.map((o) => o.text).join(NL);
  if (!isFlowStructuredSubtype(item.sourceQuestion.subType)) return [item.questionText, options].join(NL);
  const dropPassageBoxes = isSetMemberItem(item);
  const segs = structuredSegments(item)
    .filter((seg) => !(dropPassageBoxes && seg.kind === "box" && seg.boxStyle === "passage"))
    .map((seg) => ("text" in seg ? seg.text : ""))
    .join(NL);
  const extraInline = inlineText && !segs.includes(inlineText) ? inlineText : "";
  return [questionStemAndBody(item).stem, segs, extraInline, options].join(NL);
}

function countOwn(text: string, token: string): number {
  return findSentinels(text).filter((t) => t === token).length;
}

export function buildWebModel(
  examQuestions: readonly SavedPaperExamQuestion[],
  settingsRaw: string | null,
  ownerByToken: ReadonlyMap<string, string>,
): WebModel {
  const settings = parseSavedPaperSettings(settingsRaw);
  const items = buildPaperItemsFromExam(examQuestions, settings);
  const groups = buildGroups(items);
  const layout = resolvePaperLayout(settings);
  const answers = answerKeyEntries(items);

  const groupOf = new Map<string, Set<string>>();
  const membersByGroupId = new Map<string, Set<string>>();
  for (const g of groups) {
    const qids = g.items.filter((it) => it.blockType === "question").map((it) => it.questionId);
    if (qids.length === 0) continue;
    const set = membersByGroupId.get(g.id) ?? new Set<string>();
    qids.forEach((q) => set.add(q));
    membersByGroupId.set(g.id, set);
    qids.forEach((q) => groupOf.set(q, set));
  }

  const preByQuestion = new Map<string, number>();
  const probeLost: string[] = [];
  for (const g of groups) {
    const leader = g.items.find((it) => it.blockType === "question");
    if (!leader) continue;
    const printsBox = g.includePassage && Boolean(g.passageContent.trim());
    if (!printsBox) continue;
    preByQuestion.set(leader.questionId, (preByQuestion.get(leader.questionId) ?? 0) + 1);
    const members = membersByGroupId.get(g.id) ?? new Set<string>();
    const owners = findSentinels(g.passageContent).map((t) => ownerByToken.get(t));
    if (ownerByToken.size > 0 && !owners.some((o) => o && members.has(o))) probeLost.push(leader.questionId);
  }

  const answerByOrder = new Map<number, string>();
  for (const a of answers) if (!answerByOrder.has(a.orderNum)) answerByOrder.set(a.orderNum, a.answer);

  const facets = new Map<string, QuestionFacets>();
  const subTypeOf = new Map<string, string | null>();
  const tokenOf = new Map<string, string>();
  for (const [token, q] of ownerByToken) if (!tokenOf.has(q)) tokenOf.set(q, token);
  for (const item of items) {
    if (item.blockType !== "question") continue;
    const inlineText = inlineSourcePassageForItem(item);
    const ownToken = tokenOf.get(item.questionId);
    if (inlineText && ownToken && !inlineText.includes(ownToken)) probeLost.push(item.questionId);
    const passage: PassageFacet = {
      pre: preByQuestion.get(item.questionId) ?? 0,
      // 탐침을 쓰면 「머리 뒤에 찍히는 글 전체」에서 자기 지문 토큰 수를 센다 — 문항 안 지문 박스뿐 아니라
      // 지문 필드에서 다시 만든 발문(어법·어휘 마커 정본화 normalizePaperFields 등)도 웹이 실제로 찍는 지문이다.
      inline: ownToken ? countOwn(webAfterHeadText(item, inlineText), ownToken) : inlineText ? 1 : 0,
    };
    const hasLines = layout.showAnswerSpace && item.answerSpaceLines > 0;
    facets.set(item.questionId, {
      questionId: item.questionId,
      orderNum: item.orderNum,
      passage,
      answerSpace: { present: hasLines, lines: hasLines ? item.answerSpaceLines : 0 },
      metaBadge: layout.showQuestionMeta,
      answerKey: answerByOrder.get(item.orderNum) ?? null,
    });
    subTypeOf.set(item.questionId, item.sourceQuestion.subType ?? null);
  }
  const missingPassage = items.filter((it) => isPaperItemSourcePassageMissing(it)).map((it) => it.questionId);
  const requiresPassage = new Set(items.filter(requiresPassageForItem).map((it) => it.questionId));
  const invariants = passageInvariantViolations({ facets, groupOf: (q) => groupOf.get(q), requiresPassage });
  return { facets, groupOf, subTypeOf, probeLost, missingPassage, requiresPassage, invariants, items };
}
