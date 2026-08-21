import { type ReactNode } from "react";
import { type AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import type { ExamNotePart, ExamNoteRef, GrammarNotePart, GrammarNoteRef, LogicNoteRef, ParsingNotePart, ParsingNoteRef, PassageSection, SectionEdit, VocabularyNoteRef } from "./types";
import { Field } from "./editable-field";
import { inferExamSentenceNos } from "./exam-inference";
import { sentenceIncludesVocabulary } from "./vocabulary";

function pushGrouped<T>(map: Map<number, T[]>, key: number | undefined, value: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

export function collectPassageStudyNotes(sections: AnalysisSection[], sentences: PassageSection["sentences"]) {
  const grammarBySentence = new Map<number, GrammarNoteRef[]>();
  const logicBySentence = new Map<number, LogicNoteRef[]>();
  const examBySentence = new Map<number, ExamNoteRef[]>();
  const vocabBySentence = new Map<number, VocabularyNoteRef[]>();
  const parsingBySentence = new Map<number, ParsingNoteRef[]>();
  const globalExam: ExamNoteRef[] = [];

  sections.forEach((section, sectionIndex) => {
    if (section.kind === "grammar") {
      section.rows.forEach((row, rowIndex) => pushGrouped(grammarBySentence, row.sentenceNo, { sectionIndex, rowIndex, section, row }));
    }
    if (section.kind === "learning-worksheet") {
      section.logicRows.forEach((row, rowIndex) => pushGrouped(logicBySentence, row.sentenceNo, { sectionIndex, rowIndex, section, row }));
    }
    if (section.kind === "exam-focus") {
      section.rows.forEach((row, rowIndex) => {
        const ref = { sectionIndex, rowIndex, section, row };
        const sentenceNos = inferExamSentenceNos(row, sentences);
        if (sentenceNos.length) sentenceNos.forEach((sentenceNo) => pushGrouped(examBySentence, sentenceNo, ref));
        else globalExam.push(ref);
      });
    }
    if (section.kind === "vocabulary") {
      section.rows.forEach((row, rowIndex) => {
        const ref = { sectionIndex, rowIndex, section, row };
        sentences.forEach((sentence) => {
          if (sentenceIncludesVocabulary(sentence.en, row)) pushGrouped(vocabBySentence, sentence.n, ref);
        });
      });
    }
    if (section.kind === "parsing") {
      section.items.forEach((item, itemIndex) => pushGrouped(parsingBySentence, item.sentenceNo, { sectionIndex, itemIndex, section, item }));
    }
  });

  return { grammarBySentence, logicBySentence, examBySentence, vocabBySentence, parsingBySentence, globalExam };
}

export function patchGrammarNote(note: GrammarNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<GrammarNoteRef["row"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    rows: note.section.rows.map((row, index) => (index === note.rowIndex ? { ...row, ...patch } : row)),
  });
}

export function patchLogicNote(note: LogicNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<LogicNoteRef["row"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    logicRows: note.section.logicRows.map((row, index) => (index === note.rowIndex ? { ...row, ...patch } : row)),
  });
}

export function patchExamNote(note: ExamNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<ExamNoteRef["row"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    rows: note.section.rows.map((row, index) => (index === note.rowIndex ? { ...row, ...patch } : row)),
  });
}

function patchParsingNote(note: ParsingNoteRef, sectionEdit: ((i: number) => SectionEdit) | undefined, patch: Partial<ParsingNoteRef["item"]>) {
  const sed = sectionEdit?.(note.sectionIndex);
  if (!sed) return;
  sed.commit({
    ...note.section,
    items: note.section.items.map((item, index) => (index === note.itemIndex ? { ...item, ...patch } : item)),
  });
}

/** 함정(trap) 텍스트의 선행 ⚠ 제거 — 프롬프트가 "⚠ 시험에선…"으로 시작하게 지시하는데
 *  렌더 표면(par-list-trap·par-rail-card-trap·par-read-note-trap)마다 CSS ::before 가
 *  ⚠/「함정 」 접두를 또 붙여 "⚠ ⚠"·"함정 ⚠" 이중 표기가 되던 결함(마커 감사 M3, 26-08-22).
 *  아이콘은 CSS 가 단일 소유하고, 데이터의 ⚠ 는 표시 직전에 벗긴다(저장값 무접촉). */
export function stripTrapIcon(t: string | undefined | null): string {
  return (t ?? "").replace(/^[\s⚠️]+/u, "").trim();
}

