import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTutorStudentSession } from "@/lib/auth-tutor-student";
import { normalizeAcademySlugParam, tutorPath } from "@/lib/tutor/routes";
import { TutorLoginForm } from "./_components/tutor-login-form";
import { BrandIcon } from "@/components/brand/brand-mark";

export default async function TutorLoginPage({
  params,
}: {
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const academy = normalizeAcademySlugParam(rawAcademy);
  const session = await getTutorStudentSession();
  if (session?.academySlug === academy) redirect(tutorPath(academy, "/study"));

  const academyInfo = await prisma.academy.findUnique({
    where: { slug: academy },
    select: { name: true, code: true },
  });

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 rounded-[28px] bg-slate-950 p-6 text-white shadow-xl shadow-slate-200">
          <BrandIcon className="mb-5 size-14 bg-blue-500 shadow-none" markClassName="size-8" />
          <p className="text-sm font-bold text-blue-200">{academyInfo?.name ?? "학원"}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">튜터 로그인</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-300">
            선생님이 안내한 학원코드와 학생코드를 입력하면 오늘의 학습으로 바로 이동합니다.
          </p>
        </div>
        <TutorLoginForm academySlug={academy} academyReady={Boolean(academyInfo?.code)} />
      </div>
    </div>
  );
}
