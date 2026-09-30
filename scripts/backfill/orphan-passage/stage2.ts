// ============================================================================
// orphan-passage / stage2 — 원문 보관(_sourcePassage) 후보(순수). plan.ts 에서 떼어 냈다(동작 보존).
//
// 0·1단계로 잇지 않은 문항 가운데 인쇄에 지문이 필요한(isSourcePassageMissing) 것에, 빌더 저장본 → 형제 재조립 →
// 형제 재구성 → 근사본 순으로 원문을 structuredData._sourcePassage 에 넣는다. **전부 사람 검토 대상**(requiresReview).
// 재연결 검토 대기(relinkReview) 문항은 건너뛴다 — 같은 문항에 재연결과 원문 보관이 함께 승인되면 뒤 연산의
// 가드(passageId IS NULL)가 0행이 되어 적용 전체가 롤백되기 때문이다. 재연결을 거절하면 다음 dry-run 에서 다시 판정된다.
// ============================================================================
import { isSourcePassageMissing, readDetachedSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import { mergeSourcePassageSnapshot } from "@/actions/workbench/_lib/passage-delete-guard";
import type { BackfillData, OrphanQuestion } from "./load";
import type { Group, Plan } from "./plan";
import { normalizeForIdentity, type Reconstruction, type ReconstructionSource } from "./reconstruct";
import { judgeGroup } from "./evidence";

/** 구성상 원문 그대로인 원천 — 빌더 저장본뿐(순서 재조립은 생성기 변형 실측으로 제외). 2단계 충돌 표시 기준. */
const EXACT_SOURCES = new Set<ReconstructionSource>(["snapshot"]);
export const SOURCE_RANK: Record<ReconstructionSource, number> = { snapshot: 0, reassembly: 1, reconstruction: 2, approximate: 3 };

/**
 * 빌릴 글: ① 형제 문항의 빌더 저장본(그 지문이 실제로 찍힌 글 — 최신순) 중 무리가 균질한 것,
 * ② 없으면 재조립·재구성·근사본 가운데 지지 문항이 가장 많은 전문(동률이면 원천 순위) 중 무리가 균질한 것. 없으면 null.
 */
function consensusSource(g: Group, recs: readonly Reconstruction[], data: BackfillData): Reconstruction | null {
  const snap = recs.find((r) => r.source === "snapshot" && judgeGroup(g.questions, r.content, data.snapshots).homogeneous);
  if (snap) return snap;
  const byText = new Map<string, { rec: Reconstruction; support: Set<string> }>();
  for (const r of recs) {
    if (r.source === "snapshot") continue;
    const key = normalizeForIdentity(r.content);
    const e = byText.get(key) ?? { rec: r, support: new Set<string>() };
    e.support.add(r.fromQuestionId);
    if (SOURCE_RANK[r.source] < SOURCE_RANK[e.rec.source]) e.rec = r;
    byText.set(key, e);
  }
  const ranked = [...byText.values()].sort(
    (a, b) => b.support.size - a.support.size || SOURCE_RANK[a.rec.source] - SOURCE_RANK[b.rec.source],
  );
  return ranked.find((e) => judgeGroup(g.questions, e.rec.content, data.snapshots).homogeneous)?.rec ?? null;
}

function needsPassage(q: OrphanQuestion): boolean {
  return isSourcePassageMissing({ subType: q.subType, questionText: q.questionText, structuredData: q.structuredData, passage: null });
}

/** 2단계 후보를 plan.stage2 · unrecoverable · untouched 에 채운다. skip = 0·1단계로 이었거나 재연결 검토 대기인 문항. */
export function planStage2(
  plan: Plan,
  groups: readonly Group[],
  data: BackfillData,
  ctx: {
    skip: ReadonlySet<string>;
    examsOf: ReadonlyMap<string, string[]>;
    generatedAt: string;
    recsOf: (g: Group) => Reconstruction[];
  },
): void {
  for (const g of groups) {
    const recs = ctx.recsOf(g);
    let borrowedOf: Reconstruction | null | undefined;
    for (const q of g.questions) {
      if (ctx.skip.has(q.id)) continue;
      if (!needsPassage(q)) {
        plan.untouched.embeddedOrNoPassageNeeded += 1;
        continue;
      }
      if (readDetachedSourcePassage(q.structuredData)) {
        plan.untouched.alreadyDetached += 1;
        continue;
      }
      // 자기 저장본이 1순위(그 문항과 함께 인쇄된 글 그대로). 없으면 형제 원천 중 **무리가 그 글에 대해 균질한** 것만
      // 빌린다 — 잡이 여러 지문을 섞은 무리에서 다른 글을 넣지 않게(evidence.ts). 빌릴 글은 가장 많은 형제 문항이
      // 같은 전문을 낸 것(재조립이 생성기 변형일 수 있어 원천 종류보다 합의를 앞세운다).
      const own = recs.filter((r) => r.source === "snapshot" && r.fromQuestionId === q.id);
      if (!own.length && borrowedOf === undefined) borrowedOf = consensusSource(g, recs, data);
      const chosen = own[0] ?? borrowedOf ?? undefined;
      const unrecoverable = (reason: string) =>
        plan.unrecoverable.push({
          questionId: q.id,
          academyId: g.academyId,
          subType: q.subType,
          deletedPassageId: g.deletedPassageId,
          reason,
          inExams: ctx.examsOf.get(q.id) ?? [],
        });
      if (!chosen) {
        unrecoverable(recs.length ? "heterogeneous-group" : "no-source");
        continue;
      }
      const norm = normalizeForIdentity(chosen.content);
      const others = recs.filter((r) => r !== chosen);
      const title = data.snapshots.find((s) => s.questionId === chosen.fromQuestionId && s.examId === chosen.fromExamId)?.passageTitle || g.jobTitle || "";
      const snapshot = { passageId: g.deletedPassageId ?? "", title, content: chosen.content, detachedAt: ctx.generatedAt };
      const merged = mergeSourcePassageSnapshot(q.structuredData, snapshot);
      if (merged.mode === "unsupported") {
        unrecoverable("structuredData-unsupported");
        continue;
      }
      plan.stage2.items.push({
        action: "set-source-passage",
        stage: 2,
        questionId: q.id,
        academyId: g.academyId,
        subType: q.subType,
        deletedPassageId: g.deletedPassageId,
        source: chosen.source,
        fromQuestionId: chosen.fromQuestionId,
        fromExamId: chosen.fromExamId ?? null,
        corroboratedBy: others.filter((r) => normalizeForIdentity(r.content) === norm).length,
        // 충돌은 빌더 저장본(구성상 원문 그대로)과 다를 때만. 재조립·재구성·근사본은 생성기 변형·마커 제거 때문에
        // 서로 달라지는 게 정상이라 충돌로 치지 않는다(같은 전문을 낸 원천 수는 corroboratedBy 로 따로 센다).
        conflicting: others.some((r) => EXACT_SOURCES.has(r.source) && normalizeForIdentity(r.content) !== norm),
        requiresReview: true,
        approved: false,
        title,
        content: chosen.content,
        contentChars: chosen.content.length,
        inExams: ctx.examsOf.get(q.id) ?? [],
        before: { structuredDataMd5: q.sdMd5, structuredData: q.structuredData },
        after: { structuredData: merged.value },
      });
    }
  }
}
