"use client";

import { useMemo, useState, useTransition } from "react";
import { setManualSectionVisibility } from "@/actions/admin-settings";
import { MANUAL_CANVA_EDIT_LINKS } from "@/lib/manual/canva-links";
import { Eye, EyeOff, ExternalLink, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

interface ManualSectionVisibilityGroup {
  no: string;
  name: string;
  slug: string;
  start: number;
  count: number;
}

interface ManualSectionVisibilityCardProps {
  groups: ManualSectionVisibilityGroup[];
  initialVisibility: Record<string, boolean>;
}

function isVisible(visibility: Record<string, boolean>, slug: string) {
  return visibility[slug] !== false;
}

export function ManualSectionVisibilityCard({
  groups,
  initialVisibility,
}: ManualSectionVisibilityCardProps) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => initialVisibility);
  const [savedVisibility, setSavedVisibility] = useState<Record<string, boolean>>(
    () => initialVisibility,
  );
  const [isPending, startTransition] = useTransition();

  const visibleCount = useMemo(
    () => groups.filter((group) => isVisible(visibility, group.slug)).length,
    [groups, visibility],
  );
  const hiddenCount = groups.length - visibleCount;
  const dirty = useMemo(
    () =>
      groups.some(
        (group) => isVisible(visibility, group.slug) !== isVisible(savedVisibility, group.slug),
      ),
    [groups, savedVisibility, visibility],
  );

  function setGroupVisible(slug: string, visible: boolean) {
    setVisibility((current) => ({ ...current, [slug]: visible }));
  }

  function setAll(visible: boolean) {
    const next = Object.fromEntries(groups.map((group) => [group.slug, visible]));
    setVisibility(next);
  }

  function reset() {
    setVisibility(savedVisibility);
  }

  function save() {
    const next = Object.fromEntries(
      groups.map((group) => [group.slug, isVisible(visibility, group.slug)]),
    );
    startTransition(async () => {
      const res = await setManualSectionVisibility(next);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setVisibility(res.visibility);
      setSavedVisibility(res.visibility);
      toast.success("매뉴얼 노출 설정을 저장했어요.");
    });
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-950">목차별 노출 설정</h2>
          <p className="mt-1 text-[12px] leading-5 text-gray-400">
            숨긴 항목은 원장 사용 매뉴얼 목차와 상세 좌측 메뉴에서 보이지 않습니다. 슬라이드
            내용 수정은 Canva 편집 링크에서 진행합니다 (편집 후 별도 반영 배포 필요).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Eye className="size-3.5" />
            전체 공개
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <EyeOff className="size-3.5" />
            전체 숨김
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-semibold">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
          공개 {visibleCount}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">
          숨김 {hiddenCount}
        </span>
      </div>

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
        {groups.map((group) => {
          const visible = isVisible(visibility, group.slug);
          return (
            <div
              key={group.slug}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[12px] font-black text-blue-600">
                    {group.no !== "0" ? group.no : "START"}
                  </span>
                  <h3 className="truncate text-[13px] font-bold text-gray-950">{group.name}</h3>
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-gray-400">
                  {group.count}장 · {group.slug}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {MANUAL_CANVA_EDIT_LINKS[group.slug] ? (
                  <a
                    href={MANUAL_CANVA_EDIT_LINKS[group.slug]}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-violet-200 px-3 text-[12px] font-semibold text-violet-700 transition hover:bg-violet-50"
                  >
                    <ExternalLink className="size-3.5" />
                    Canva 편집
                  </a>
                ) : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={visible}
                  onClick={() => setGroupVisible(group.slug, !visible)}
                  disabled={isPending}
                  className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold transition disabled:opacity-50 ${
                    visible
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {visible ? "공개" : "숨김"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={reset}
          disabled={!dirty || isPending}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" />
          되돌리기
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          <Save className="size-3.5" />
          {isPending ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </section>
  );
}
