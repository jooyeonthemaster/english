import type { ReactNode } from "react";
import { AlertTriangle, Gauge, ListChecks, SpellCheck2, Target } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";

const rows = [
  ["이해", "scoreInterpret"],
  ["암기", "scoreMemorize"],
  ["순서", "scoreOrder"],
  ["어휘", "scoreVocabDepth"],
  ["어법", "scoreGrammar"],
  ["전이", "scoreTransfer"],
  ["유지", "scoreRetention"],
] as const;

function jsonRecords(raw: unknown) {
  return Array.isArray(raw)
    ? raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function weakSentences(raw: unknown) {
  return jsonRecords(raw)
    .map((item) => ({
      label: String(item.label ?? `문장 ${Number(item.sentenceIndex) + 1}`),
      count: Number(item.count ?? 1),
    }))
    .filter((item) => item.label && Number.isFinite(item.count));
}

function weakNamedItems(raw: unknown, key: "word" | "point") {
  return jsonRecords(raw)
    .map((item) => ({
      label: String(item[key] ?? ""),
      count: Number(item.count ?? 1),
    }))
    .filter((item) => item.label && Number.isFinite(item.count));
}

export default async function TutorWeaknessPage({
  params,
}: {
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const { session } = await requireTutorRouteSession(rawAcademy);
  const snapshot = await prisma.tutorWeaknessSnapshot.findFirst({
    where: { academyId: session.academyId, studentId: session.studentId },
    orderBy: { computedAt: "desc" },
  });
  const sentenceRows = snapshot ? weakSentences(snapshot.weakSentenceIndices) : [];
  const vocabRows = snapshot ? weakNamedItems(snapshot.weakVocab, "word") : [];
  const grammarRows = snapshot ? weakNamedItems(snapshot.weakGrammarPoints, "point") : [];

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
      <section className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Gauge className="size-5 text-blue-600" />
          <p className="text-sm font-black text-blue-700">약점 진단</p>
        </div>
        <h1 className="mt-2 text-3xl font-black text-slate-950">나의 약점</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          점수가 낮은 영역은 복습 탭의 오답과 함께 다시 풀면 가장 빠르게 올라갑니다.
        </p>
      </section>

      {snapshot ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map(([label, key]) => {
              const value = Number(snapshot[key] ?? 0);
              return (
                <div key={label} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between text-sm font-black">
                    <span className="text-slate-950">{label}</span>
                    <span className={value >= 75 ? "text-blue-600" : "text-amber-600"}>{value}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={value >= 75 ? "h-full rounded-full bg-blue-600" : "h-full rounded-full bg-amber-500"} style={{ width: `${value}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {value >= 75 ? "안정권입니다. 유지 복습으로 굳히세요." : "우선 복습이 필요한 영역입니다."}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <WeakListCard
              icon={<Target className="size-5 text-amber-600" />}
              title="자주 흔들린 문장"
              empty="아직 특정 문장 약점이 드러나지 않았습니다."
              rows={sentenceRows}
            />
            <WeakListCard
              icon={<SpellCheck2 className="size-5 text-blue-600" />}
              title="다시 외울 어휘"
              empty="어휘 오답이 쌓이면 여기에 표시됩니다."
              rows={vocabRows}
            />
            <WeakListCard
              icon={<ListChecks className="size-5 text-violet-600" />}
              title="어법 점검 포인트"
              empty="어법 오답이 쌓이면 여기에 표시됩니다."
              rows={grammarRows}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
          <AlertTriangle className="mx-auto size-10 text-amber-500" />
          <p className="mt-3 text-base font-black text-slate-800">아직 약점 데이터가 부족합니다.</p>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
            학습 활동을 여러 개 풀면 해석, 암기, 순서, 어휘, 어법 점수가 이곳에 표시됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

function WeakListCard({
  icon,
  title,
  empty,
  rows,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <p className="text-sm font-black text-slate-950">{title}</p>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.slice(0, 5).map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
              <span className="line-clamp-1 text-xs font-black text-slate-700">{row.label}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-500 ring-1 ring-slate-100">
                {row.count}회
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-slate-50 px-3 py-4 text-xs font-semibold leading-5 text-slate-500">{empty}</p>
      )}
    </div>
  );
}
