// ============================================================================
// orphan-passage / plan — 고아 문항 복구 계획(순수 — DB·시계 무의존, 입력이 같으면 결과가 같다).
//
//  0단계 고객(이스팀): 지워진 「The Modern Digital Rabbit Hole」(cmucuyvcz…) 로 만든 문항 → 「day 6」(cmu72l2t9…).
//        먼저 **정규화 전문이 완전히 같은지** 형제 문항 재구성·저장본으로 증명한다. 증명 못 하면 blocked(쓰기 0).
//  1단계 동일 전문 재연결(플랫폼 전역): 지워진 지문마다 재구성본 하나라도 같은 학원의 살아 있는 지문과
//        정규화 전문이 완전히 같으면 그 지문으로 문항을 다시 잇는다(대상 고르기 = 가장 오래된 것 → id).
//        서로 다른 지문과 각각 같으면 충돌 → 검토. 근접(낱말 겹침 ≥ 0.85)은 검토 목록에만.
//  0·1단계 공통 — 자동 적용은 **문항별 근거가 있는 문항만**(evidence.partitionLinkable, 26-09-30 AB-R1):
//        exact·consistent, 또는 1:1 잡 기록이 그 문항과 「지워진 지문 ≡ 대상」을 함께 증명한 것(job-1to1).
//        근거 없는(no-evidence) 문항은 relinkReview 로 — 검토본에서 approved:true 로 바꾼 것만 적용된다.
//  2단계 원문 보관(_sourcePassage): stage2.ts. **전부 사람 검토 대상**(requiresReview).
//  지문이 필요 없는 문항(발문에 지문 내장)은 손대지 않는다.
//
//  적용 단위(26-09-30 GA-1 · COH-17): 단계마다 따로 승인 · 적용한다. planHash(plan, stages) 는 고른 단계의 쓰기 내용만
//        묶는다 — 0단계만 검토 · 승인했으면 1단계 데이터가 바뀌어도 0단계 적용은 막히지 않고, 검토하지 않은 단계는
//        적용 범위(applyScope)에 없으므로 쓰이지 않는다(apply.validateApplyRequest).
//  잡 재연결(26-09-30 GA-2): 0단계는 잡을 **잇지 않는다**(jobs 는 늘 빈 목록, 남은 잡은 jobsLeftUnlinked 에 보고만).
//        인쇄 · HWPX · DOCX 복구에는 문항 재연결만 필요하고, PASSAGE_ANALYSIS 잡을 day 6 에 붙이면 스튜디오 지문 화면이
//        「최근 종결 분석 잡」(createdAt desc)으로 상태를 파생해 표시가 바뀐다. 1단계도 QUESTION_GENERATION 잡만 잇는다
//        (분석 · 그 밖 잡은 jobsSkipped 에 보고만).
// ============================================================================
import { createHash } from "node:crypto";
import type { BackfillData, OrphanQuestion } from "./load";
import { normalizeForIdentity, reconstructionsFromSibling, type Reconstruction, type ReconstructionSource } from "./reconstruct";
import { jobProvesSource, judgeGroup, partitionLinkable, type Consistency, type LinkEvidence } from "./evidence";
import { passageIndex, planStage1ForGroup } from "./stage1";
import { planStage2, SOURCE_RANK } from "./stage2";

/** 계획 파일 형식. 적용은 같은 형식의 검토본만 받는다(apply.validateApplyRequest). 2 = relinkReview 도입,
 *  3 = 단계별 적용 범위(applyScope · 단계별 해시) · 0단계 잡 재연결 제거 · 1단계 생성 잡만(26-09-30 GA-1 · GA-2). */
export const PLAN_VERSION = 3;