export function ReadLogicNote({ note, editable, sectionEdit }: { note: LogicNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div className="par-read-note par-read-note-logic">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={note.row.functionLabel}
        onCommit={(v) => patchLogicNote(note, sectionEdit, { functionLabel: v })}
      />
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={note.row.keyPoint}
        onCommit={(v) => patchLogicNote(note, sectionEdit, { keyPoint: v })}
      />
    </div>
  );
}

export function ReadGrammarNote({ note, editable, sectionEdit }: { note: GrammarNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div className="par-read-note par-read-note-grammar">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={note.row.point}
        onCommit={(v) => patchGrammarNote(note, sectionEdit, { point: v })}
      />
      {note.row.excerpt || editable ? (
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.excerpt ?? ""}
          placeholder="(원문 구절)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { excerpt: v })}
        />
      ) : null}
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={note.row.explanation}
        onCommit={(v) => patchGrammarNote(note, sectionEdit, { explanation: v })}
      />
      {note.row.trap || editable ? (
        <Field
          as="span"
          className="par-read-note-trap"
          editable={editable}
          value={stripTrapIcon(note.row.trap)}
          placeholder="(함정 포인트)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { trap: v })}
        />
      ) : null}
    </div>
  );
}

function ReadExamNote({ note, editable, sectionEdit }: { note: ExamNoteRef; editable: boolean; sectionEdit?: (i: number) => SectionEdit }) {
  return (
    <div className="par-read-note par-read-note-exam">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={note.row.type}
        onCommit={(v) => patchExamNote(note, sectionEdit, { type: v })}
      />
      {note.row.asks || editable ? (
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.asks ?? ""}
          placeholder="(묻는 것)"
          onCommit={(v) => patchExamNote(note, sectionEdit, { asks: v })}
        />
      ) : null}
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={note.row.strategy ?? ""}
        onCommit={(v) => patchExamNote(note, sectionEdit, { strategy: v })}
      />
    </div>
  );
}

const STUDY_NOTE_SPLIT_AT = 115;
const STUDY_NOTE_TARGET_CHARS = 82;

export function splitStudyNoteText(text: string): string[] {
  const normalized = text.trim();
  if (normalized.length <= STUDY_NOTE_SPLIT_AT) return [text];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  tokens.forEach((token) => {
    const next = current ? `${current} ${token}` : token;
    if (current && next.length > STUDY_NOTE_TARGET_CHARS) {
      parts.push(current);
      current = token;
    } else {
      current = next;
    }
  });
  if (current) parts.push(current);
  return parts.length ? parts : [text];
}

function joinStudyNoteParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1");
}

export function grammarNoteParts(note: GrammarNoteRef, editable: boolean): GrammarNotePart[] {
  const bodyParts = splitStudyNoteText(note.row.explanation);
  return [
    { kind: "label" },
    ...(note.row.excerpt || editable ? ([{ kind: "target" }] as GrammarNotePart[]) : []),
    ...bodyParts.map((_, index) => ({ kind: "body" as const, index, parts: bodyParts })),
    ...(note.row.trap || editable ? ([{ kind: "trap" }] as GrammarNotePart[]) : []),
  ];
}

export function examNoteParts(note: ExamNoteRef, editable: boolean): ExamNotePart[] {
  const bodyParts = splitStudyNoteText(note.row.strategy ?? "");
  return [
    { kind: "label" },
    ...(note.row.asks || editable ? ([{ kind: "target" }] as ExamNotePart[]) : []),
    ...bodyParts.map((_, index) => ({ kind: "body" as const, index, parts: bodyParts })),
  ];
}

export function parsingNoteParts(note: ParsingNoteRef): ParsingNotePart[] {
  return [
    ...note.item.parts.map((_, index) => ({ kind: "part" as const, index })),
    ...(note.item.translation ? ([{ kind: "translation" }] as ParsingNotePart[]) : []),
  ];
}

export function grammarPartKey(part: GrammarNotePart): string {
  return part.kind === "body" ? `body-${part.index}` : part.kind;
}

export function examPartKey(part: ExamNotePart): string {
  return part.kind === "body" ? `body-${part.index}` : part.kind;
}

export function parsingPartKey(part: ParsingNotePart): string {
  return part.kind === "part" ? `part-${part.index}` : part.kind;
}

