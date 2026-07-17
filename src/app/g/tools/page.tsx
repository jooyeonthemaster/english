// 판별 5도구 (/g/tools) — 판별 5렌즈를 학생용 "도구함 · 치트 시트"로 제공한다.
// 규범: docs/study-os-spec.md §2.5(렌즈) · §4(네비게이션) · §5(디자인)
//
// 유닛 잠금은 서버에서 계산한다 — 잠긴 유닛의 레슨 링크를 내보내면 학생이
// /g/unit/... 로 직행해 서버 리다이렉트를 맞는 죽은 링크가 된다(과거 드릴 큐 사고).

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import {
  GRAMMAR_UNITS,
  UNIT_BY_ID,
  unitLabel,
} from "@/lib/grammar-drill/curriculum";
import type { GrammarUnit } from "@/lib/grammar-drill/types";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { getLesson } from "@/lib/study-os/lesson-bundle";
import { JUDGE_LENSES } from "@/lib/study-os/lenses";
import { ToolsClient, type LensView } from "./tools-client";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const progresses = await prisma.grammarDrillUnitProgress.findMany({
    where: { studentId: session.studentId },
    select: { unitId: true, drillDoneAt: true },
  });
  const unlocked = computeUnlockedUnits(progresses);

  // 지금 열려 있는 가장 앞선 유닛 — 렌즈의 훈련 유닛이 전부 잠겨 있을 때의 대안 행선지.
  const frontier =
    [...GRAMMAR_UNITS].reverse().find((u) => unlocked.has(u.id)) ?? GRAMMAR_UNITS[0];

  const lenses: LensView[] = JUDGE_LENSES.map((lens) => {
    const units = lens.units
      .map((id) => UNIT_BY_ID.get(id))
      .filter((u): u is GrammarUnit => Boolean(u))
      .sort((a, b) => a.part - b.part || a.order - b.order)
      .map((u) => {
        const open = unlocked.has(u.id);
        // 레슨이 있는 첫 개념 → 없으면 드릴로. 죽은 링크를 만들지 않는다.
        const firstLessonConceptId = u.conceptIds.find((cid) => getLesson(cid));
        return {
          id: u.id,
          label: unitLabel(u.id),
          title: u.title,
          subtitle: u.subtitle,
          basic: u.part === 0,
          unlocked: open,
          hubHref: open ? `/g/unit/${u.id}` : null,
          trainHref: open
            ? firstLessonConceptId
              ? `/g/unit/${u.id}/lesson/${firstLessonConceptId}`
              : `/g/drill?mode=drill&unitId=${u.id}`
            : null,
        };
      });

    const target = units.find((u) => u.unlocked && u.trainHref);
    const cta = target
      ? {
          href: target.trainHref!,
          label: "이 도구로 훈련하기",
          sub: `${target.label} · ${target.title}`,
          why: "이 유닛의 첫 개념 학습부터 시작합니다",
        }
      : {
          href: `/g/unit/${frontier.id}`,
          label: "지금 열린 유닛부터 시작하기",
          sub: `${unitLabel(frontier.id)} · ${frontier.title}`,
          why: "이 도구를 훈련하는 유닛은 아직 열리지 않았습니다",
        };

    return {
      id: lens.id,
      name: lens.name,
      oneLiner: lens.oneLiner,
      when: lens.when,
      steps: lens.steps,
      units,
      cta,
    };
  });

  return <ToolsClient lenses={lenses} />;
}
