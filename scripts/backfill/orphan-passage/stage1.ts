// ============================================================================
// orphan-passage / stage1 — 지워진 지문 하나(=무리)의 「동일 전문」 재연결 대상 고르기(순수).
//
//  1) 무리의 재구성본(저장본·재조립·재구성·근사) 중 같은 학원 살아 있는 지문과 정규화 전문이 완전히 같은 것 → 적중.
//     같은 전문 지문이 여럿이면 가장 오래된 것(passage-delete-guard.chooseRelinkTarget 과 같은 규칙).
//  2) 적중마다 증거 기준: 빌더 저장본이 적중했거나, 서로 다른 문항 2개 이상의 재구성본이 적중해야 한다
//     (생성기가 순서 문항 지문을 고쳐 쓴 실측 사례 — 재구성본 하나만으로는 원문이라 단정 못 한다).
//  3) 문항별 근거(evidence.judgeGroup): 그 대상과 같은 글에서 나온 문항만 잇는다. 잡이 여러 지문을 섞은 무리는
//     대상마다 자기 문항만 가져가고, 지문 글이 없는 source 유형 문항은 균질한 무리에서만 잇는다.
//  4) 한 문항이 두 대상에 모두 걸리면 잇지 않는다(모호). 못 이은 무리는 근접(낱말 겹침 ≥ 0.85) 후보를 검토 목록에.
// ============================================================================
import type { LivePassage, SnapshotRow } from "./load";
import type { Group, ReviewItem } from "./plan";
import { judgeGroup, type GroupVerdict } from "./evidence";
import { normalizeForIdentity, tokenSimilarity, type Reconstruction, type ReconstructionSource } from "./reconstruct";

const NEAR_MATCH = 0.85;

export function passageIndex(passages: readonly LivePassage[]) {
  const byAcademy = new Map<string, Map<string, LivePassage[]>>();
  for (const p of passages) {
    const norm = normalizeForIdentity(p.content);
    if (!norm) continue;
    const m = byAcademy.get(p.academyId) ?? new Map<string, LivePassage[]>();
    m.set(norm, [...(m.get(norm) ?? []), p]);
    byAcademy.set(p.academyId, m);
  }
  return byAcademy;
}

/** passage-delete-guard.chooseRelinkTarget 과 같은 선택 규칙: 가장 먼저 만든 것, 다음 id. */
export function oldestPassage(list: readonly LivePassage[]): LivePassage {
  return [...list].sort((a, b) => {
    const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return dt !== 0 ? dt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

export type AcceptedTarget = { passage: LivePassage; via: string[]; verdict: GroupVerdict; linkable: string[] };

export function planStage1ForGroup(
  g: Group,
  recs: readonly Reconstruction[],
  ctx: {
    academyPassages: Map<string, LivePassage[]> | undefined;
    livePassages: readonly LivePassage[];
    snapshots: readonly SnapshotRow[];
  },
): { accepted: AcceptedTarget[]; reviews: ReviewItem[] } {
  const reviews: ReviewItem[] = [];
  const review = (kind: ReviewItem["kind"], candidates: ReviewItem["candidates"], note: string) =>
    reviews.push({ kind, academyId: g.academyId, deletedPassageId: g.deletedPassageId, questionIds: g.questions.map((q) => q.id), candidates, note });

  const hits = new Map<string, { passage: LivePassage; via: string[] }>();
  for (const r of recs) {
    const list = ctx.academyPassages?.get(normalizeForIdentity(r.content));
    if (!list?.length) continue;
    const target = oldestPassage(list);
    const h = hits.get(target.id) ?? { passage: target, via: [] };
    h.via.push(`${r.source}:${r.fromQuestionId}`);
    hits.set(target.id, h);
  }

  const candidatesAccepted: AcceptedTarget[] = [];
  for (const { passage, via } of hits.values()) {
    const cand = [{ passageId: passage.id, title: passage.title, similarity: 1, via: via[0].split(":")[0] as ReconstructionSource }];
    const viaSnapshot = via.some((v) => v.startsWith("snapshot:"));
    const viaQuestions = new Set(via.map((v) => v.split(":")[1])).size;
    const verdict = judgeGroup(g.questions, passage.content, ctx.snapshots);
    const members = new Set(verdict.linkable);
    const want = normalizeForIdentity(passage.content);
    const snapshotDisagrees = ctx.snapshots.some(
      (s) => members.has(s.questionId) && normalizeForIdentity(s.passageContent) !== want,
    );
    if (snapshotDisagrees) {
      review("conflict", cand, "이 지문과 같은 글의 문항인데 빌더 저장본 글이 다르다 — 저장본이 원문이므로 자동 재연결 안 함");
    } else if (!(viaSnapshot || viaQuestions >= 2)) {
      review("single-source-exact", cand, `전문 일치 증거가 문항 하나(${via[0]})뿐이다 — 생성기 변형 가능성 때문에 사람이 확인한 뒤에만 재연결`);
    } else if (verdict.linkable.length === 0) {
      review("heterogeneous-group", cand, "전문은 일치하지만 이 무리에 그 글에서 나왔다고 보일 문항이 없다");
    } else {
      candidatesAccepted.push({ passage, via, verdict, linkable: verdict.linkable });
    }
  }

  // 두 대상에 모두 걸린 문항은 잇지 않는다.
  const seen = new Map<string, number>();
  for (const a of candidatesAccepted) for (const id of a.linkable) seen.set(id, (seen.get(id) ?? 0) + 1);
  const accepted = candidatesAccepted
    .map((a) => ({ ...a, linkable: a.linkable.filter((id) => seen.get(id) === 1) }))
    .filter((a) => a.linkable.length > 0);
  if (accepted.length > 0 || hits.size > 0) return { accepted, reviews };

  // 적중 없음 → 근접 후보(재구성본 전부 × 길이 비슷한 지문, 후보별 최댓값).
  const distinct = [...new Map(recs.map((r) => [normalizeForIdentity(r.content), r])).values()].slice(0, 8);
  const best = new Map<string, ReviewItem["candidates"][number]>();
  for (const p of ctx.livePassages) {
    if (p.academyId !== g.academyId) continue;
    for (const r of distinct) {
      const ratio = p.content.length / Math.max(1, r.content.length);
      if (ratio <= 0.7 || ratio >= 1.4) continue;
      const similarity = Number(tokenSimilarity(r.content, p.content).toFixed(3));
      if (similarity < NEAR_MATCH) continue;
      const prev = best.get(p.id);
      if (!prev || prev.similarity < similarity) best.set(p.id, { passageId: p.id, title: p.title, similarity, via: r.source });
    }
  }
  const near = [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  if (near.length) review("near-match", near, "낱말 겹침만 높다(전문 불일치) — 사람이 확인한 뒤에만 재연결");
  return { accepted, reviews };
}