/** 적용 단위. 0 = 고객(이스팀) day 6 재연결, 1 = 동일 전문 재연결(전역), 2 = 원문 보관. 재연결 검토 대기는 자기 stage 를 따른다. */
export type Stage = 0 | 1 | 2;
export const ALL_STAGES: readonly Stage[] = [0, 1, 2];
/** 잡 재연결은 이 도메인만(1단계). 분석 잡(PASSAGE_ANALYSIS)은 지문 화면 상태를 바꾸므로 잇지 않는다(GA-2). */
export const RELINKABLE_JOB_DOMAINS: ReadonlySet<string> = new Set(["QUESTION_GENERATION"]);

/** "0" · "0,1" · "all" → 정렬된 단계 목록. 잘못된 값은 null. */
export function parseStages(raw: string | undefined | null): Stage[] | null {
  if (raw == null) return null;
  const text = raw.trim().toLowerCase();
  if (text === "all") return [...ALL_STAGES];
  const parts = text.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((x) => !/^[012]$/.test(x))) return null;
  return [...new Set(parts.map((x) => Number(x) as Stage))].sort();
}
export const stagesLabel = (stages: readonly Stage[]) => (sameStages(stages, ALL_STAGES) ? "all" : stages.join(","));
export function sameStages(a: readonly Stage[], b: readonly Stage[]): boolean {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export const STAGE0 = {
  academyId: "cmtrdob3m0000jm04nf2ce50c",
  deletedPassageId: "cmucuyvcz0001jw04yxlx0tpa",
  targetPassageId: "cmu72l2t90001l504hnlmakrh",
  /** 26-09-29 RCA(docs/customers/eastim-print-hwpx-2609.md)가 확정한 19~32번 14문항 — 교차 확인용 */
  expectedQuestionIds: [
    "cmucv2zz80029l30453xrh4sy", "cmucv32pi0007l704uq9ycpo9", "cmucv35800007l204awvidj2b",
    "cmucv3klh00bjl604xl64glgb", "cmucv3pfv0009l604217kidx6", "cmucv3pxk00bwl604sdbgo8s3",
    "cmucv3qfp00c5l604yqs03etg", "cmucv3vrw00cel60499sdn3dm", "cmucv41l800cnl6049a5rhw4k",
    "cmucv4ad200cwl604govw7dhe", "cmucv4d7c00d1l6041ls1q2zo", "cmucv4g1o00d6l604bwlmbo1x",
    "cmucv4nyh00dbl604opn5okns", "cmucv5b3e00dol604lccst5ma",
  ],
} as const;

export type RelinkItem = {
  action: "relink-question";
  stage: 0 | 1;
  questionId: string;
  academyId: string;
  deletedPassageId: string;
  toPassageId: string;
  /** 문항별 근거(자동 적용 까닭) — 검토 대기 항목은 "no-evidence" */
  evidence: LinkEvidence | "no-evidence";
  before: { passageId: null };
};

/** 문항별 근거 없이 「무리가 균질하다」는 것만으로 이을 후보 — 검토본에서 approved:true 로 바꾼 것만 적용. */
export type PendingRelinkItem = RelinkItem & {
  evidence: "no-evidence";
  subType: string | null;
  inExams: string[];
  /** 1:1 잡 기록이 이 문항을 지워진 지문에서 나왔다고 증명하지만 무리의 닻(exact 문항의 잡 증명)이 없는 경우 true */
  jobProvesQuestion: boolean;
  requiresReview: true;
  approved: boolean;
  note: string;
};

export type RelinkJobItem = { action: "relink-job"; stage: 0 | 1; jobId: string; domain: string; academyId: string; deletedPassageId: string; toPassageId: string };
/** 잇지 않고 남긴 잡(보고용 — 해시 · 쓰기에 들어가지 않는다) */
export type UnlinkedJob = { jobId: string; domain: string; academyId: string; deletedPassageId: string; reason: string };

export type SourcePassageItem = {
  action: "set-source-passage";
  stage: 2;
  questionId: string;
  academyId: string;
  subType: string | null;
  deletedPassageId: string | null;
  source: ReconstructionSource;
  fromQuestionId: string;
  fromExamId: string | null;
  /** 같은 정규화 전문을 낸 다른 원천 수(0 = 단독) */
  corroboratedBy: number;
  /** 서로 다른 전문을 낸 원천이 있으면 true(검토 시 주의) */
  conflicting: boolean;
  requiresReview: true;
  /** 검토자가 계획 파일에서 true 로 바꾼 것만 적용된다. */
  approved: boolean;
  title: string;
  content: string;
  contentChars: number;
  inExams: string[];
  before: { structuredDataMd5: string; structuredData: unknown };
  after: { structuredData: unknown };
};

export type ReviewItem = {
  kind: "near-match" | "conflict" | "single-source-exact" | "heterogeneous-group" | "rp-still-exists";
  academyId: string;
  deletedPassageId: string | null;
  questionIds: string[];
  candidates: Array<{ passageId: string; title: string; similarity: number; via: ReconstructionSource }>;
  note: string;
};

export type Group = {
  key: string;
  academyId: string;
  deletedPassageId: string | null;
  jobTitle: string;
  questions: OrphanQuestion[];
};

export type Plan = {
  planVersion: typeof PLAN_VERSION;
  generatedAt: string;
  scope: { academyId: string | null };
  stage0: {
    status: "ready" | "blocked" | "not-in-scope" | "already-done";
    reasons: string[];
    verifiedBy: string[];
    expectedMissing: string[];
    unexpected: string[];
    homogeneous: boolean | null;
    excluded: Array<{ questionId: string; consistency: Consistency }>;
    items: RelinkItem[];
    /** 늘 빈 목록 — 0단계는 잡을 잇지 않는다(GA-2). 형식 호환을 위해 남긴다. */
    jobs: RelinkJobItem[];
    /** 지워진 지문을 가리키는 잡(보고만) */
    jobsLeftUnlinked: UnlinkedJob[];
  };
  stage1: {
    groups: Array<{
      academyId: string;
      deletedPassageId: string;
      toPassageId: string;
      toTitle: string;
      via: string[];
      homogeneous: boolean;
      /** 자동 적용 문항 */
      questionIds: string[];
      /** 검토 대기 문항(relinkReview) */
      pendingQuestionIds: string[];
      excluded: Array<{ questionId: string; consistency: Consistency }>;
    }>;
    items: RelinkItem[];
    jobs: RelinkJobItem[];
    /** 무리 조건은 맞지만 생성 잡이 아니라 잇지 않은 잡(보고만) */
    jobsSkipped: UnlinkedJob[];
  };
  /** 0·1단계 재연결 중 문항별 근거가 없는 것 — 사람 검토(approved:true)가 있어야 적용 */
  relinkReview: { items: PendingRelinkItem[] };
  stage2: { items: SourcePassageItem[] };
  review: ReviewItem[];
  unrecoverable: Array<{ questionId: string; academyId: string; subType: string | null; deletedPassageId: string | null; reason: string; inExams: string[] }>;
  untouched: { embeddedOrNoPassageNeeded: number; alreadyDetached: number };
  counts: Record<string, number>;
  /** 전 단계(0·1·2) 쓰기 내용 해시 — 파일 무결성 확인용 */
  planHash: string;
  /** dry-run 이 적은 적용 범위: 이 단계들만 검토 · 승인 대상이고, --apply --stages 는 이것과 같아야 한다 */
  applyScope?: { stages: Stage[]; hash: string };
};

export function groupOrphans(data: BackfillData): Group[] {
  const orphanById = new Map(data.orphans.map((o) => [o.id, o]));
  const linkOf = new Map<string, { rp: string | null; title: string }>();
  for (const j of data.jobLinks) {
    if (!orphanById.has(j.questionId) || linkOf.has(j.questionId)) continue;
    linkOf.set(j.questionId, { rp: j.resultPassageId, title: j.title });
  }
  const groups = new Map<string, Group>();
  for (const o of data.orphans) {
    const link = linkOf.get(o.id);
    const rp = link?.rp ?? null;
    const key = rp ? `${o.academyId}:${rp}` : `${o.academyId}:solo:${o.id}`;
    const g = groups.get(key) ?? { key, academyId: o.academyId, deletedPassageId: rp, jobTitle: link?.title ?? "", questions: [] };
    g.questions.push(o);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function groupReconstructions(g: Group, data: BackfillData): Reconstruction[] {
  const ids = new Set(g.questions.map((q) => q.id));
  const out: Reconstruction[] = data.snapshots
    .filter((s) => ids.has(s.questionId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((s) => ({ source: "snapshot" as const, fromQuestionId: s.questionId, fromExamId: s.examId, content: s.passageContent }));
  for (const q of g.questions) out.push(...reconstructionsFromSibling(q));
  return out.sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
}

export function buildPlan(data: BackfillData, opts: { academyId: string | null; generatedAt: string }): Plan {
  const groups = groupOrphans(data);
  const index = passageIndex(data.livePassages);
  const liveById = new Map(data.livePassages.map((p) => [p.id, p]));
  const examsOf = new Map<string, string[]>();
  for (const u of data.examUses) examsOf.set(u.questionId, [...(examsOf.get(u.questionId) ?? []), u.examId]);
  const jobsFor = (academyId: string, rp: string) => data.relinkableJobs.filter((j) => j.rp === rp && j.academyId === academyId);
  /** 1단계 잡 재연결 — 생성 잡만(RELINKABLE_JOB_DOMAINS). 나머지는 jobsSkipped 로 보고만. */
  const stage1JobsOf = (academyId: string, rp: string, to: string): RelinkJobItem[] => {
    const all = jobsFor(academyId, rp);
    for (const j of all.filter((x) => !RELINKABLE_JOB_DOMAINS.has(x.domain))) {
      plan.stage1.jobsSkipped.push({ jobId: j.id, domain: j.domain, academyId, deletedPassageId: rp, reason: "생성 잡이 아니다(분석 잡을 이으면 지문 화면 상태가 바뀐다 — GA-2)" });
    }
    return all
      .filter((j) => RELINKABLE_JOB_DOMAINS.has(j.domain))
      .map((j) => ({ action: "relink-job", stage: 1, jobId: j.id, domain: j.domain, academyId, deletedPassageId: rp, toPassageId: to }));
  };
  const plan: Plan = {
    planVersion: PLAN_VERSION,
    generatedAt: opts.generatedAt,
    scope: { academyId: opts.academyId },
    stage0: { status: "not-in-scope", reasons: [], verifiedBy: [], expectedMissing: [], unexpected: [], homogeneous: null, excluded: [], items: [], jobs: [], jobsLeftUnlinked: [] },
    stage1: { groups: [], items: [], jobs: [], jobsSkipped: [] },
    relinkReview: { items: [] },
    stage2: { items: [] },
    review: [],
    unrecoverable: [],
    untouched: { embeddedOrNoPassageNeeded: 0, alreadyDetached: 0 },
    counts: {},
    planHash: "",
  };
  const relinked = new Set<string>();
  const pendingIds = new Set<string>();

  /**
   * 이을 문항(linkable)을 자동/검토로 나눠 싣는다(잡이 여러 지문을 섞은 무리에서 다른 글의 문항을 잇지 않게 —
   * 자동은 문항별 근거가 있는 것만). 돌려주는 값: 자동 항목·검토 대기 문항 id.
   */
  const partitionRelinks = (g: Group, to: string, stage: 0 | 1, linkable: readonly string[], byQuestion: ReadonlyMap<string, Consistency>) => {
    const rp = g.deletedPassageId as string;
    const { auto, pending } = partitionLinkable(linkable, byQuestion, rp, data.jobLinks);
    const base = (questionId: string) => ({ action: "relink-question" as const, stage, questionId, academyId: g.academyId, deletedPassageId: rp, toPassageId: to, before: { passageId: null } });
    const items: RelinkItem[] = auto.map((a) => ({ ...base(a.questionId), evidence: a.evidence }));
    for (const id of pending) {
      const q = g.questions.find((x) => x.id === id);
      plan.relinkReview.items.push({
        ...base(id),
        evidence: "no-evidence",
        subType: q?.subType ?? null,
        inExams: examsOf.get(id) ?? [],
        jobProvesQuestion: jobProvesSource(data.jobLinks, id, rp),
        requiresReview: true,
        approved: false,
        note: "문항에 지문을 담은 글이 없어(주제·제목·요지·내용일치·요약·영작 등) 대상 글에서 나왔다는 문항별 근거가 없다 — 무리 균질만으로는 자동 적용하지 않는다",
      });
      pendingIds.add(id);
    }
    items.forEach((i) => relinked.add(i.questionId));
    return { items, pending };
  };

  // ── 0단계 ──
  const g0 = groups.find((g) => g.academyId === STAGE0.academyId && g.deletedPassageId === STAGE0.deletedPassageId);
  if (!opts.academyId || opts.academyId === STAGE0.academyId) {
    const target = liveById.get(STAGE0.targetPassageId);
    const s0 = plan.stage0;
    const got = new Set(g0?.questions.map((q) => q.id) ?? []);
    s0.expectedMissing = STAGE0.expectedQuestionIds.filter((id) => !got.has(id));
    s0.unexpected = [...got].filter((id) => !(STAGE0.expectedQuestionIds as readonly string[]).includes(id));
    if (!g0) {
      s0.status = s0.expectedMissing.length === STAGE0.expectedQuestionIds.length ? "already-done" : "blocked";
      s0.reasons.push("지워진 지문으로 만든 고아 문항이 없다(이미 복구됐거나 데이터가 바뀜)");
    } else if (!target || target.academyId !== STAGE0.academyId) {
      s0.status = "blocked";
      s0.reasons.push("대상 지문(day 6)이 없거나 다른 학원이다");
    } else {
      const want = normalizeForIdentity(target.content);
      const recs = groupReconstructions(g0, data);
      s0.verifiedBy = recs.filter((r) => normalizeForIdentity(r.content) === want).map((r) => `${r.source}:${r.fromQuestionId}`);
      if (s0.verifiedBy.length === 0) {
        s0.status = "blocked";
        s0.reasons.push("정규화 전문 완전 일치를 증명하지 못했다(재구성본 중 day 6 과 같은 것이 없음)");
      } else {
        const verdict = judgeGroup(g0.questions, target.content, data.snapshots);
        s0.homogeneous = verdict.homogeneous;
        s0.excluded = verdict.excluded;
        const { items, pending } = partitionRelinks(g0, target.id, 0, verdict.linkable, verdict.byQuestion);
        if (items.length === 0 && pending.length === 0) {
          s0.status = "blocked";
          s0.reasons.push("전문은 일치하지만 문항별 근거로 이을 수 있는 문항이 없다");
        } else {
          // ready = 전문 일치 증명 완료. 자동 항목이 없고 검토 대기만 있어도 ready(승인된 검토 항목만 적용된다).
          s0.status = "ready";
          if (items.length === 0) s0.reasons.push("문항별 근거로 자동 이을 문항이 없다 — 검토 대기(relinkReview) 승인분만 적용");
          s0.items = items;
          // 잡은 잇지 않는다(GA-2) — 인쇄 복구에 필요 없고, 분석 잡을 이으면 day 6 의 지문 화면 상태가 바뀐다. 보고만.
          s0.jobs = [];
          s0.jobsLeftUnlinked = jobsFor(g0.academyId, STAGE0.deletedPassageId).map((j) => ({
            jobId: j.id, domain: j.domain, academyId: j.academyId, deletedPassageId: STAGE0.deletedPassageId, reason: "0단계는 문항만 잇는다(GA-2)",
          }));
        }
      }
    }
  }

  // ── 1단계 ──
  for (const g of groups) {
    if (!g.deletedPassageId || g === g0) continue;
    if (data.existingPassageIds.has(g.deletedPassageId)) {
      plan.review.push({
        kind: "rp-still-exists",
        academyId: g.academyId,
        deletedPassageId: g.deletedPassageId,
        questionIds: g.questions.map((q) => q.id),
        candidates: [],
        note: "생성 잡의 지문이 아직 있는데 문항만 끊겼다 — 수동 해제 여부 확인",
      });
      continue;
    }
    const recs = groupReconstructions(g, data);
    const { accepted, reviews } = planStage1ForGroup(g, recs, {
      academyPassages: index.get(g.academyId),
      livePassages: data.livePassages,
      snapshots: data.snapshots,
    });
    plan.review.push(...reviews);
    for (const a of accepted) {
      const { items, pending } = partitionRelinks(g, a.passage.id, 1, a.linkable, a.verdict.byQuestion);
      plan.stage1.groups.push({
        academyId: g.academyId,
        deletedPassageId: g.deletedPassageId,
        toPassageId: a.passage.id,
        toTitle: a.passage.title,
        via: a.via,
        homogeneous: a.verdict.homogeneous,
        questionIds: items.map((i) => i.questionId),
        pendingQuestionIds: pending,
        excluded: a.verdict.excluded,
      });
      plan.stage1.items.push(...items);
      // 잡의 지문 기록은 무리가 균질하고 대상이 하나이며 검토 대기 문항이 없을 때만 되살린다
      // (섞인 잡은 어느 한 지문의 잡이라고 말할 수 없고, 근거 없는 문항이 남으면 섞였는지 알 수 없다).
      if (a.verdict.homogeneous && accepted.length === 1 && pending.length === 0) {
        plan.stage1.jobs.push(...stage1JobsOf(g.academyId, g.deletedPassageId, a.passage.id));
      }
    }
  }

  // ── 2단계 ── (0·1단계로 이은 문항과 재연결 검토 대기 문항은 건너뛴다)
  planStage2(plan, groups, data, {
    skip: new Set([...relinked, ...pendingIds]),
    examsOf,
    generatedAt: opts.generatedAt,
    recsOf: (g) => groupReconstructions(g, data),
  });

  plan.counts = countPlan(plan, data);
  plan.planHash = planHash(plan);
  return plan;
}

function countPlan(plan: Plan, data: BackfillData): Record<string, number> {
  const bySource = (s: ReconstructionSource) => plan.stage2.items.filter((i) => i.source === s).length;
  const inExam = (ids: string[]) => ids.filter((id) => data.examUses.some((u) => u.questionId === id)).length;
  const rr = plan.relinkReview.items;
  const byEvidence = (items: RelinkItem[], e: RelinkItem["evidence"]) => items.filter((i) => i.evidence === e).length;
  return {
    orphansLive: data.orphans.length,
    orphanAcademies: new Set(data.orphans.map((o) => o.academyId)).size,
    stage0Questions: plan.stage0.items.length,
    stage0Jobs: plan.stage0.jobs.length,
    stage0JobsLeftUnlinked: plan.stage0.jobsLeftUnlinked.length,
    stage0ByJobProof: byEvidence(plan.stage0.items, "job-1to1"),
    stage0PendingReview: rr.filter((i) => i.stage === 0).length,
    stage1DeletedPassages: plan.stage1.groups.length,
    stage1Questions: plan.stage1.items.length,
    stage1QuestionsInExams: inExam(plan.stage1.items.map((i) => i.questionId)),
    stage1ByExact: byEvidence(plan.stage1.items, "exact"),
    stage1ByConsistent: byEvidence(plan.stage1.items, "consistent"),
    stage1ByJobProof: byEvidence(plan.stage1.items, "job-1to1"),
    stage1Jobs: plan.stage1.jobs.length,
    stage1JobsSkipped: plan.stage1.jobsSkipped.length,
    stage1PendingReview: rr.filter((i) => i.stage === 1).length,
    relinkReviewInExams: rr.filter((i) => i.inExams.length > 0).length,
    relinkReviewJobProvesQuestion: rr.filter((i) => i.jobProvesQuestion).length,
    stage2Questions: plan.stage2.items.length,
    stage2QuestionsInExams: plan.stage2.items.filter((i) => i.inExams.length > 0).length,
    stage2FromSnapshot: bySource("snapshot"),
    stage2FromReassembly: bySource("reassembly"),
    stage2FromReconstruction: bySource("reconstruction"),
    stage2FromApproximate: bySource("approximate"),
    stage2Conflicting: plan.stage2.items.filter((i) => i.conflicting).length,
    reviewNearMatch: plan.review.filter((r) => r.kind === "near-match").length,
    reviewConflict: plan.review.filter((r) => r.kind === "conflict").length,
    reviewSingleSourceExact: plan.review.filter((r) => r.kind === "single-source-exact").length,
    reviewRpStillExists: plan.review.filter((r) => r.kind === "rp-still-exists").length,
    unrecoverable: plan.unrecoverable.length,
    unrecoverableHeterogeneous: plan.unrecoverable.filter((u) => u.reason === "heterogeneous-group").length,
    stage0Excluded: plan.stage0.excluded.length,
    stage1ExcludedQuestions: plan.stage1.groups.reduce((a, g) => a + g.excluded.length, 0),
    stage1HeterogeneousGroups: plan.stage1.groups.filter((g) => !g.homogeneous).length,
    reviewHeterogeneous: plan.review.filter((r) => r.kind === "heterogeneous-group").length,
    unrecoverableInExams: plan.unrecoverable.filter((u) => u.inExams.length > 0).length,
    untouchedEmbedded: plan.untouched.embeddedOrNoPassageNeeded,
    untouchedAlreadyDetached: plan.untouched.alreadyDetached,
  };
}

/**
 * 검토 표시(approved)와 생성 시각을 뺀 쓰기 내용의 해시 — 적용 직전 재계산 값과 같아야 한다(데이터 변동 감지).
 * stages 를 주면 **그 단계의 쓰기 내용만** 묶는다(단계별 승인 단위 — GA-1). 기본 = 전 단계(파일 무결성).
 * 0단계 몫 = 0단계 재연결(ready 일 때) + stage 0 재연결 검토 대기, 1단계 몫 = 1단계 재연결 · 잡 + stage 1 검토 대기, 2단계 몫 = 원문 보관.
 */
export function planHash(
  plan: Pick<Plan, "stage0" | "stage1" | "stage2" | "scope"> & { relinkReview?: Plan["relinkReview"] },
  stages: readonly Stage[] = ALL_STAGES,
): string {
  const on = new Set(stages);
  const all = sameStages(stages, ALL_STAGES);
  const canon = {
    scope: plan.scope,
    ...(all ? {} : { stages: [...on].sort() }),
    s0: on.has(0) && plan.stage0.status === "ready" ? [plan.stage0.items, plan.stage0.jobs] : [],
    s1: on.has(1) ? [plan.stage1.items, plan.stage1.jobs] : [],
    rr: (plan.relinkReview?.items ?? [])
      .filter((i) => on.has(i.stage))
      .map((i) => ({ q: i.questionId, s: i.stage, to: i.toPassageId, p: i.deletedPassageId, a: i.academyId })),
    s2: on.has(2) ? plan.stage2.items.map((i) => ({ q: i.questionId, md5: i.before.structuredDataMd5, c: i.content, t: i.title, p: i.deletedPassageId })) : [],
  };
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

/** dry-run 이 검토본에 적용 범위를 적는다 — 이 단계만 검토 · 승인 대상이다. */
export function withApplyScope(plan: Plan, stages: readonly Stage[]): Plan {
  const sorted = [...new Set(stages)].sort() as Stage[];
  return { ...plan, applyScope: { stages: sorted, hash: planHash(plan, sorted) } };
}
