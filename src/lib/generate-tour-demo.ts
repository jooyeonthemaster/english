export const GENERATE_TOUR_FILL_SAMPLE_TEXT_EVENT =
  "smoat:generate-tour:fill-sample-text";

export const GENERATE_TOUR_CLEAR_SAMPLE_TEXT_EVENT =
  "smoat:generate-tour:clear-sample-text";

export const GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE =
  "application/x-smoat-generate-tour-sample-file";

export const GENERATE_TOUR_MILESTONE_EVENT = "smoat:generate-tour:milestone";

export const GENERATE_TOUR_SAMPLE_FILE_NAME = "smoat-tutorial-passage.png";

export const GENERATE_TOUR_SAMPLE_TEXT_TITLE = "The Gift of the Magi, 1905";

export const GENERATE_TOUR_SAMPLE_TEXT = `One dollar and eighty-seven cents. That was all. And sixty cents of it was in pennies. Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied. Three times Della counted it. One dollar and eighty-seven cents. And the next day would be Christmas. There was clearly nothing to do but flop down on the shabby little couch and howl. So Della did it. Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.`;

export const GENERATE_TOUR_SAMPLE_TEXTS = [
  {
    title: GENERATE_TOUR_SAMPLE_TEXT_TITLE,
    text: GENERATE_TOUR_SAMPLE_TEXT,
  },
  {
    title: "The Happy Prince, 1888",
    text: `High above the city, on a tall column, stood the statue of the Happy Prince. He was gilded all over with thin leaves of fine gold, for eyes he had two bright sapphires, and a large red ruby glowed on his sword-hilt. He was very much admired indeed. "He is as beautiful as a weathercock," remarked one of the Town Councillors who wished to gain a reputation for having artistic tastes; "only not quite so useful," he added, fearing lest people should think him unpractical, which he really was not. "Why can't you be like the Happy Prince?" asked a sensible mother of her little boy who was crying for the moon. "The Happy Prince never dreams of crying for anything."`,
  },
] as const;

export interface GenerateTourSampleTextDetail {
  title: string;
  text: string;
  sampleIndex?: number;
}

export type GenerateTourMilestone =
  | "paste-tab-opened"
  | "sample-text-filled"
  | "paste-draft-added"
  | "paste-two-drafts-added"
  | "paste-registered"
  | "generation-mode-manual-opened"
  | "generation-type-selected"
  | "type-detail-opened"
  | "question-generation-started"
  | "question-generation-completed"
  | "question-detail-opened"
  | "upload-tab-opened"
  | "file-ready"
  | "file-crop-first-created"
  | "file-crop-joined"
  | "file-extraction-completed"
  | "passage-selected"
  | "review-passage-selected"
  | "passage-review-completed"
  | "passage-folder-created"
  | "passage-folder-drop-completed"
  | "learning-generation-started"
  | "learning-generation-completed"
  | "learning-detail-opened"
  | "workspace-opened"
  | "workspace-text-selected"
  | "workspace-paraphrase-previewed"
  | "workspace-paraphrase-applied"
  | "workspace-range-set"
  | "workspace-prepend-previewed"
  | "workspace-prepend-applied";

export interface GenerateTourMilestoneDetail {
  milestone: GenerateTourMilestone;
}

export function dispatchGenerateTourMilestone(
  milestone: GenerateTourMilestone,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GenerateTourMilestoneDetail>(
      GENERATE_TOUR_MILESTONE_EVENT,
      {
        detail: { milestone },
      },
    ),
  );
}

export function dispatchGenerateTourSampleText() {
  dispatchGenerateTourSampleTextByIndex(0);
}

export function dispatchGenerateTourSampleTextByIndex(sampleIndex: number) {
  if (typeof window === "undefined") return;
  const sample =
    GENERATE_TOUR_SAMPLE_TEXTS[sampleIndex] ?? GENERATE_TOUR_SAMPLE_TEXTS[0];
  window.dispatchEvent(
    new CustomEvent<GenerateTourSampleTextDetail>(
      GENERATE_TOUR_FILL_SAMPLE_TEXT_EVENT,
      {
        detail: {
          title: sample.title,
          text: sample.text,
          sampleIndex,
        },
      },
    ),
  );
}

export function isGenerateTourSampleText(title: string, text: string) {
  const normalizedTitle = title.trim();
  const normalizedText = text.trim();
  return GENERATE_TOUR_SAMPLE_TEXTS.some(
    (sample) =>
      sample.title === normalizedTitle && sample.text === normalizedText,
  );
}

export function hasAllGenerateTourSampleTexts(
  passages: Array<{ title?: string; text: string }>,
) {
  return GENERATE_TOUR_SAMPLE_TEXTS.every((sample) =>
    passages.some(
      (passage) =>
        (passage.title ?? "").trim() === sample.title &&
        passage.text.trim() === sample.text,
    ),
  );
}

export function dispatchGenerateTourClearSampleText() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GENERATE_TOUR_CLEAR_SAMPLE_TEXT_EVENT));
}
