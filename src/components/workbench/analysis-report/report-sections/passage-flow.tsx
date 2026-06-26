import { buildSentenceCanvasPlan, planSentenceSplit, resolveAnchorRange } from "@/lib/passage-report/analysis-report/passage-canvas-model";
import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import { splitReadingSentenceText } from "./annotated-reading";
import { AnnotatedColorLegend, AnnotatedPassageSentenceBlock, AnnotatedPassageSentenceSideBlock, AnnotatedPassageSentenceSourceBlock, AnnotatedSentenceCanvas, CleanPassageSentence, buildCanvasNotesForSentence } from "./sentence-canvas";
import { ReadExamNotePart, ReadGrammarNotePart, ReadParsingNotePart, ReadingExamBank, ReadingStudyNoteBlock, collectPassageStudyNotes, examNoteParts, examPartKey, grammarNoteParts, grammarPartKey, parsingNoteParts, parsingPartKey } from "./study-notes";
import type { PassageSection, SectionFlowCtx } from "./types";
import { findVocabularyInlineMatches } from "./vocabulary";

export function passageSectionFlow(section: Extract<AnalysisSection, { kind: "passage" }>, ctx: SectionFlowCtx): void {
  const { si, editable, commit, push, options } = ctx;
const s = section;
      const study = collectPassageStudyNotes(options?.allSections ?? [s], s.sentences);
      const keywords = (s.keywords ?? []).filter((k) => k.trim().length > 1);

      // ── 깔끔한 원문 + 해석 (필기 없음) ──
      if (options?.passageRenderMode === "clean") {
        // 클린 모드: 핵심 어휘 밑줄/범례를 표시하지 않는다 (원문은 깔끔하게 유지).
        s.sentences.forEach((sentence, sentenceIndex) => {
          const patchClean = (patch: Partial<PassageSection["sentences"][number]>) =>
            commit({ ...s, sentences: s.sentences.map((it, idx) => (idx === sentenceIndex ? { ...it, ...patch } : it)) });
          push(
            "reading",
            `clean-snt${sentenceIndex}`,
            <CleanPassageSentence
              no={sentence.n}
              en={sentence.en}
              ko={sentence.ko}
              keywords={[]}
              editable={editable}
              onCommitEn={(v) => patchClean({ en: v })}
              onCommitKo={(v) => patchClean({ ko: v })}
            />,
          );
        });
        return;
      }

      // ── 신규 필기 캔버스 (HLC) ──
      if ((options?.passageLayout ?? "hlc") !== "legacy") {
        // 색상 범례 — 어법/구문/출제/논리 색이 무엇을 뜻하는지 표시
        push("note", "anno-legend", <AnnotatedColorLegend />);
        s.sentences.forEach((_sentence, sentenceIndex) => {
          const sentence = s.sentences[sentenceIndex];
          const vocabNotes = study.vocabBySentence.get(sentence.n) ?? [];
          const vocabRanges = findVocabularyInlineMatches(sentence.en, vocabNotes).map((m) => ({ start: m.start, end: m.end }));
          const { notes, refs } = buildCanvasNotesForSentence(study, sentence.n);
          const seed = sentence.chunks?.length ? sentence.chunks : undefined;
          const plan = buildSentenceCanvasPlan(sentence.en, sentence.ko, seed, notes, vocabRanges);
          const patchSentence = (patch: Partial<PassageSection["sentences"][number]>) =>
            commit({ ...s, sentences: s.sentences.map((it, idx) => (idx === sentenceIndex ? { ...it, ...patch } : it)) });
          const groups = planSentenceSplit(plan);
          if (!groups.length) {
            push(
              "reading",
              `annotated-snt${sentenceIndex}`,
              <AnnotatedSentenceCanvas
                canvasId={`s${si}-annotated-snt${sentenceIndex}`}
                no={sentence.n}
                isCont={false}
                plan={plan}
                en={sentence.en}
                ko={sentence.ko}
                vocabNotes={[]}
                keywords={keywords}
                refs={refs}
                editable={editable}
                sectionEdit={options?.sectionEdit}
                onCommitEn={(newEn) => patchSentence({ en: newEn })}
                onCommitKo={(newKo) => patchSentence({ ko: newKo })}
                showTrans
              />,
            );
          } else {
            groups.forEach((group, partIndex) => {
              const subChunks = group.map((ci) => plan.chunks[ci]);
              const subEn = subChunks.map((c) => c.text).join("");
              const start = subChunks[0].start;
              const end = subChunks[subChunks.length - 1].end;
              const subNotes = notes.filter((nt) => {
                const r = resolveAnchorRange(sentence.en, nt.anchorText);
                return r ? r.start >= start && r.start < end : partIndex === 0;
              });
              const subVocab = vocabRanges
                .filter((r) => r.start >= start && r.start < end)
                .map((r) => ({ start: r.start - start, end: r.end - start }));
              const subPlan = buildSentenceCanvasPlan(subEn, partIndex === 0 ? sentence.ko : "", undefined, subNotes, subVocab);
              push(
                "reading",
                `annotated-snt${sentenceIndex}-source-${partIndex}`,
                <AnnotatedSentenceCanvas
                  canvasId={`s${si}-annotated-snt${sentenceIndex}-source-${partIndex}`}
                  no={sentence.n}
                  isCont={partIndex > 0}
                  plan={subPlan}
                  en={subEn}
                  ko={partIndex === 0 ? sentence.ko : ""}
                  vocabNotes={[]}
                  keywords={keywords}
                  refs={refs}
                  editable={editable}
                  sectionEdit={options?.sectionEdit}
                  onCommitKo={partIndex === 0 ? (newKo) => patchSentence({ ko: newKo }) : undefined}
                  showTrans={partIndex === 0}
                />,
              );
            });
          }
        });
        if (study.globalExam.length) {
          push("note", "annotated-exam-bank", <ReadingExamBank notes={study.globalExam} editable={!!options?.sectionEdit} sectionEdit={options?.sectionEdit} />);
        }
        return;
      }

      // ── legacy 스택 카드 경로 (passageLayout === "legacy") ──
      s.sentences.forEach((_sentence, sentenceIndex) => {
        const sentence = s.sentences[sentenceIndex];
        const sourceParts = splitReadingSentenceText(sentence.en);
        if (sourceParts.length > 1) {
          sourceParts.forEach((_part, partIndex) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-source-${partIndex}`,
              <AnnotatedPassageSentenceSourceBlock
                section={s}
                sentenceIndex={sentenceIndex}
                partIndex={partIndex}
                parts={sourceParts}
                study={study}
                editable={editable}
                onCommit={commit}
              />,
            );
          });
          push(
            "reading",
            `annotated-snt${sentenceIndex}-trans`,
            <AnnotatedPassageSentenceSideBlock
              section={s}
              sentenceIndex={sentenceIndex}
              study={study}
              editable={editable}
              onCommit={commit}
              sectionEdit={options?.sectionEdit}
            />,
          );
        } else {
          push(
            "reading",
            `annotated-snt${sentenceIndex}`,
            <AnnotatedPassageSentenceBlock
              section={s}
              sentenceIndex={sentenceIndex}
              study={study}
              editable={editable}
              onCommit={commit}
              sectionEdit={options?.sectionEdit}
            />,
          );
        }
        const canEditLinked = !!options?.sectionEdit;
        const grammarNotes = study.grammarBySentence.get(sentence.n) ?? [];
        const parsingNotes = study.parsingBySentence.get(sentence.n) ?? [];
        const examNotes = study.examBySentence.get(sentence.n) ?? [];
        grammarNotes.forEach((note) => {
          grammarNoteParts(note, canEditLinked).forEach((part) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-grammar-${note.sectionIndex}-${note.rowIndex}-${grammarPartKey(part)}`,
              <ReadingStudyNoteBlock>
                <ReadGrammarNotePart note={note} part={part} editable={canEditLinked} sectionEdit={options?.sectionEdit} />
              </ReadingStudyNoteBlock>,
            );
          });
        });
        parsingNotes.forEach((note) => {
          parsingNoteParts(note).forEach((part) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-parse-${note.sectionIndex}-${note.itemIndex}-${parsingPartKey(part)}`,
              <ReadingStudyNoteBlock>
                <ReadParsingNotePart note={note} part={part} editable={canEditLinked} sectionEdit={options?.sectionEdit} />
              </ReadingStudyNoteBlock>,
            );
          });
        });
        examNotes.forEach((note) => {
          examNoteParts(note, canEditLinked).forEach((part) => {
            push(
              "reading",
              `annotated-snt${sentenceIndex}-exam-${note.sectionIndex}-${note.rowIndex}-${examPartKey(part)}`,
              <ReadingStudyNoteBlock>
                <ReadExamNotePart note={note} part={part} editable={canEditLinked} sectionEdit={options?.sectionEdit} />
              </ReadingStudyNoteBlock>,
            );
          });
        });
      });
      if (study.globalExam.length) {
        push(
          "note",
          "annotated-exam-bank",
          <ReadingExamBank notes={study.globalExam} editable={!!options?.sectionEdit} sectionEdit={options?.sectionEdit} />,
        );
      }
}
