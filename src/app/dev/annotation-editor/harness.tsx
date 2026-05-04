"use client";

import { useState } from "react";
import { PassageAnnotationEditor, type Annotation } from "@/components/workbench/editor";

const SAMPLE_PASSAGE = `Sleep is one of the most important activities for human health. During sleep, the brain processes memories and removes waste products that build up during the day. Scientists have discovered that people who consistently get less than seven hours of sleep are more likely to develop serious health problems. The stages of sleep, including REM and deep sleep, each serve different functions. REM sleep is essential for emotional regulation, while deep sleep helps repair muscles and strengthen the immune system. Despite its importance, many people sacrifice sleep for work or entertainment, leading to long-term consequences.`;

export function AnnotationEditorHarness() {
  const [content, setContent] = useState(SAMPLE_PASSAGE);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-xl font-semibold text-slate-800">
          Annotation Editor — WebKit/Safari Test Harness
        </h1>
        <p className="mb-4 text-sm text-slate-500">
          Drag text → toolbar should appear directly under the selection.
          Click an existing marking → edit popup should appear under it.
        </p>

        {/* Fixed height so scroll behaviour is testable */}
        <div
          data-testid="editor-shell"
          className="h-[480px] rounded-lg border border-slate-200 bg-white shadow-sm"
        >
          <PassageAnnotationEditor
            content={content}
            onContentChange={setContent}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
          />
        </div>

        {/* Live state for assertions */}
        <pre
          data-testid="annotations-json"
          className="mt-4 max-h-60 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100"
        >
          {JSON.stringify(annotations, null, 2)}
        </pre>
      </div>
    </div>
  );
}
