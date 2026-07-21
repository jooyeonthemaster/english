import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  listClassFolders,
  listClassRosterStudents,
} from "@/actions/students/class-folders";
import { ClassFolderView } from "@/components/students/manage/class-folder-view";

// ============================================================================
// 반 편성 — /director/students/classes (v3 §D4-3, C-3 실뷰)
//
// 폴더 스택 이식: 반=폴더(FolderSection 9호), 학생=드래그 카드. 서버는
// 반 목록+멤버십(listClassFolders)과 재원 학생 로스터만 적재하고, 편성
// 상호작용(담기/빼기/이동·undo 토스트)은 ClassFolderView 클라이언트 소관.
// 액션들이 이 경로를 revalidate 하므로 커밋 후 props 재동기화가 자동이다.
// ============================================================================

export default async function StudentsClassesPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [{ collections, membership }, students] = await Promise.all([
    listClassFolders(),
    listClassRosterStudents(),
  ]);

  return (
    <ClassFolderView
      initialCollections={collections}
      initialMembership={membership}
      students={students}
    />
  );
}
