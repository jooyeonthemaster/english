import type { ReactNode } from "react";
import { normalizeAcademySlugParam } from "@/lib/tutor/routes";
import { TutorBottomNav } from "./_components/tutor-bottom-nav";

export default async function TutorAcademyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const academy = normalizeAcademySlugParam(rawAcademy);
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,#e0f2fe_0,#f8fafc_34%,#f1f5f9_100%)] text-slate-950">
      <main className="mx-auto min-h-dvh w-full max-w-[1040px] bg-white/95 pb-28 shadow-sm backdrop-blur md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[28px] md:border md:border-white/70 md:shadow-xl md:shadow-slate-200/70">
        {children}
      </main>
      <TutorBottomNav academy={academy} />
    </div>
  );
}
