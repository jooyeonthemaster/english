"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTutorProgramAction } from "@/actions/tutor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

type PassageCandidate = {
  id: string;
  title: string;
  grade: number | null;
  unit: string | null;
  school: { name: string } | null;
  analysis: { id: string } | null;
};

export function TutorProgramCreateForm({ passages }: { passages: PassageCandidate[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedLabel = useMemo(() => `${selected.length}/12`, [selected.length]);

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 12) return current;
      return [...current, id];
    });
  }

  function submit(formData: FormData) {
    setError("");
    formData.set("passageIds", selected.join(","));
    startTransition(async () => {
      const result = await createTutorProgramAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/director/tutor/programs/${result.id}/builder`);
    });
  }

  return (
    <form action={submit} className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-600">새 프로그램</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">지문 묶음 만들기</h1>
        <p className="mt-2 text-sm text-slate-500">분석 완료 지문을 최대 12개까지 선택하세요.</p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[360px_1fr]">
          <div className="space-y-3">
            <Input name="title" placeholder="예: 한영고 1학년 중간대비" required />
            <Textarea name="description" placeholder="선생님 내부 메모" rows={4} />
            <select
              name="templateKey"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              defaultValue="basic_interpret"
            >
              <option value="basic_interpret">기초 해석형</option>
              <option value="memorize">본문 암기형</option>
              <option value="grammar_focus">어법 집중형</option>
              <option value="advanced_transform">상위권 변형형</option>
              <option value="exam_compression">시험 전 압축형</option>
            </select>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
              선택 지문 {selectedLabel}
            </div>
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <Button disabled={isPending || selected.length === 0} className="w-full bg-blue-600 hover:bg-blue-700">
              {isPending ? "생성 중" : "프로그램 생성"}
            </Button>
          </div>

          <div className="grid max-h-[620px] gap-2 overflow-y-auto pr-1">
            {passages.map((passage) => {
              const checked = selected.includes(passage.id);
              return (
                <button
                  key={passage.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(passage.id)}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-1 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent",
                    ].join(" ")}
                  >
                    <Check className="size-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{passage.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {passage.school?.name ?? "학교 미지정"} · {passage.grade ? `${passage.grade}학년` : "학년 미지정"} ·{" "}
                      {passage.unit ?? "단원 미지정"}
                    </span>
                  </span>
                  <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                    분석 완료
                  </Badge>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
