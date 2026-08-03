"use client";

// ============================================================================
// 단어장(덱) 관리 카드 — vocab-lab-list-client 의 섹션 분리(500줄 계약).
// 목록(활성·보관) + 생성 폼(제목/학년/티어/난이도/품사/limit → createVocabDeck)
// + 보관 버튼(archiveVocabDeck). 덱 = 저장된 질의 — 조건이 곧 내용물이다.
// ============================================================================

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  archiveVocabDeck,
  createVocabDeck,
  type VocabDeckRow,
} from "@/actions/vocab-drill-admin/decks";
import type { VocabDeckSpec } from "@/lib/vocab-drill/payload";
import { VOCAB_POS_LABELS, VOCAB_TIER_LABELS } from "@/lib/vocab-drill/display";
import { SectionCard, StatusPill } from "@/components/layout/page-frame";
import { cn } from "@/lib/utils";

const GRADE_OPTIONS = ["고1", "고2", "고3"];
const TIER_OPTIONS = ["basic", "core", "academic", "advanced"];
const DIFF_OPTIONS = [1, 2, 3, 4, 5];
const POS_OPTIONS = Object.keys(VOCAB_POS_LABELS);

function posLabel(pos: string): string {
  return VOCAB_POS_LABELS[pos] ?? pos;
}

function specSummary(spec: VocabDeckSpec): string {
  const parts: string[] = [];
  if (spec.senseIds?.length) parts.push(`지정 ${spec.senseIds.length}개`);
  if (spec.grades?.length) parts.push(spec.grades.join("·"));
  if (spec.tiers?.length) parts.push(spec.tiers.map((t) => VOCAB_TIER_LABELS[t] ?? t).join("·"));
  if (spec.difficulties?.length) parts.push(`난이도 ${[...spec.difficulties].sort().join("·")}`);
  if (spec.posList?.length) parts.push(spec.posList.map(posLabel).join("·"));
  if (spec.excludePhrase) parts.push("구·숙어 제외");
  parts.push(`상한 ${spec.limit ?? 100}개`);
  return parts.join(" / ");
}

function ChipToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}

function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function VocabDeckManageCard({ decks }: { decks: VocabDeckRow[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<number[]>([]);
  const [posList, setPosList] = useState<string[]>([]);
  const [limit, setLimit] = useState("100");
  const [pending, startTransition] = useTransition();
  const [archiving, setArchiving] = useState<string | null>(null);

  const submit = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await createVocabDeck({
        title,
        subtitle: subtitle || null,
        spec: {
          ...(grades.length ? { grades } : {}),
          ...(tiers.length ? { tiers } : {}),
          ...(diffs.length ? { difficulties: diffs } : {}),
          ...(posList.length ? { posList } : {}),
          limit: Number(limit) || 100,
        },
      });
      if (res.success) {
        toast.success(`단어장을 만들었습니다 (${res.data?.senseCount ?? 0}단어).`);
        setTitle("");
        setSubtitle("");
        setGrades([]);
        setTiers([]);
        setDiffs([]);
        setPosList([]);
        setLimit("100");
        setFormOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "단어장을 만들지 못했습니다.");
      }
    });
  };

  const archive = async (deckId: string) => {
    if (archiving) return;
    setArchiving(deckId);
    const res = await archiveVocabDeck(deckId);
    setArchiving(null);
    if (res.success) {
      toast.success("단어장을 보관했습니다.");
      router.refresh();
    } else {
      toast.error(res.error || "단어장을 보관하지 못했습니다.");
    }
  };

  const active = decks.filter((d) => d.status === "ACTIVE");
  const archived = decks.filter((d) => d.status !== "ACTIVE");

  return (
    <SectionCard
      icon={Layers}
      title="단어장 관리"
      description="단어장은 저장된 조건입니다 — 학년·티어·난이도·품사 조건에 맞는 단어가 자동으로 담깁니다."
      actions={
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          {formOpen ? "닫기" : "+ 새 단어장"}
        </button>
      }
      bodyClassName="p-0"
    >
      {formOpen ? (
        <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="단어장 이름 (필수)"
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-300"
            />
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="한 줄 설명 (선택)"
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-300"
            />
          </div>
          <div className="mt-2.5 space-y-2">
            <FormRow label="학년">
              {GRADE_OPTIONS.map((g) => (
                <ChipToggle
                  key={g}
                  label={g}
                  active={grades.includes(g)}
                  onToggle={() => setGrades((p) => toggleIn(p, g))}
                />
              ))}
            </FormRow>
            <FormRow label="티어">
              {TIER_OPTIONS.map((t) => (
                <ChipToggle
                  key={t}
                  label={VOCAB_TIER_LABELS[t] ?? t}
                  active={tiers.includes(t)}
                  onToggle={() => setTiers((p) => toggleIn(p, t))}
                />
              ))}
            </FormRow>
            <FormRow label="난이도">
              {DIFF_OPTIONS.map((d) => (
                <ChipToggle
                  key={d}
                  label={String(d)}
                  active={diffs.includes(d)}
                  onToggle={() => setDiffs((p) => toggleIn(p, d))}
                />
              ))}
            </FormRow>
            <FormRow label="품사">
              {POS_OPTIONS.map((p) => (
                <ChipToggle
                  key={p}
                  label={posLabel(p)}
                  active={posList.includes(p)}
                  onToggle={() => setPosList((prev) => toggleIn(prev, p))}
                />
              ))}
            </FormRow>
            <FormRow label="단어 수">
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2.5 text-right text-[13px] tabular-nums text-slate-700 outline-none focus:border-blue-300"
              />
              <span className="text-[11.5px] text-slate-400">
                1~500 (빈도 높은 순으로 담깁니다)
              </span>
            </FormRow>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={pending || !title.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              만들기
            </button>
          </div>
        </div>
      ) : null}

      {active.length === 0 && archived.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-400">
          아직 단어장이 없습니다. 「+ 새 단어장」으로 만들어 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {active.map((d) => (
            <DeckRow
              key={d.id}
              deck={d}
              archiving={archiving === d.id}
              onArchive={() => void archive(d.id)}
            />
          ))}
          {archived.map((d) => (
            <DeckRow key={d.id} deck={d} archiving={false} onArchive={null} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-[12px] font-semibold text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function DeckRow({
  deck,
  archiving,
  onArchive,
}: {
  deck: VocabDeckRow;
  archiving: boolean;
  onArchive: (() => void) | null;
}) {
  const isArchived = deck.status !== "ACTIVE";
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5", isArchived && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-slate-800">{deck.title}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold tabular-nums text-slate-500">
            {deck.senseCountCache.toLocaleString()}단어
          </span>
          {isArchived ? <StatusPill tone="slate">보관됨</StatusPill> : null}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
          {deck.subtitle ? `${deck.subtitle} · ` : ""}
          {specSummary(deck.spec)}
        </p>
      </div>
      {onArchive ? (
        <button
          type="button"
          onClick={onArchive}
          disabled={archiving}
          title="보관하면 학생 목록에서 사라집니다. 기록은 남습니다."
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {archiving ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Archive className="size-3" aria-hidden />
          )}
          보관
        </button>
      ) : null}
    </li>
  );
}
