import { redirect } from "next/navigation";

// 학원 목록은 학원·회원 관리로 통합됐다(회원 1명 = 학원 1곳). 예전 링크 보존용 리다이렉트.
export default function AdminAcademiesPage() {
  redirect("/admin/members");
}
