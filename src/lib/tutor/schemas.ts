import { z } from "zod";

import { TUTOR_ACTIVITY_TYPES } from "@/lib/tutor/activity-types";
import { TutorActivityPayloadSchema } from "@/lib/tutor/activity-payload-schema";

export const TutorActivityModeSchema = z.enum([
  "interpret",
  "memorize",
  "order",
  "vocab",
  "grammar",
  "transfer",
  "mastery",
]);

// type 단일소스(activity-types.ts)에서 enum 생성. 死유형은 더 이상 허용되지 않는다.
export const TutorActivityTypeSchema = z.enum(TUTOR_ACTIVITY_TYPES);

export const TutorCoverageRefSchema = z.object({
  sentenceIndex: z.number().int().min(0),
  dimension: z.enum(["interpret", "memorize", "order", "vocab", "grammar", "transfer"]),
  weight: z.number().min(0).max(1),
});

export const TutorActivityDraftSchema = z.object({
  mode: TutorActivityModeSchema,
  type: TutorActivityTypeSchema,
  title: z.string().min(1),
  instructions: z.string().optional(),
  payload: TutorActivityPayloadSchema,
  payloadSchemaVersion: z.literal(2).default(2),
  itemCount: z.number().int().min(1).default(1),
  maxScore: z.number().int().min(1).default(10),
  estimatedSec: z.number().int().min(10).default(60),
  coverageRefs: z.array(TutorCoverageRefSchema).min(1),
});

export type TutorActivityDraft = z.infer<typeof TutorActivityDraftSchema>;

export const CreateTutorProgramSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  templateKey: z.string().default("basic_interpret"),
  passageIds: z.array(z.string()).min(1).max(12),
});

export const PublishTutorProgramSchema = z.object({
  programId: z.string().min(1),
  targetType: z.enum(["ALL_ACTIVE", "CLASS", "STUDENT", "SCHOOL_GRADE", "SCHOOL"]),
  targetId: z.string().optional(),
  dueAt: z.string().optional(),
});
