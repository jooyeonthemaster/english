import { ACCEPTED_IMAGE_MIMES, ACCEPTED_PDF_MIMES } from "@/lib/extraction/constants";

export const ACCEPTED = [...ACCEPTED_PDF_MIMES, ...ACCEPTED_IMAGE_MIMES] as const;

export const TEXT_EXTRACTION_MIN_LENGTH = 20;

/** dataTransfer type that marks a slot reorder (vs an external file drop). */
export const SLOT_DRAG_MIME = "application/x-m1-slot-index";
