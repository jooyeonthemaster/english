import { ATLAS_TUTOR_MODEL_ID, atlasChatModel } from "@/lib/atlas-ai";

export function getTutorModel() {
  return atlasChatModel(ATLAS_TUTOR_MODEL_ID);
}

export function getTutorModelNameForAudit() {
  return ATLAS_TUTOR_MODEL_ID;
}
