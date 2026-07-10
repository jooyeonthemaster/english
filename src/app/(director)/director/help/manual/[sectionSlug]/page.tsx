import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { ManualQuickAccessToggle } from "@/components/manual/manual-quick-access-toggle";
import { ManualSectionViewer } from "@/components/manual/manual-section-viewer";
import { getStaffSession } from "@/lib/auth";
import {
  getManualSectionSlides,
  getStaticManualManifest,
  STATIC_MANUAL_PUBLIC_BASE,
} from "@/lib/manual/static-manual";
import { getManualSectionVisibility } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "사용 매뉴얼",
};

export const dynamic = "force-dynamic";

interface ManualSectionPageProps {
  params: Promise<{ sectionSlug: string }>;
  searchParams: Promise<{ slide?: string }>;
}

function parseInitialIndex(slide: string | undefined, total: number) {
  const requested = Number.parseInt(slide ?? "1", 10);
  if (!Number.isFinite(requested)) return 0;
  return Math.min(Math.max(requested - 1, 0), Math.max(total - 1, 0));
}

export default async function ManualSectionPage({ params, searchParams }: ManualSectionPageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [{ sectionSlug }, { slide }] = await Promise.all([params, searchParams]);
  const manifest = getStaticManualManifest();
  if (!manifest) notFound();

  const section = getManualSectionSlides(manifest, sectionSlug);
  if (!section) notFound();

  const visibility = await getManualSectionVisibility();
  if (visibility[section.group.slug] === false) notFound();
  const visibleGroups = manifest.groups.filter((group) => visibility[group.slug] !== false);
  const initialIndex = parseInitialIndex(slide, section.slides.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/director/help/manual"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 transition hover:text-blue-700"
          >
            <ArrowLeft className="size-3.5" />
            목차로 돌아가기
          </Link>
          <div className="mt-1 flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <BookOpen className="size-4" />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <div className="shrink-0 text-[20px] font-black leading-none text-blue-600">
                {section.group.no !== "0" ? section.group.no : "START"}
              </div>
              <h1 className="truncate text-[18px] font-black tracking-tight text-slate-950">
                {section.group.name}
              </h1>
            </div>
          </div>
        </div>
        <ManualQuickAccessToggle />
      </div>

      <ManualSectionViewer
        key={section.group.slug}
        assetBase={STATIC_MANUAL_PUBLIC_BASE}
        entries={manifest.entries}
        groups={visibleGroups}
        group={section.group}
        slides={section.slides}
        initialIndex={initialIndex}
      />
    </div>
  );
}
