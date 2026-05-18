import { redirect } from "next/navigation";
import { getTutorStudentSession } from "@/lib/auth-tutor-student";
import { normalizeAcademySlugParam } from "@/lib/tutor/routes";

export async function requireTutorRouteSession(rawAcademy: string) {
  const academy = normalizeAcademySlugParam(rawAcademy);
  const session = await getTutorStudentSession();

  if (!session) {
    redirect(`/tutor/${encodeURIComponent(academy)}`);
  }

  if (session.academySlug !== academy) {
    redirect(`/tutor/${encodeURIComponent(session.academySlug)}/study`);
  }

  return { academy, session };
}
