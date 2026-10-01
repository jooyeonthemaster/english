// crit 수정 콜(RESCUE-SPEC §5.4-4·5) — 프롬프트(축자)·strict 스키마·출력 파싱·코드 적용.
// 코드 적용 규칙: 메뉴에 없는 선택·지적되지 않은 대상·중복 선택·배치 제약 위반(겹침·게이트 간격)은 keep.
// 분석 문장은 §4.7 작가 코드 검사를 거치고 실패하면 템플릿. 렌더 후 게이트는 호출측(strategies/crit.ts)이 한다 —
// 게이트 실패 시 새 분석을 템플릿으로 바꿔 보고, 그래도 실패하면 변경 부분집합(큰 것부터)으로 게이트 통과본을 찾는다.
import type { LabJsonSchema } from "../grammar-prompt";
import type { AnswerMenuItem } from "./answer-menu";
import type { Critique } from "./critique";
import { CAT_KO, gateSpacingOk, type DecoyMenuItem } from "./decoy-picker";
import { NUMS, numberedOf, type ItemMark, type ItemModel } from "./item-model";
import { answerTemplate, checkAnalysis, decoyTemplate, vetDecoyAnalysis } from "./item-render";

export const CRIT_SCHEMA: LabJsonSchema = {
  name: "grammar_item_revision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer", "decoys"],
    properties: {
      answer: {
        type: "object",
        additionalProperties: false,
        required: ["action", "choice", "explanation"],
        properties: {
          action: { type: "string", enum: ["keep", "replace"] },
          choice: { type: ["string", "null"], description: "정답 후보 id(A1~A3). keep 이면 null" },
          explanation: { type: ["string", "null"], description: "새 정답 해설 1~2문장(합니다체). keep 이면 null" },
        },
      },
      decoys: {
        type: "array",
        description: "지적된 미끼마다 한 항목",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["target", "action", "choice", "analysis"],
          properties: {
            target: { type: "integer", description: "지적된 미끼의 번호(①=1 … ⑤=5)" },
            action: { type: "string", enum: ["keep", "replace"] },
            choice: { type: ["string", "null"], description: "미끼 후보 id(M1~M6). keep 이면 null" },
            analysis: { type: ["string", "null"], description: "새 자리가 옳은 이유 1문장(합니다체). keep 이면 null" },
          },
        },
      },
    },
  },
};

/** §5.4 수정 프롬프트(축자 틀 — {} 자리만 채운다). */
export function buildRevisePrompt(item: ItemModel, crit: Critique, decoyMenu: DecoyMenuItem[], answerMenu: AnswerMenuItem[]): string {
  const ans = crit.answer;
  const lines = [
    ...crit.decoys.filter((d) => d.flagged).map((d) => `- ${NUMS[d.no - 1]} ${d.mark.shown}: ${d.reason}`),
    ...(ans.flagged ? [`- 정답 ${NUMS[ans.no - 1]} ${ans.mark.shown}: ${ans.reason}`] : []),
  ];
  const dm = decoyMenu.map((m) => `${m.id} 문장${m.sentenceNo} "${m.surface}" (${CAT_KO[m.cat] ?? m.cat})`).join(" · ") || "없음";
  const am =
    answerMenu
      .map((m) => {
        const cue = m.fam === "agreement" && m.clue && m.dist != null ? `, 판정 단서 '${m.clue}' ${m.dist}단어 앞` : "";
        return `${m.id} 문장${m.sentenceNo} "${m.surface}" → "${m.wrong}" (${m.famKo}${cue})`;
      })
      .join(" · ") || "없음";
  return `너는 수능 영어 어법 문항을 검토하는 출제위원이다. 아래 초안을 기계 검사가 점검해 문제가 있는 밑줄을 지적했다. 지적된 것만 고쳐라 — 지적되지 않은 밑줄·정답은 그대로 둔다.
## 초안 (화면 표시 형태)
${numberedOf(item.passage, item.marks)}
정답: ${NUMS[ans.no - 1]}  고침: ${item.fix}
## 검사 결과
${lines.join("\n")}
## 교체 후보 (검사를 통과한 자리 — 이 목록 안에서만 고른다)
미끼 후보: ${dm}
정답 후보: ${am}
## 할 일
- 지적된 미끼마다: 후보 중 학생이 가장 그럴듯하게 다른 형태로 고치고 싶어질 자리를 하나 고르고, 그 자리가 옳은 이유를 1문장 합니다체로 쓴다. 이미 밑줄이 있는 문장은 피한다. 모두 약하면 keep.
- 정답이 지적되었으면: 판정 단서가 가장 멀고 오형이 로컬로 자연스러운 후보 하나를 고르고 해설 1~2문장을 쓴다. 모두 부적합하면 keep.
- 인용에 없는 영어 단어를 새로 쓰지 마라. 유혹·심리 서사 금지.`;
}

