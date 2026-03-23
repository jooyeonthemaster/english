import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BottomNav } from "@/components/layout/bottom-nav";
import { cache } from "react";

interface SchoolLayoutProps {
  children: React.ReactNode;
  params: Promise<{ schoolSlug: string }>;
}

const getSchool = cache(async (slug: string) => {
  return prisma.school.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
});

export default async function SchoolLayout({
  children,
  params,
}: SchoolLayoutProps) {
  const { schoolSlug } = await params;

  const school = await getSchool(schoolSlug);

  if (!school) {
    notFound();
  }

  return (
    <div className="relative min-h-[100dvh]">
      {/* Content area with padding for BottomNav */}
      <div className="pb-24">{children}</div>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
