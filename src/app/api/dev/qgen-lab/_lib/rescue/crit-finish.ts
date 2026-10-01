// crit 마무리 — 수정 적용본의 게이트 통과본 탐색(순수 코드) + 채택본 사후 진단(jev 0콜: 알려진 DG·pBroke 재사용)·기록 필드.
import type { RunResult, StrategyRecord } from "@/lib/qgen-lab/types";
import type { LabParsed } from "../parse-gate";
import type { AnswerMenuItem } from "./answer-menu";
import { applyChanges, changeSubsets, type Change, type ChangePlan } from "./crit-revise";
import type { Critique } from "./critique";
import type { DecoyMenuItem } from "./decoy-picker";
import { answerOf, displayOf, LABELS, type ItemModel } from "./item-model";
import { renderV2Md } from "./item-render";
import { analyzeAnswer } from "./lint-answer";
import { lintDecoy } from "./lint-decoy";

export interface RevisionPick {
  item: ItemModel;
  text: string;
  applied: Change[];
  skipped: string[];
  templateAll: boolean;
  /** 게이트 통과본을 못 찾으면 전체 적용본(이슈 포함) — 기록용. */
  clean: boolean;
  tried: number;
}

/** 변경 부분집합(큰 것부터) × {원 분석, 전부 템플릿} 순으로 렌더·게이트 — 첫 통과본. 없으면 전체 적용본(clean=false). */
export function searchCleanRevision(draft: ItemModel, plan: ChangePlan, gate: (text: string) => LabParsed, memo: string): RevisionPick | null {
  let first: RevisionPick | null = null;
  let tried = 0;
  for (const subset of changeSubsets(plan.changes)) {
    for (const templateAll of [false, true]) {
      const r = applyChanges(draft, subset, { templateAll });
      if (r.applied.length === 0) continue;
      const text = renderV2Md(r.item, `${memo} ${r.applied.map((c) => c.menuId).join("+")}${templateAll ? " (분석 템플릿)" : ""}`);
      tried++;
      const g = gate(text);
      const pick: RevisionPick = { item: r.item, text, applied: r.applied, skipped: r.skipped, templateAll, clean: g.gateIssues.length === 0, tried };
      if (!first) first = pick;
      if (pick.clean) return pick;
    }
  }
  return first ? { ...first, tried } : null;
}

export interface FinalDiag {
  labChecks: Partial<RunResult["labChecks"]>;
  residualFlags: string[];
  provenance: NonNullable<StrategyRecord["provenance"]>;
}

/** 채택본 사후 진단 — 초안 그대로면 비평 값, 수정본이면 새 자리는 메뉴 값(DG·pBroke)·코드 린트 재계산. */
export function finalDiagnosis(
  item: ItemModel,
  crit: Critique | null,
  menus: { decoy: DecoyMenuItem[]; answer: AnswerMenuItem[] },
  memoDist: number | null,
  gateIssues: string[],
): FinalDiag {
  const disp = displayOf(item.passage, item.marks);
  const ans = answerOf(item);
  const ansDisp = disp.marks.find((m) => m.role === "answer")!;
  const answerChanged = ans.from.startsWith("menu:");
  const analysis = analyzeAnswer(disp, ansDisp, item.fix, { memoDist: answerChanged ? null : memoDist });
  const dgOf = (m: ItemModel["marks"][number]): number | null => {
    if (m.from.startsWith("menu:")) return menus.decoy.find((x) => `menu:${x.id}` === m.from)?.dg ?? null;
    return crit?.decoys.find((d) => d.mark.start === m.start && d.mark.end === m.end)?.dg ?? null;
  };
  let t1 = 0;
  let dgMax: number | null = null;
  for (const dm of disp.marks.filter((m) => m.role !== "answer")) {
    const dg = dgOf(dm);
    if (lintDecoy(disp, dm).t1) t1++;
    if (dg != null) dgMax = dgMax == null ? dg : Math.max(dgMax, dg);
  }
  const pBroke = answerChanged ? menus.answer.find((x) => `menu:${x.id}` === ans.from)?.pBroke ?? null : crit?.answer.pBroke ?? null;
  const exempt = answerChanged ? false : crit?.answer.exempt ?? false;
  const residualFlags = [
    ...(t1 > 0 ? [`t1=${t1}`] : []),
    ...(dgMax != null && dgMax >= 0.8 ? [`dgMax=${dgMax.toFixed(2)}`] : []),
    ...(!exempt && pBroke != null && pBroke < 0.3 ? [`pBroke=${pBroke.toFixed(2)}`] : []),
    ...(analysis.depth === "R" ? [`R(${analysis.rlint.join("+")})`] : []),
    ...(gateIssues.length > 0 ? ["gate"] : []),
  ];
  return {
    labChecks: {
      t1Hits: t1,
      answerFamily: analysis.fam,
      answerDepthCode: analysis.depth,
      memoAnswerDist: answerChanged ? null : memoDist,
    },
    residualFlags,
    provenance: disp.marks.map((m, i) => ({
      label: `(${LABELS[i]})`,
      role: m.role,
      from: m.from,
      start: m.start,
      end: m.end,
    })),
  };
}

/** 비평 결과 → StrategyRecord.diagnosis. */
export function diagnosisRecord(crit: Critique): NonNullable<StrategyRecord["diagnosis"]> {
  return {
    t1: crit.t1,
    dgMax: crit.dgMax,
    answerPBroke: crit.answer.pBroke,
    answerDepth: crit.answer.analysis.depth,
    flags: crit.flags,
  };
}