export function ReadGrammarNotePart({
  note,
  part,
  editable,
  sectionEdit,
}: {
  note: GrammarNoteRef;
  part: GrammarNotePart;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (part.kind === "label") {
    return (
      <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-head">
        <Field
          as="span"
          className="par-read-note-label"
          editable={editable}
          value={note.row.point}
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { point: v })}
        />
      </div>
    );
  }
  if (part.kind === "target") {
    return (
      <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-target">
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.excerpt ?? ""}
          placeholder="(원문 구절)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { excerpt: v })}
        />
      </div>
    );
  }
  if (part.kind === "trap") {
    return (
      <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-trap">
        <Field
          as="span"
          className="par-read-note-trap"
          editable={editable}
          value={stripTrapIcon(note.row.trap)}
          placeholder="(함정 포인트)"
          onCommit={(v) => patchGrammarNote(note, sectionEdit, { trap: v })}
        />
      </div>
    );
  }
  return (
    <div className="par-read-note par-read-note-grammar par-read-note-split par-read-note-split-body">
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={part.parts[part.index] ?? ""}
        onCommit={(v) => {
          const nextParts = part.parts.map((item, index) => (index === part.index ? v : item));
          patchGrammarNote(note, sectionEdit, { explanation: joinStudyNoteParts(nextParts) });
        }}
      />
    </div>
  );
}

export function ReadExamNotePart({
  note,
  part,
  editable,
  sectionEdit,
}: {
  note: ExamNoteRef;
  part: ExamNotePart;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (part.kind === "label") {
    return (
      <div className="par-read-note par-read-note-exam par-read-note-split par-read-note-split-head">
        <Field
          as="span"
          className="par-read-note-label"
          editable={editable}
          value={note.row.type}
          onCommit={(v) => patchExamNote(note, sectionEdit, { type: v })}
        />
      </div>
    );
  }
  if (part.kind === "target") {
    return (
      <div className="par-read-note par-read-note-exam par-read-note-split par-read-note-split-target">
        <Field
          as="span"
          className="par-read-note-target"
          editable={editable}
          value={note.row.asks ?? ""}
          placeholder="(묻는 것)"
          onCommit={(v) => patchExamNote(note, sectionEdit, { asks: v })}
        />
      </div>
    );
  }
  return (
    <div className="par-read-note par-read-note-exam par-read-note-split par-read-note-split-body">
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={part.parts[part.index] ?? ""}
        onCommit={(v) => {
          const nextParts = part.parts.map((item, index) => (index === part.index ? v : item));
          patchExamNote(note, sectionEdit, { strategy: joinStudyNoteParts(nextParts) });
        }}
      />
    </div>
  );
}

export function ReadParsingNotePart({
  note,
  part,
  editable,
  sectionEdit,
}: {
  note: ParsingNoteRef;
  part: ParsingNotePart;
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (part.kind === "translation") {
    return (
      <div className="par-read-note par-read-note-parse par-read-note-split par-read-note-split-parse-trans">
        <span className="par-read-note-label">→ 해석</span>
        <Field
          as="span"
          className="par-read-note-body"
          editable={editable}
          value={note.item.translation}
          onCommit={(v) => patchParsingNote(note, sectionEdit, { translation: v })}
        />
      </div>
    );
  }

  const parsePart = note.item.parts[part.index];
  if (!parsePart) return null;
  return (
    <div className="par-read-note par-read-note-parse par-read-note-split par-read-note-split-parse-part">
      <Field
        as="span"
        className="par-read-note-label"
        editable={editable}
        value={parsePart.label}
        onCommit={(v) => {
          patchParsingNote(note, sectionEdit, {
            parts: note.item.parts.map((item, index) => (index === part.index ? { ...item, label: v } : item)),
          });
        }}
      />
      <Field
        as="span"
        className="par-read-note-body"
        editable={editable}
        value={parsePart.text}
        onCommit={(v) => {
          patchParsingNote(note, sectionEdit, {
            parts: note.item.parts.map((item, index) => (index === part.index ? { ...item, text: v } : item)),
          });
        }}
      />
    </div>
  );
}

export function ReadingStudyNoteBlock({ children }: { children: ReactNode }) {
  return (
    <article className="par-reading-flow-note">
      <div className="par-reading-row-grid par-reading-note-grid">
        <div className="par-reading-note-main">{children}</div>
        <div className="par-reading-note-side" aria-hidden />
      </div>
    </article>
  );
}

export function ReadingExamBank({
  notes,
  editable,
  sectionEdit,
}: {
  notes: ExamNoteRef[];
  editable: boolean;
  sectionEdit?: (i: number) => SectionEdit;
}) {
  if (!notes.length) return null;
  return (
    <div className="par-reading-lab par-read-exam-bank-block">
      <div className="par-read-bank-title">유형별 출제 포인트</div>
      <div className="par-read-bank-grid">
        {notes.map((note) => (
          <ReadExamNote key={`eg-${note.sectionIndex}-${note.rowIndex}`} note={note} editable={editable} sectionEdit={sectionEdit} />
        ))}
      </div>
    </div>
  );
}