export interface ReviseOut {
  answer: { action: "keep" | "replace"; choice: string | null; explanation: string | null };
  decoys: { target: number; action: "keep" | "replace"; choice: string | null; analysis: string | null }[];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const act = (v: unknown): "keep" | "replace" => (v === "replace" ? "replace" : "keep");

/** 수정 콜 원문 → 구조(코드펜스 허용). 형상 불일치면 null. */
export function parseReviseOutput(text: string): ReviseOut | null {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try {
      j = JSON.parse(raw.slice(s, e + 1));
    } catch {
      return null;
    }
  }
  if (!j || typeof j !== "object") return null;
  const o = j as { answer?: Record<string, unknown>; decoys?: unknown };
  if (!o.answer || typeof o.answer !== "object" || !Array.isArray(o.decoys)) return null;
  return {
    answer: { action: act(o.answer.action), choice: str(o.answer.choice), explanation: str(o.answer.explanation) },
    decoys: (o.decoys as Record<string, unknown>[])
      .filter((d) => d && typeof d === "object")
      .map((d) => ({ target: Number(d.target), action: act(d.action), choice: str(d.choice), analysis: str(d.analysis) })),
  };
}

export interface Change {
  kind: "decoy-swap" | "answer-menu";
  menuId: string;
  /** 교체될 원 밑줄(초안). */
  from: ItemMark;
  /** 새 밑줄. */
  to: ItemMark;
  /** 정답 교체면 새 고침·해설. */
  fix?: string;
  answerAnalysis?: string;
  templated: boolean;
  detail: string;
}

export interface ChangePlan {
  changes: Change[];
  keeps: number;
  rejected: string[];
  /** 분석 문장 코드 검사 횟수·템플릿 수(작가 기록). */
  vetted: number;
  templated: number;
}

/** 수정 출력 → 검증된 변경 목록(메뉴·지적 대상·중복만 검사, 배치는 applyChanges). */
export function planChanges(item: ItemModel, crit: Critique, decoyMenu: DecoyMenuItem[], answerMenu: AnswerMenuItem[], out: ReviseOut): ChangePlan {
  const plan: ChangePlan = { changes: [], keeps: 0, rejected: [], vetted: 0, templated: 0 };
  const ans = crit.answer;
  if (ans.flagged) {
    const pick = out.answer.action === "replace" ? answerMenu.find((m) => m.id === out.answer.choice) : undefined;
    if (!pick) {
      plan.keeps++;
      if (out.answer.action === "replace") plan.rejected.push(`answer: 메뉴 밖 선택 ${out.answer.choice ?? "null"}`);
    } else {
      plan.vetted++;
      const ok = checkAnalysis(out.answer.explanation, { passage: item.passage, forms: [pick.wrong, pick.surface], maxChars: 200 });
      if (!ok) plan.templated++;
      plan.changes.push({
        kind: "answer-menu",
        menuId: pick.id,
        from: ans.mark,
        to: { start: pick.start, end: pick.end, shown: pick.wrong, original: pick.surface, code: pick.code, role: "answer", analysis: null, from: `menu:${pick.id}` },
        fix: pick.surface,
        answerAnalysis: ok ?? answerTemplate(pick.surface),
        templated: !ok,
        detail: `${NUMS[ans.no - 1]} ${ans.mark.shown}→${pick.id} "${pick.surface}"→"${pick.wrong}" (${pick.famKo}, pBroke ${pick.pBroke.toFixed(2)})`,
      });
    }
  } else if (out.answer.action === "replace") plan.rejected.push("answer: 지적되지 않은 정답 교체 무시");
  const used = new Set<string>();
  for (const d of crit.decoys.filter((x) => x.flagged)) {
    const entry = out.decoys.find((e) => e.target === d.no);
    const pick = entry && entry.action === "replace" ? decoyMenu.find((m) => m.id === entry.choice) : undefined;
    if (!pick || used.has(pick.id)) {
      plan.keeps++;
      if (entry?.action === "replace") plan.rejected.push(`decoy ${NUMS[d.no - 1]}: ${pick ? "중복 선택" : "메뉴 밖 선택"} ${entry.choice ?? "null"}`);
      continue;
    }
    used.add(pick.id);
    plan.vetted++;
    const to: ItemMark = { start: pick.start, end: pick.end, shown: pick.surface, original: pick.surface, code: pick.code, role: "decoy", analysis: null, from: `menu:${pick.id}` };
    const v = vetDecoyAnalysis(item.passage, to, entry!.analysis);
    if (v.templated) plan.templated++;
    to.analysis = v.text;
    plan.changes.push({
      kind: "decoy-swap",
      menuId: pick.id,
      from: d.mark,
      to,
      templated: v.templated,
      detail: `${NUMS[d.no - 1]} ${d.mark.shown}→${pick.id} "${pick.surface}" (${CAT_KO[pick.cat] ?? pick.cat}, DG ${pick.dg.toFixed(2)})`,
    });
  }
  for (const e of out.decoys) if (!crit.decoys.some((d) => d.flagged && d.no === e.target) && e.action === "replace") plan.rejected.push(`decoy target ${e.target}: 지적되지 않은 밑줄 교체 무시`);
  return plan;
}

