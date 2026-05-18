import { getTutorPassageCandidates } from "@/actions/tutor";
import { TutorProgramCreateForm } from "../_components/tutor-program-create-form";

export default async function NewTutorProgramPage() {
  const passages = await getTutorPassageCandidates();
  return <TutorProgramCreateForm passages={passages} />;
}
