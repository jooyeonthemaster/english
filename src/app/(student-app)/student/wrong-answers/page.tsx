import { redirect } from "next/navigation";

export default function WrongAnswersRedirect() {
  redirect("/student/review");
}