/** 변경을 차례로 적용(정답 먼저) — 겹침·게이트 간격·새 형용사/부사 미끼 2개 이상이면 그 변경은 건너뛴다. */
export function applyChanges(item: ItemModel, changes: Change[], opts: { templateAll?: boolean } = {}): { item: ItemModel; applied: Change[]; skipped: string[] } {
  let marks = [...item.marks];
  let fix = item.fix;
  let answerAnalysis = item.answerAnalysis;
  const applied: Change[] = [];
  const skipped: string[] = [];
  const ordered = [...changes].sort((a, b) => Number(a.kind !== "answer-menu") - Number(b.kind !== "answer-menu"));
  for (const ch of ordered) {
    const rest = marks.filter((m) => m !== ch.from);
    const clash = rest.some((m) => (ch.to.start < m.end && m.start < ch.to.end) || !gateSpacingOk(item.passage, m, ch.to));
    const adjadv = ch.kind === "decoy-swap" && ch.to.code === "f" && applied.some((x) => x.kind === "decoy-swap" && x.to.code === "f");
    if (!marks.includes(ch.from) || clash || adjadv) {
      skipped.push(`${ch.menuId}: ${clash ? "배치 제약" : adjadv ? "형용사/부사 새 미끼 2개" : "대상 없음"}`);
      continue;
    }
    const to: ItemMark = { ...ch.to };
    if (opts.templateAll && to.role === "decoy") to.analysis = decoyTemplate(to.code);
    marks = [...rest, to].sort((a, b) => a.start - b.start);
    if (ch.kind === "answer-menu") {
      fix = ch.fix ?? fix;
      answerAnalysis = opts.templateAll ? answerTemplate(fix) : ch.answerAnalysis ?? answerTemplate(fix);
    }
    applied.push(ch);
  }
  return { item: { passage: item.passage, marks, fix, answerAnalysis }, applied, skipped };
}

/** 변경 부분집합(큰 것부터, 같은 크기는 정답 교체 포함 우선) — 게이트 통과본 탐색용. */
export function changeSubsets(changes: Change[]): Change[][] {
  const n = changes.length;
  const subsets: Change[][] = [];
  for (let mask = (1 << n) - 1; mask > 0; mask--) subsets.push(changes.filter((_, i) => mask & (1 << i)));
  return subsets.sort(
    (a, b) => b.length - a.length || Number(b.some((c) => c.kind === "answer-menu")) - Number(a.some((c) => c.kind === "answer-menu")),
  );
}
