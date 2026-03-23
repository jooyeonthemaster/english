import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TopBar } from "@/components/layout/top-bar";
import { HomeCards } from "./home-cards";

interface SchoolHomeProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function SchoolHomePage({ params }: SchoolHomeProps) {
  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    notFound();
  }

  return (
    <>
      <TopBar title={school.name} />
      <HomeCards schoolSlug={schoolSlug} />
    </>
  );
}
