// ============================================================================
// 지문 삭제 영향 요약 + 확인창 문구 — 확인창이 실제 동작을 그대로 말하게 한다.
//
// 예전 문구 「관련 문제도 모두 삭제됩니다」는 거짓이었다(문항은 남고 지문만 끊겼다).
// 이제 삭제는 passage-delete-guard.ts 정책을 따르고, 문구는 그 계획에서 만든다:
//   - 동일 지문이 있으면 → 「문제 N개를 같은 내용의 지문 「X」에 옮겨 연결한 뒤 삭제」
//   - 없으면           → 「이 지문으로 만든 문제 N개(시험지 M개에서 사용 중)는
//                          지문 원문을 보관한 채 남습니다」
//   - RESTRICT 참조     → 「…에 연결돼 있어 삭제하지 않습니다」
// 순수 모듈(서버·테스트 공용). 클라이언트로는 결과 문자열만 내려간다.
// ============================================================================

import {
  RESTRICT_RELATION_LABELS,
  type PassageCascadeCounts,
  type PassageDeletionPlan,
  type RestrictRelation,
} from "./passage-delete-guard";

export type PassageDeleteNoun = "지문" | "학습지";

export interface PassageDeletionImpactItem {
  passageId: string;
  title: string;
  liveQuestionCount: number;
  trashedQuestionCount: number;
  exams: Array<{ id: string; title: string }>;
  relinkTarget: { id: string; title: string } | null;
  blockedBy: Array<{ relation: RestrictRelation; count: number }>;
  cascade: PassageCascadeCounts;
}

export interface PassageDeletionImpact {
  requested: number;
  notFoundCount: number;
  items: PassageDeletionImpactItem[];
}

export interface PassageDeletionConfirm {
  title: string;
  description: string;
  /** 실제로 지워질 지문 수. 0 이면 확인창 대신 안내만 띄운다. */
  deletableCount: number;
  blockedCount: number;
}

/** 클라이언트로 내려보낼 모양 — 지문 본문은 싣지 않는다. */
export function toPassageDeletionImpact(plan: PassageDeletionPlan): PassageDeletionImpact {
  return {
    requested: plan.requestedIds.length,
    notFoundCount: plan.notFoundIds.length,
    items: plan.items.map((it) => ({
      passageId: it.passage.id,
      title: it.passage.title,
      liveQuestionCount: it.liveQuestionCount,
      trashedQuestionCount: it.trashedQuestionCount,
      exams: it.exams,
      relinkTarget: it.relinkTarget
        ? { id: it.relinkTarget.id, title: it.relinkTarget.title }
        : null,
      blockedBy: it.blockedBy,
      cascade: it.cascade,
    })),
  };
}

const NOUN_OBJ: Record<PassageDeleteNoun, string> = { 지문: "지문을", 학습지: "학습지를" };
const NOUN_TOPIC: Record<PassageDeleteNoun, string> = { 지문: "지문은", 학습지: "학습지는" };
const NOUN_SUBJ: Record<PassageDeleteNoun, string> = { 지문: "지문이", 학습지: "학습지가" };
const NOUN_INSTR: Record<PassageDeleteNoun, string> = { 지문: "지문으로", 학습지: "학습지로" };

function quoteTitle(title: string): string {
  const t = title.trim() || "제목 없음";
  return `「${t.length > 40 ? `${t.slice(0, 40)}…` : t}」`;
}

function examPhrase(exams: Array<{ id: string; title: string }>): string {
  if (exams.length === 0) return "";
  // 같은 제목의 시험지가 여럿이면 이름은 한 번만(개수는 그대로 센다).
  const unique = [...new Set(exams.map((e) => e.title.trim() || "제목 없음"))];
  const names = unique.slice(0, 2);
  const more = unique.length > 2 ? " 등" : "";
  return `시험지 ${exams.length}개에서 사용 중: ${names.join(", ")}${more}`;
}

/** 괄호 주석 하나로 묶는다 — 「(휴지통 1개 포함, 시험지 2개에서 사용 중: …)」. */
function parens(parts: string[]): string {
  const p = parts.filter((x) => x.length > 0);
  return p.length > 0 ? `(${p.join(", ")})` : "";
}

function blockedPhrase(blockedBy: Array<{ relation: RestrictRelation }>): string {
  const labels = [...new Set(blockedBy.map((b) => RESTRICT_RELATION_LABELS[b.relation]))];
  return labels.join("·");
}

function cascadeLine(items: PassageDeletionImpactItem[]): string | null {
  const analysis = items.filter((i) => i.cascade.hasAnalysis).length;
  const reports = items.reduce((n, i) => n + i.cascade.reports, 0);
  const webtoons = items.reduce((n, i) => n + i.cascade.webtoons, 0);
  const notes = items.reduce((n, i) => n + (i.cascade.notes ?? 0), 0);
  const tutor = items.reduce((n, i) => n + (i.cascade.tutorConversations ?? 0), 0);
  const parts: string[] = [];
  if (analysis > 0) parts.push("지문 분석 결과");
  if (notes > 0) parts.push(`마킹 ${notes}개`);
  if (reports > 0) parts.push(`A4 학습자료 ${reports}개`);
  if (webtoons > 0) parts.push(`웹툰 ${webtoons}개`);
  if (tutor > 0) parts.push(`학생 AI 튜터 대화 ${tutor}개`);
  if (parts.length === 0) return null;
  return `${parts.join("·")}도 함께 삭제됩니다.`;
}

