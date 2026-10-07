import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getStaffSession } from "@/lib/auth";
import {
  canAccessForecastPack,
  decodeOrderList,
  getForecastPack,
  getForecastPassages,
  getForecastQuestionsByIds,
  getForecastQuestionsByOrders,
  getForecastSets,
  isForecastPackPublic,
} from "@/lib/exam-forecast/queries";
import { questionsToAnswers, questionsToPaper, resolveMeta, setToAnswers, setToPaper } from "@/lib/exam-forecast/paper-items";
import { ForecastPrintClient } from "@/components/exam-forecast/print/forecast-print-client";

// 인쇄 전용 화면(앱 셸 없음). 경로 그룹 (forecast-print) — /director/* 지만 proxy 가 이 경로만은 통과시키고
// 권한은 아래에서 판정한다(공개 팩은 비로그인도 연다).
//   ?set=3            봉투 모의고사 3회 문제지        (&answers=1 → 정답·해설)
//   ?q=12-40,55       문항 번호(sortOrder) 목록      (&answers=1)
//   ?passage=HP-q20   지문 한 개의 예측 문항 전부
//   ?workbook=all     예측 문항 문제집(all | textbook | hakpyeong | olympus)
//   ?ref=1            실제 기출(재조판) — 형식 대조용

export const metadata: Metadata = { title: "시험지 인쇄", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 실물 기출(2026 1학기 1차) 쪽수 */
const EXAM_PAGES = 10;

type SP = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ForecastPrintPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pack = await getForecastPack(slug);
  // 공개 팩은 누구나. 비공개면 예전처럼 원장 세션 + 학원 제한(proxy 가 비원장도 통과시키므로 여기서 막는다)
  if (!pack || !isForecastPackPublic(pack)) {
    const staff = await getStaffSession();
    if (!staff) redirect(`/login?callbackUrl=/director/exam-forecast/${slug}`);
    if (staff.role !== "DIRECTOR") redirect("/teacher");
    if (!pack || !canAccessForecastPack(pack, staff)) notFound();
  }
  const meta = resolveMeta(pack.examMeta);
  const passages = await getForecastPassages(pack.id);
  const plabel = new Map(passages.map((p) => [p.code, p.sourceLabel]));
  const passageLabel = (code: string) => plabel.get(code) ?? code;
  const ptitle = new Map(passages.map((p) => [p.code, p.titleKo]));
  const sectionOf = (code: string) => ({ title: passageLabel(code), sub: ptitle.get(code) });
  const answers = one(sp.answers) === "1";
  const footer = { left: meta.subjectShort, right: meta.footerRight };
  const autoPrint = one(sp.print) !== "0";

  const setNo = one(sp.set);
  if (setNo) {
    const sets = await getForecastSets(pack.id);
    const set = sets.find((s) => s.no === Number(setNo));
    if (!set) notFound();
    const qs = await getForecastQuestionsByIds(pack.id, set.items.map((i) => i.questionId));
    if (answers) {
      const a = setToAnswers(set, qs, passageLabel);
      return <ForecastPrintClient mode="answers" title={a.title} answers={a} footer={footer} autoPrint={autoPrint} />;
    }
    const paper = setToPaper(set, qs, meta);
    // 봉투는 실물 기출과 같은 10쪽이 목표 — 넘치면 조판 엔진이 압축·쪼개기 조건을 한 단계씩 푼다
    return <ForecastPrintClient mode="paper" title={set.title} paper={paper} footer={footer} autoPrint={autoPrint} targetPages={EXAM_PAGES} />;
  }

  const qParam = one(sp.q);
  const passageCode = one(sp.passage);
  const ref = one(sp.ref) === "1";
  const workbook = one(sp.workbook);
  let qs = [] as Awaited<ReturnType<typeof getForecastQuestionsByIds>>;
  let title = "선택 문항";
  if (qParam) {
    qs = await getForecastQuestionsByOrders(pack.id, decodeOrderList(qParam));
    title = `선택 문항 ${qs.length}개`;
  } else if (passageCode) {
    const p = passages.find((x) => x.code === passageCode);
    if (!p) notFound();
    const { getForecastQuestionsByPassage } = await import("@/lib/exam-forecast/queries");
    qs = (await getForecastQuestionsByPassage(pack.id, p.id)).filter((q) => q.role === "forecast");
    title = `${p.sourceLabel} — ${p.titleKo}`;
  } else if (workbook) {
    const { getForecastWorkbookQuestions } = await import("@/lib/exam-forecast/queries");
    const group = workbook === "hakpyeong" ? "학평" : workbook === "olympus" ? "올림포스" : workbook === "textbook" ? "교과서" : undefined;
    qs = await getForecastWorkbookQuestions(pack.id, group);
    title = `예측 문항 문제집${group ? ` — ${group} 편` : ""}`;
  } else if (ref) {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.examForecastQuestion.findMany({ where: { packId: pack.id, role: "reference" }, select: { id: true }, orderBy: { sortOrder: "asc" } });
    qs = await getForecastQuestionsByIds(pack.id, rows.map((r) => r.id));
    title = "기출 원본(2026 1학기 1차) 재조판";
  } else {
    notFound();
  }
  if (answers) {
    const a = questionsToAnswers(qs, `${title} — 정답 및 해설`, passageLabel);
    return <ForecastPrintClient mode="answers" title={a.title} answers={a} footer={footer} autoPrint={autoPrint} />;
  }
  if (ref) {
    // 기출 재조판 — 원본 머리·바닥글 그대로(형식 대조용)
    const paper = questionsToPaper(qs, title, meta);
    paper.header = {
      gradeLabel: "2학년",
      schoolLine: "한광고등학교 1학기 1차 정기시험 문제지",
      subjectLine: "영어Ⅰ (과목코드: 12)",
      dateLine: "2026년 4월 29일 2교시  대상학급 : 1~10반",
      countLine: "본 시험은 선택형 27문항, 논술형 3문항이며 쪽수는 {PAGES}쪽입니다.",
    };
    paper.items = paper.items.map((it, i) => ({ ...it, points: qs[i].points }));
    return <ForecastPrintClient mode="paper" title={title} paper={paper} footer={{ left: "영어Ⅰ", right: "이 문제지에 대한 저작권은 한광고등학교에 있습니다." }} autoPrint={autoPrint} targetPages={EXAM_PAGES} />;
  }
  const paper = questionsToPaper(qs, title, meta, { sections: passageCode ? undefined : sectionOf });
  return <ForecastPrintClient mode="paper" title={title} paper={paper} footer={footer} autoPrint={autoPrint} essayMode="inline" showCheckBox={false} />;
}
