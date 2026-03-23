import { getConsultations, getUpcomingFollowUps } from "@/actions/consultations";
import ConsultationsClient from "./consultations-client";

export default async function ConsultationsPage() {
  const [consultations, followUps] = await Promise.all([
    getConsultations({}),
    getUpcomingFollowUps(),
  ]);

  return (
    <ConsultationsClient
      initialConsultations={consultations}
      initialFollowUps={followUps}
    />
  );
}
