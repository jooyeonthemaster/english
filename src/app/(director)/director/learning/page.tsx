import { redirect } from "next/navigation";

export default function LearningAdminPage() {
  redirect("/director/learning-questions?tab=seasons");
}
