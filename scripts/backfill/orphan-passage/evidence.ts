// ============================================================================
// orphan-passage / evidence — 문항 하나하나가 후보 지문과 「같은 글에서 나왔는지」 판정(순수).
//
// 왜 필요한가(실측 26-09-30): 생성 잡 result.passageId 는 잡 단위 기록이라, 여러 지문을 한 잡으로 돌린 경우
// result.questionIds 에 **다른 지문에서 나온 문항**이 섞인다(예: 잡 제목 「The high price of land …」 인데 같은
// 목록에 「Think about a time when you were startled…」·「Otherwise the mission …」 문항). 그래서 잡으로 묶은
// 무리 전체를 한 지문에 잇거나, 형제 문항의 원문을 빌려 쓰면 다른 글이 들어갈 수 있다.
//
// 판정(문항 q, 후보 글 T):
//   exact         q 자신의 저장본·재구성본 중 하나가 T 와 정규화 전문 완전 일치
//   consistent    q 가 지문을 담은 글(저장본·재구성본, 또는 지문 내장형의 발문)을 가졌고 T 낱말의 85% 이상을 담는다
//   uncertain     60~85% — 생성기가 고쳐 쓴 순서 문항처럼 같은 글의 변형일 수 있다(잇지 않는다)
//   inconsistent  60% 미만 — 다른 글에서 나온 문항
//   no-evidence   q 에 지문을 담은 글이 없다(주제·제목·요지·내용일치·요약문·영작 등 — 발문·선지뿐.
//                 발문이 길어도 지문 내장형(passage-policy.questionHasEmbeddedPassage)이 아니면 지문으로 보지 않는다)
// 무리(group)가 T 에 대해 균질 = inconsistent 문항이 없다. no-evidence 문항은 균질한 무리에서만 「이을 수 있는」
// 후보가 되지만, **자동 적용은 문항별 근거가 있을 때만**이다(partitionLinkable — 26-09-30 AB-R1):
//   균질은 「글을 가진 문항 중 다른 글이 없다」는 뜻일 뿐이라, 섞여 들어온 다른 지문의 문항이 모두 source 유형이면
//   원리상 걸러지지 않는다. 그래서 no-evidence 문항은 (a) 그 문항만 낸 1:1 잡이 clientTempId 로 지워진 지문을
//   가리키고 (b) 같은 무리의 exact 문항 하나도 그렇게 증명돼 「지워진 지문 ≡ 대상」이 닻을 내렸을 때만 자동이고,
//   아니면 검토 목록(approved:true 로 바꿔야 적용)으로 간다.
// ============================================================================
import type { JobLink, OrphanQuestion, SnapshotRow } from "./load";
import { questionHasEmbeddedPassage } from "@/components/exams/paper-builder/passage-policy";
import { normalizeForIdentity, reconstructionsFromSibling, stripDisplayMarkers, tokenRecall } from "./reconstruct";

export type Consistency = "exact" | "consistent" | "inconsistent" | "uncertain" | "no-evidence";

const CONSISTENT = 0.85;
const INCONSISTENT = 0.6;
const MIN_WORDS_FOR_TEXT = 60;

/** q 자신의 저장본·재구성본(정규화) 목록. */
export function ownExactTexts(q: OrphanQuestion, snapshots: readonly SnapshotRow[]): string[] {
  const out = snapshots.filter((s) => s.questionId === q.id).map((s) => normalizeForIdentity(s.passageContent));
  for (const r of reconstructionsFromSibling(q)) out.push(normalizeForIdentity(r.content));
  return out.filter(Boolean);
}

/**
 * q 가 가진 「지문을 담은 글」 하나: 저장본 → 재구성본 → (지문 내장형이고 60낱말 이상이면) 표시 마커를 걷은 발문.
 * 요약문·영작·주제 같은 source 유형의 긴 발문은 지시문·요약문일 뿐 지문이 아니다 — null(no-evidence).
 */
export function ownPassageText(q: OrphanQuestion, snapshots: readonly SnapshotRow[]): string | null {
  const snap = snapshots.find((s) => s.questionId === q.id);
  if (snap) return snap.passageContent;
  const rec = reconstructionsFromSibling(q)[0];
  if (rec) return rec.content;
  const embedded = questionHasEmbeddedPassage({ subType: q.subType, questionText: q.questionText, structuredData: q.structuredData });
  const words = q.questionText.trim().split(/\s+/).length;
  return embedded && words >= MIN_WORDS_FOR_TEXT ? stripDisplayMarkers(q.questionText) : null;
}

