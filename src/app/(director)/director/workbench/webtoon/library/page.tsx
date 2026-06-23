import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getWebtoonCollections,
  getAcademyWebtoonCollectionMembership,
} from "@/actions/workbench";
import { WebtoonLibraryClient } from "./library-page-client";

export default async function WebtoonLibraryPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [collections, membershipRaw] = await Promise.all([
    getWebtoonCollections(staff.academyId),
    getAcademyWebtoonCollectionMembership(staff.academyId),
  ]);

  return (
    <WebtoonLibraryClient
      academyId={staff.academyId}
      collections={collections}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
      )}
    />
  );
}
