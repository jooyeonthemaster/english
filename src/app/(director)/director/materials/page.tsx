import { requireStaffAuth } from "@/lib/auth";
import { getMaterials } from "@/actions/materials";
import { getClassesForFilter } from "@/actions/exam-questions";
import { MaterialsPageClient } from "./materials-page-client";

export default async function MaterialsPage() {
  const staff = await requireStaffAuth();
  const [materials, classes] = await Promise.all([
    getMaterials(staff.academyId),
    getClassesForFilter(staff.academyId),
  ]);

  return (
    <MaterialsPageClient
      materials={materials}
      classes={classes}
      academyId={staff.academyId}
    />
  );
}
