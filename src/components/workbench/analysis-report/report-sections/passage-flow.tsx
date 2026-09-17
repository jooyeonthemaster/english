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
      // ── 깔끔한 원문 + 해석 (필기 없음) ──
      // ⚠️ study/keywords 계산보다 **위**에 둔다. clean 패스는 둘 다 한 번도 읽지 않는다
      //    (keywords={[]} 로 고정, vocabNotes 미사용). 예전에는 이 위에서 매번
      //    collectPassageStudyNotes 를 돌려 결과를 통째로 버렸다(= reportFlowItems 비용의 31%).
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

      // 여기서부터(HLC 캔버스 / legacy 스택 카드)만 study 가 필요하다.
      // options.study = assemble 이 1회 계산해 주입한 값(clean/annotated 공유 + 섹션 캐시 키).
      // 주입이 없으면(읽기전용 소비자·지문이 둘 이상인 문서) 기존과 동일하게 직접 계산한다.
      const study = options?.study ?? collectPassageStudyNotes(options?.allSections ?? [s], s.sentences);
      const keywords = (s.keywords ?? []).filter((k) => k.trim().length > 1);

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
              // seed 승계 — 이 파트를 이루는 확정 청크(plan.chunks 조각)를 seed 로 넘긴다.
              // 예전엔 여기가 undefined 라 분할되는 순간 gloss·role 이 전량 소실됐다
              // (26-08-26 RCA — 끊어읽기 글로스 전멸의 렌더러 측 주범, .tmp-par-rca).
              // 트림 2자 미만 조각(1글자 gap: 낱자 관사 등)은 걸러낸다 — alignSeedChunks 의
              // 앵커 탐색이 2자 미만을 거부해 조각 하나가 파트 seed 전체를 죽인다(적대검수 R1).
              // 걸러진 조각은 gloss·role 이 없으므로(글로스 청크는 원 정렬상 2자 미만 불가)
              // fillGaps 가 도로 채워 손실이 없다.
              const subSeed = subChunks
                .filter((c) => c.text.trim().length >= 2)
                .map((c) => ({ text: c.text, gloss: c.gloss, role: c.role, emphasis: c.emphasis }));
              const subPlan = buildSentenceCanvasPlan(subEn, partIndex === 0 ? sentence.ko : "", subSeed, subNotes, subVocab);
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
