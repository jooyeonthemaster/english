import { notFound } from "next/navigation";
import { AnnotationEditorHarness } from "./harness";

/**
 * Dev-only isolated test harness for PassageAnnotationEditor.
 *
 * Lives outside the (director) auth gate so Playwright/WebKit can hit it
 * without a real login session. Returns 404 in production builds so it can
 * never be exposed to end users by accident.
 */
export default function DevAnnotationEditorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <AnnotationEditorHarness />;
}