function uniqueExams(items: PassageDeletionImpactItem[]) {
  const map = new Map<string, string>();
  for (const it of items) for (const e of it.exams) map.set(e.id, e.title);
  return [...map].map(([id, title]) => ({ id, title }));
}

function questionTotal(it: PassageDeletionImpactItem): number {
  return it.liveQuestionCount + it.trashedQuestionCount;
}

function trashNote(trashed: number): string {
  return trashed > 0 ? `휴지통 ${trashed}개 포함` : "";
}

/** 확인창 제목·본문. 문구는 passage-delete-guard 의 실제 동작과 1:1 이다. */
export function buildPassageDeletionConfirm(
  impact: PassageDeletionImpact,
  opts: { noun?: PassageDeleteNoun } = {},
): PassageDeletionConfirm {
  const noun = opts.noun ?? "지문";
  const blocked = impact.items.filter((i) => i.blockedBy.length > 0);
  const deletable = impact.items.filter((i) => i.blockedBy.length === 0);
  const relinked = deletable.filter((i) => i.relinkTarget && questionTotal(i) > 0);
  const detached = deletable.filter((i) => !i.relinkTarget && questionTotal(i) > 0);
  const single = impact.requested <= 1;
  const lines: string[] = [];

  if (deletable.length === 0) {
    if (blocked.length > 0) {
      const what = blockedPhrase(blocked.flatMap((b) => b.blockedBy));
      return {
        title: single
          ? `이 ${NOUN_TOPIC[noun]} 삭제할 수 없습니다.`
          : `선택한 ${NOUN_OBJ[noun]} 삭제할 수 없습니다.`,
        description: `${what}에 연결돼 있습니다. 먼저 연결을 해제해 주세요.`,
        deletableCount: 0,
        blockedCount: blocked.length,
      };
    }
    return {
      title: `삭제할 ${NOUN_SUBJ[noun]} 없습니다.`,
      description: "이미 삭제됐거나 찾을 수 없습니다.",
      deletableCount: 0,
      blockedCount: 0,
    };
  }

  if (single) {
    const it = deletable[0];
    const total = questionTotal(it);
    if (total === 0) {
      lines.push(`이 ${NOUN_INSTR[noun]} 만든 문제는 없습니다.`);
    } else if (it.relinkTarget) {
      lines.push(
        `이 ${NOUN_INSTR[noun]} 만든 문제 ${total}개${parens([trashNote(it.trashedQuestionCount)])}를 같은 내용의 지문 ${quoteTitle(it.relinkTarget.title)}에 옮겨 연결한 뒤 삭제합니다.`,
      );
    } else {
      const live = it.liveQuestionCount;
      if (live > 0) {
        lines.push(
          `이 ${NOUN_INSTR[noun]} 만든 문제 ${live}개${parens([examPhrase(it.exams)])}는 지문 원문을 보관한 채 남습니다.`,
        );
      }
      if (it.trashedQuestionCount > 0) {
        lines.push(`휴지통에 있는 문제 ${it.trashedQuestionCount}개도 지문 원문을 보관합니다.`);
      }
    }
  } else {
    if (relinked.length > 0) {
      const n = relinked.reduce((s, i) => s + questionTotal(i), 0);
      lines.push(
        `${relinked.length}편은 같은 내용의 다른 지문이 있어, 문제 ${n}개를 그 지문에 옮겨 연결한 뒤 삭제합니다.`,
      );
    }
    if (detached.length > 0) {
      const live = detached.reduce((s, i) => s + i.liveQuestionCount, 0);
      const trashed = detached.reduce((s, i) => s + i.trashedQuestionCount, 0);
      const total = live + trashed;
      lines.push(
        `${detached.length}편으로 만든 문제 ${total}개${parens([trashNote(trashed), examPhrase(uniqueExams(detached))])}는 지문 원문을 보관한 채 남습니다.`,
      );
    }
    if (relinked.length === 0 && detached.length === 0) {
      lines.push(`선택한 ${NOUN_INSTR[noun]} 만든 문제는 없습니다.`);
    }
    if (blocked.length > 0) {
      lines.push(
        `${blocked.length}편은 ${blockedPhrase(blocked.flatMap((b) => b.blockedBy))}에 연결돼 있어 삭제하지 않습니다.`,
      );
    }
    if (impact.notFoundCount > 0) {
      lines.push(`${impact.notFoundCount}편은 찾을 수 없어 건너뜁니다.`);
    }
  }

  const cascade = cascadeLine(deletable);
  if (cascade) lines.push(cascade);
  lines.push("되돌릴 수 없습니다.");

  return {
    title: single
      ? `이 ${NOUN_OBJ[noun]} 삭제할까요?`
      : `선택한 ${noun} ${deletable.length}편을 삭제할까요?`,
    description: lines.join("\n"),
    deletableCount: deletable.length,
    blockedCount: blocked.length,
  };
}

/** 영향 조회가 실패했을 때도 사실인 일반 문구. */
export const PASSAGE_DELETE_FALLBACK_DESCRIPTION =
  "이 지문으로 만든 문제가 있으면, 같은 내용의 지문이 있을 때는 그 지문으로 옮겨 연결하고 없을 때는 지문 원문을 문제에 보관한 채 남깁니다. 되돌릴 수 없습니다.";
