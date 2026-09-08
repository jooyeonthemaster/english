import { notFound, redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";
import {
  buildGichulRenderExam,
  selectExamBankItemsForRender,
  selectExamBankSetsForRender,
} from "@/lib/exam-passages/question-bank-render";
import type { ExamBankItem, ExamBankSet } from "@/lib/exam-passages/question-bank-types";
import { GichulRenderClient } from "./client";

// 기출 문항 은행 → 시험지 조판 렌더 전수 검증 페이지(개발 전용, 스태프 세션 필요).
//   /director/dev/gichul-render?offset=0&limit=30[&type=빈칸추론][&ids=a,b,c]
// DB 를 만지지 않는다 — 은행 항목을 반입 액션과 같은 모양의 Question 으로 조립해 실제 조판기(ExamDetailPaperPreview)로 그린다.
// 프로덕션에서는 GICHUL_RENDER_DEV=1 이 없으면 404.

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default async function GichulRenderPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV === "production" && process.env.GICHUL_RENDER_DEV !== "1") notFound();
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const ids = one(sp.ids)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const setKeys = one(sp.setKeys)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 장문 세트 모드(§12.4 R) — `?sets=1&offset&limit` 또는 `?setKeys=a,b`.
  // 단위는 **세트**(멤버 2~3문항)라 limit 기본값을 문항 모드(30)보다 작게 잡는다.
  const setMode = one(sp.sets) === "1" || setKeys.length > 0;
  let items: ExamBankItem[];
  let total: number;
  let sets: ExamBankSet[] = [];
  if (setMode) {
    const picked = selectExamBankSetsForRender({
      offset: Number(one(sp.offset) || 0),
      limit: Number(one(sp.limit) || 10),
      setKeys: setKeys.length ? setKeys : null,
    });
    items = picked.items;
    total = picked.total;
    sets = picked.sets;
  } else {
    const picked = selectExamBankItemsForRender({
      offset: Number(one(sp.offset) || 0),
      limit: Number(one(sp.limit) || 30),
      typeGroup: one(sp.type) || null,
      ids: ids.length ? ids : null,
    });
    items = [...picked.items];
    total = picked.total;
  }
  // nofn=1: 각주 없이 그린다(페이지네이션 높이 추정 대조용)
  const exam = buildGichulRenderExam(
    items,
    setMode
      ? `기출 세트 렌더 검증 ${one(sp.offset) || 0}+${sets.length}세트/${items.length}문항`
      : `기출 렌더 검증 ${one(sp.offset) || 0}+${items.length}`,
    { stripFootnotes: one(sp.nofn) === "1", sets },
  );
  const manifest = items.map((i) => ({
    id: i.id,
    subType: i.subType,
    typeGroup: i.typeGroup,
    direction: i.direction,
    firstOption: i.options[0]?.text ?? "",
    footnotes: i.footnotes,
    points: i.points,
    // 본문 내장형(빈칸·삽입·순서·무관·어법·어휘·함축·요약)은 지문이 questionText 안에 있고, 출처형(주장·요지·주제·제목·내용일치)은 지문 박스로 따로 그린다
    embedded: i.questionText.trim() !== i.direction.trim(),
    // 「[주어진 문장]」 라벨·「↓」 는 렌더에서 다른 모양(라벨 텍스트·화살표 세그먼트)이라 머리 비교에서 뺀다
    bodyHead: i.questionText
      .slice(i.direction.length)
      .replace(/\[주어진 문장\]|↓/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 6)
      .join(" "),
    passageHead: (exam.questions.find((q) => q.question.id === i.id)?.question.passage?.content ?? "").split(/\s+/).slice(0, 6).join(" "),
    // 장문 세트 멤버(§12.2) — 하네스가 세트 카드/그룹 검수에 쓴다
    setKey: i.setKey ?? null,
    setLabel: i.setLabel ?? null,
    qNum: i.qNum,
  }));
  const setManifest = sets.map((s) => ({
    key: s.key,
    label: s.label,
    qNums: s.qNums,
    memberIds: s.memberIds,
    unsupportedQNums: s.unsupportedQNums,
    layoutType: s.layout.type,
    blockLabels: (s.layout.blocks ?? []).map((b) => b.label),
    footnotes: s.footnotes,
    passageHead: s.displayedPassage.split(/\s+/).slice(0, 8).join(" "),
  }));
  return (
    <GichulRenderClient exam={exam} manifest={manifest} sets={setManifest} total={total} />
  );
}
