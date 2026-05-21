import { redirect } from "next/navigation";
import { getTutorStudentSession } from "@/lib/auth-tutor-student";
import { normalizeAcademySlugParam, tutorPath } from "@/lib/tutor/routes";

export async function requireTutorRouteSession(rawAcademy: string) {
  const academy = normalizeAcademySlugParam(rawAcademy);
  const session = await getTutorStudentSession();

  if (!session) {
    redirect(tutorPath(academy));
  }

  if (session.academySlug !== academy) {
    redirect(tutorPath(session.academySlug, "/study"));
  }

  return { academy, session };
}
