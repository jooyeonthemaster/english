"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Database, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteWorkbenchPassage } from "@/actions/workbench";
import { confirmNative } from "@/lib/browser-confirm";
import { formatDate } from "@/lib/utils";

import { KoreanStudyMaterials } from "./korean-study-materials";

/**
 * 국어 지문 상세 — 영어 상세(PassageDetailClient)의 국어 대칭 클라이언트.
 * 영어 상세는 AI 지문 분석(/api/ai/passage-analysis)·영어 PRIME 학습지·시험 추가
 * 등 영어 파이프라인에 강하게 결합돼 있어 재사용하지 않고, 메타 헤더 · 학습 자료
 * (PRIME_KO 분석 학습지·지문 웹툰 — 둘 다 서버 KO 게이트 경유) · 문항 동선 ·
 * 원문 · 삭제로 구성했다. 영어 전용 기능(영어 분석·실전 학습지·단어 시험지)은
 * 이 화면에 일절 노출되지 않는다.
 */
export interface KoreanPassageDetailData {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  publisher: string | null;
  tags: string | null;
  createdAt: Date | string;
  school: { id: string; name: string } | null;
  questionCount: number;
}

/** tags(JSON 배열)에서 표시용 배지를 뽑는다 — "KO_KIND:소설" → "소설". */
function parseDisplayTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .map((t) => (t.startsWith("KO_KIND:") ? t.slice("KO_KIND:".length) : t));
  } catch {
    return [];
  }
}

export function KoreanPassageDetailClient({
  passage,
}: {
  passage: KoreanPassageDetailData;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const tags = parseDisplayTags(passage.tags);

  async function handleDelete() {
    const ok = confirmNative(
      "이 지문을 삭제하시겠습니까? 관련 문제도 모두 삭제됩니다.",
    );
    if (!ok) return;
    setDeleting(true);
    const result = await deleteWorkbenchPassage(passage.id);
    if (result.success) {
      toast.success("지문이 삭제되었습니다.");
      router.push("/director/korean/passages");
    } else {
      toast.error(result.error || "삭제 실패");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-6">
      {/* ─── 헤더: 백링크 + 제목/메타 + 삭제 ─── */}
      <div>
        <Link
          href="/director/korean/passages"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          국어 지문 관리로 돌아가기
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <FileText className="size-4.5 text-blue-600" />
              </div>
              <h1 className="truncate text-[20px] font-bold text-slate-900">
                {passage.title}
              </h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {passage.school && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  {passage.school.name}
                </Badge>
              )}
              {passage.grade && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {passage.grade}학년
                </Badge>
              )}
              {passage.semester && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {passage.semester === "FIRST" ? "1학기" : "2학기"}
                </Badge>
              )}
              {passage.publisher && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {passage.publisher}
                </Badge>
              )}
              {tags.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="h-5 text-[10px] text-slate-500"
                >
                  {t}
                </Badge>
              ))}
              <span className="text-[11px] text-slate-400">
                {formatDate(new Date(passage.createdAt))} 등록
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 border-red-200 bg-white text-xs font-semibold text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3.5 w-3.5" />
            )}
            삭제
          </Button>
        </div>
      </div>

      {/* ─── 학습 자료: 분석 학습지(PRIME_KO) + 지문 웹툰 ─── */}
      <KoreanStudyMaterials passageId={passage.id} passageTitle={passage.title} />

      {/* ─── 연결된 문항 동선 ─── */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sky-50">
            <Database className="size-4.5 text-sky-600" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-slate-800">
              이 지문으로 생성된 문항{" "}
              <span className="text-blue-600">{passage.questionCount}개</span>
            </p>
            <p className="text-[12px] text-slate-500">
              검수·편집·시험지 만들기는 국어 문제 은행에서 이어집니다.
            </p>
          </div>
        </div>
        <Link href={`/director/korean/questions?passageId=${passage.id}`}>
          <Button
            size="sm"
            className="h-8 bg-blue-600 text-xs font-semibold hover:bg-blue-700"
          >
            문제 은행에서 보기
          </Button>
        </Link>
      </div>

      {/* ─── 지문 원문 ─── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-[13px] font-bold text-slate-500">지문 원문</h2>
        <div className="whitespace-pre-wrap text-[15px] leading-[1.9] text-slate-800">
          {passage.content}
        </div>
      </div>
    </div>
  );
}
