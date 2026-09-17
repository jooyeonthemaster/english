import { redirect } from "next/navigation";

// 가입 신청 심사 화면은 폐기됐다(2026-09, 자가 가입 전환). 예전 링크는 학원·회원 관리로 보낸다.
export default function AdminRegistrationsPage() {
  redirect("/admin/members");
}
