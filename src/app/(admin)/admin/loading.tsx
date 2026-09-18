import { AdminPageSkeleton } from "@/components/admin/kit/page-skeleton";

// 관리자 하위 라우트 공통 로딩 화면 — 자체 Suspense 뼈대가 없는 페이지도 빈 화면 대신 이걸 보인다.
export default function AdminLoading() {
  return <AdminPageSkeleton />;
}
