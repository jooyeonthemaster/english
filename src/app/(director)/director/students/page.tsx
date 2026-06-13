import { redirect } from "next/navigation";

// 학생·반 관리 리스트는 "튜터 운영 홈"(/director/tutor)으로 통합됐다.
// 학생 상세(/director/students/[studentId])는 그대로 유지된다.
export default async function StudentsPage() {
  redirect("/director/tutor");
}
