import type { PaperHeader, PaperItem } from "@/components/exam-forecast/paper/question-parts";
import type { AnswerItem } from "@/components/exam-forecast/paper/answer-sheet";
import { FORECAST_QTYPES, type ForecastQuestion, type ForecastSet } from "./types";

// DB 문항 → 시험지 PaperItem / 정답지 AnswerItem. 앱 인쇄 경로와 PDF 사전 생성이 같이 쓴다.

export interface ForecastExamMeta {
  gradeLabel?: string;
  schoolLine?: string;
  subjectLine?: string;
  subjectShort?: string;
  footerRight?: string;
}

const DEFAULT_META: Required<ForecastExamMeta> = {
  gradeLabel: "2학년",
  schoolLine: "한광고등학교 2학기 1차 정기시험 대비 동형 모의고사",
  subjectLine: "영어Ⅱ (과목코드: 12)",
  subjectShort: "영어Ⅱ",
  footerRight: "이 문제지에 대한 저작권은 스모트(SMOAT)에 있습니다.",
};

export function resolveMeta(meta: Record<string, unknown> | null | undefined): Required<ForecastExamMeta> {
  const picked = Object.fromEntries(Object.entries(meta ?? {}).filter(([, v]) => typeof v === "string" && v));
  return { ...DEFAULT_META, ...picked } as Required<ForecastExamMeta>;
}

/** 기출의 묶음 발문 번호대 — 같은 유형 두 문항이 지시문 하나를 나눠 쓴다 */
const SET_GROUPS: Record<number, string> = { 10: "10-11", 11: "10-11", 13: "13-14", 14: "13-14", 17: "17-18", 18: "17-18", 19: "19-20", 20: "19-20", 22: "22-23", 23: "22-23", 24: "24-25", 25: "24-25" };

/** 봉투 세트 → 시험지 */
export function setToPaper(set: ForecastSet, questions: ForecastQuestion[], meta: Required<ForecastExamMeta>) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const items: PaperItem[] = [];
  for (const it of [...set.items].sort((a, b) => a.number - b.number)) {
    const q = byId.get(it.questionId);
    if (!q) continue;
    const essay = it.number > 100;
    const group = SET_GROUPS[it.number];
    items.push({
      key: `${set.no}-${it.number}`,
      number: essay ? null : it.number,
      essayNo: essay ? it.number - 100 : null,
      points: it.points,
      qtype: q.qtype,
      body: group ? { ...q.body, groupKey: group, groupStem: q.body.stem } : { ...q.body, groupKey: undefined, groupStem: undefined },
    });
  }
  const mc = items.filter((i) => i.number != null).length;
  const header: PaperHeader = {
    gradeLabel: meta.gradeLabel,
    schoolLine: meta.schoolLine,
    subjectLine: meta.subjectLine,
    dateLine: `봉투 모의고사 제 ${set.no} 회  대상학급 : 1~10반`,
    countLine: `본 시험은 선택형 ${mc}문항, 논술형 ${items.length - mc}문항이며 쪽수는 {PAGES}쪽입니다.`,
  };
  return { header, items };
}

export function setToAnswers(set: ForecastSet, questions: ForecastQuestion[], passageLabel: (code: string) => string) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const items: AnswerItem[] = [];
  for (const it of [...set.items].sort((a, b) => a.number - b.number)) {
    const q = byId.get(it.questionId);
    if (!q) continue;
    items.push({
      key: `${set.no}-${it.number}`,
      label: it.number > 100 ? `논술형 ${it.number - 100}` : String(it.number),
      answer: q.answer,
      points: it.points,
      typeLabel: FORECAST_QTYPES[q.qtype]?.label ?? q.qtype,
      sourceLabel: passageLabel(q.passageCode),
      explanation: q.explanation,
      rationale: q.rationale,
    });
  }
  return { title: `봉투 모의고사 제${set.no}회 정답 및 해설`, items };
}

/**
 * 임의 선택(문항 은행·문제집) → 시험지. 선택형 1..N 연번, 서술형은 논술형 1..M.
 * sections 를 주면 지문이 바뀔 때마다 구획 머리(출처·제목)를 찍는다.
 */
export function questionsToPaper(
  questions: ForecastQuestion[],
  title: string,
  meta: Required<ForecastExamMeta>,
  opts?: { sections?: (passageCode: string) => { title: string; sub?: string } },
): { header: PaperHeader | null; items: PaperItem[] } {
  let mc = 0;
  let es = 0;
  let prev = "";
  const items: PaperItem[] = questions.map((q) => {
    const essay = q.kind === "ESSAY";
    if (essay) es += 1;
    else mc += 1;
    const section = opts?.sections && q.passageCode !== prev ? opts.sections(q.passageCode) : null;
    prev = q.passageCode;
    return { key: q.id, number: essay ? null : mc, essayNo: essay ? es : null, points: q.points, qtype: q.qtype, body: q.body, section };
  });
  const header: PaperHeader = {
    gradeLabel: meta.gradeLabel,
    schoolLine: meta.schoolLine.replace("동형 모의고사", "예측 문항"),
    subjectLine: meta.subjectLine,
    dateLine: title.length > 34 ? `${title.slice(0, 33)}…` : title,
    countLine: `선택형 ${mc}문항${es ? `, 논술형 ${es}문항` : ""} · 쪽수는 {PAGES}쪽입니다.`,
  };
  return { header, items };
}

export function questionsToAnswers(questions: ForecastQuestion[], title: string, passageLabel: (code: string) => string) {
  let mc = 0;
  let es = 0;
  const items: AnswerItem[] = questions.map((q) => {
    const essay = q.kind === "ESSAY";
    if (essay) es += 1;
    else mc += 1;
    return {
      key: q.id,
      label: essay ? `논술형 ${es}` : String(mc),
      answer: q.answer,
      points: q.points,
      typeLabel: FORECAST_QTYPES[q.qtype]?.label ?? q.qtype,
      sourceLabel: passageLabel(q.passageCode),
      explanation: q.explanation,
      rationale: q.rationale,
    };
  });
  return { title, items };
}
