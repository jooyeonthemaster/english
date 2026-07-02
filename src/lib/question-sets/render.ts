import { reconstructPassageView } from "./reconstruct";
import type { Anchor, LayoutDescriptor } from "./types";

export type QuestionSetRenderLike = {
  canonicalPassage: string;
  layout?: LayoutDescriptor | null;
  members: Array<{
    spans?: Anchor[] | null;
  }>;
};

export function questionSetVisibleBasePassage(set: {
  canonicalPassage: string;
  layout?: LayoutDescriptor | null;
}): string {
  return set.layout?.fullPassage ?? set.canonicalPassage;
}
export function buildQuestionSetMergedPassage(set: QuestionSetRenderLike): string {
  const base = questionSetVisibleBasePassage(set);
  const anchors = set.members.flatMap((member) =>
    Array.isArray(member.spans) ? member.spans : [],
  );
  return reconstructPassageView(base, anchors).text || base;
}
