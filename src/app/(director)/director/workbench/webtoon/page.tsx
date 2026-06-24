import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getWebtoonCollections,
  getAcademyWebtoonCollectionMembership,
} from "@/actions/workbench";
import { WebtoonPageClient } from "./webtoon-page-client";

export default async function WebtoonPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [collections, membershipRaw] = await Promise.all([
    getWebtoonCollections(staff.academyId),
    getAcademyWebtoonCollectionMembership(staff.academyId),
  ]);

  return (
    <WebtoonPageClient
      academyId={staff.academyId}
      collections={collections}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
      )}
    />
  );
}
