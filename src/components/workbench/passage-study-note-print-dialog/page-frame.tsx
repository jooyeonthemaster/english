"use client";

import React from "react";
import { CATEGORY_META, type PageCategory, type PaginatedStudyPage, type StudyNoteBlock } from "./types";

function PagePointChip({ category, count }: { category: PageCategory; count: number }) {
  const meta = CATEGORY_META[category];
  if (count <= 0) return null;
  return (
    <span className={`page-point-chip ${meta.bg} ${meta.fg} ${meta.border}`}>
      <i className={meta.dot} />
      {meta.label} {count}
    </span>
  );
}

function StudyNoteBlockView({ block }: { block: StudyNoteBlock }) {
  return (
    <div className="study-note-block" data-block-id={block.id}>
      {block.node}
    </div>
  );
}

export function StudyNotePageFrame({
  page,
  pageIndex,
  totalPages,
}: {
  page: PaginatedStudyPage;
  pageIndex: number;
  totalPages: number;
}) {
  const entries = Object.entries(page.categories)
    .filter(([, count]) => (count || 0) > 0) as Array<[PageCategory, number]>;

  return (
    <article className="study-note-page">
      <div className="study-note-page-header">
        <div className="min-w-0">
          <p>STUDY NOTE</p>
          <h2>{page.passageTitle}</h2>
        </div>
        <b>{pageIndex + 1} / {totalPages}</b>
      </div>
      <div className="study-note-page-points">
        {entries.map(([category, count]) => (
          <PagePointChip key={category} category={category} count={count} />
        ))}
      </div>
      <div className="study-note-page-content">
        {page.blocks.map((block) => (
          <StudyNoteBlockView key={block.id} block={block} />
        ))}
      </div>
      <footer>
        <span>{page.passageTitle}</span>
        <span>Page {pageIndex + 1}</span>
      </footer>
    </article>
  );
}

export function StudyNoteMeasurementLayer({
  blocks,
  contentRef,
}: {
  blocks: StudyNoteBlock[];
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="study-note-measure-layer" aria-hidden="true">
      <article className="study-note-page">
        <div className="study-note-page-header">
          <div>
            <p>STUDY NOTE</p>
            <h2>measurement</h2>
          </div>
          <b>0 / 0</b>
        </div>
        <div className="study-note-page-points">
          <PagePointChip category="summary" count={1} />
          <PagePointChip category="body" count={1} />
        </div>
        <div ref={contentRef} className="study-note-page-content">
          {blocks.map((block) => (
            <StudyNoteBlockView key={block.id} block={block} />
          ))}
        </div>
        <footer>
          <span>measurement</span>
          <span>Page 0</span>
        </footer>
      </article>
    </div>
  );
}
