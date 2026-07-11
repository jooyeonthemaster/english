// ============================================================================
// /director/tutor — 정본 학생 로스터(/director/students)로 통합(26-07-11 IA 재편 §5)
// 구 튜터 운영 허브 기능은 학생 관리 허브가 승계. 다른 /director/tutor/* 하위
// 라우트(monitor·programs·distributions 등)는 그대로 유지된다.
// ============================================================================

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DirectorTutorPage() {
  redirect("/director/students");
}