export function consistencyOf(q: OrphanQuestion, target: string, snapshots: readonly SnapshotRow[]): Consistency {
  const want = normalizeForIdentity(target);
  if (ownExactTexts(q, snapshots).some((t) => t === want)) return "exact";
  const text = ownPassageText(q, snapshots);
  if (!text) return "no-evidence";
  const recall = tokenRecall(text, target);
  if (recall >= CONSISTENT) return "consistent";
  if (recall < INCONSISTENT) return "inconsistent";
  return "uncertain";
}

export type GroupVerdict = {
  homogeneous: boolean;
  byQuestion: Map<string, Consistency>;
  /** 이을 수 있는 문항: exact/consistent + (균질할 때만) no-evidence */
  linkable: string[];
  /** 잇지 않는 문항과 까닭 */
  excluded: Array<{ questionId: string; consistency: Consistency }>;
};

export function judgeGroup(
  questions: readonly OrphanQuestion[],
  target: string,
  snapshots: readonly SnapshotRow[],
): GroupVerdict {
  const byQuestion = new Map<string, Consistency>();
  for (const q of questions) byQuestion.set(q.id, consistencyOf(q, target, snapshots));
  const verdicts = [...byQuestion.values()];
  const homogeneous = verdicts.every((v) => v !== "inconsistent");
  const linkable: string[] = [];
  const excluded: GroupVerdict["excluded"] = [];
  for (const q of questions) {
    const c = byQuestion.get(q.id) as Consistency;
    if (c === "exact" || c === "consistent" || (c === "no-evidence" && homogeneous)) linkable.push(q.id);
    else excluded.push({ questionId: q.id, consistency: c });
  }
  return { homogeneous, byQuestion, linkable, excluded };
}

/**
 * 잡 기록이 「q 는 지워진 지문 X 로 만든 문항」임을 증명하는가: q 를 낸 생성 잡 중 지문 기록이 있는 것이 모두 X 이고,
 * 그중 하나가 q 하나만 낸 잡(result.questionIds 1개)이며 config.clientTempId 에 X 가 들어 있다(빠른 생성 경로 —
 * 고객 0단계 14잡이 이 모양, RCA 설계 F1). 여러 문항을 낸 AUTO 잡은 다른 지문 문항이 섞여(cmq6frvn9 실측) 근거가 못 된다.
 */
export function jobProvesSource(links: readonly JobLink[], questionId: string, deletedPassageId: string): boolean {
  const mine = links.filter((j) => j.questionId === questionId && j.resultPassageId);
  if (mine.length === 0 || mine.some((j) => j.resultPassageId !== deletedPassageId)) return false;
  return mine.some((j) => Number(j.jobQuestionCount) === 1 && typeof j.clientTempId === "string" && j.clientTempId.includes(deletedPassageId));
}

export type LinkEvidence = "exact" | "consistent" | "job-1to1";

export type LinkPartition = {
  /** 자동 적용 — 문항별 근거가 있는 것(근거 종류와 함께) */
  auto: Array<{ questionId: string; evidence: LinkEvidence }>;
  /** 이을 후보지만 문항별 근거가 없다(no-evidence) — 검토본에서 approved:true 로 바꾼 것만 적용 */
  pending: string[];
};

/**
 * 이을 문항(linkable)을 자동/검토로 나눈다. exact·consistent 는 자동. no-evidence 는 잡 기록이 그 문항과
 * 「지워진 지문 ≡ 대상」(같은 무리의 exact 문항 하나가 잡으로도 X 에서 나왔다고 증명됨) 둘 다 증명할 때만 자동.
 */
export function partitionLinkable(
  linkable: readonly string[],
  byQuestion: ReadonlyMap<string, Consistency>,
  deletedPassageId: string,
  links: readonly JobLink[],
): LinkPartition {
  const proven = (id: string) => jobProvesSource(links, id, deletedPassageId);
  const anchored = linkable.some((id) => byQuestion.get(id) === "exact" && proven(id));
  const auto: LinkPartition["auto"] = [];
  const pending: string[] = [];
  for (const id of linkable) {
    const c = byQuestion.get(id);
    if (c === "exact" || c === "consistent") auto.push({ questionId: id, evidence: c });
    else if (anchored && proven(id)) auto.push({ questionId: id, evidence: "job-1to1" });
    else pending.push(id);
  }
  return { auto, pending };
}
