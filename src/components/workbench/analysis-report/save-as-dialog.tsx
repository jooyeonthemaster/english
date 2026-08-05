"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveButton } from "@/components/ui/save-button";

/** "<원본 제목> (사본)" — 시험지 빌더 buildDefaultSaveAsTitle 과 동일 관례. */
export function buildReportSaveAsTitle(currentTitle: string): string {
  const base = currentTitle.trim() || "학습지";
  return `${base} (사본)`;
}

/**
 * '다른 이름으로 저장' 다이얼로그 — **편집기가 소유**한다.
 *
 * 저장 버튼을 그리는 호스트가 여러 개(지문 분석 모달·국어 보고서 모달·편집기 내부 툴바)라
 * 호스트마다 이 다이얼로그를 복제하면 즉시 드리프트가 생긴다. 호스트는 계약의
 * `requestSaveAs()` 만 부르고, 이름 입력·POST·토스트·에러 표시는 전부 여기서 끝낸다.
 *
 * 사본 저장은 '저장'이 아니라 '복제'다 — 성공해도 원본의 dirty/baseline 은 건드리지 않는다.
 */
export function ReportSaveAsDialog({
  open,
  onOpenChange,
  sourceTitle,
  dirty,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 원본 문서 제목(report.meta.titleKo) — 열릴 때마다 "(사본)" 기본값으로 재계산. */
  sourceTitle: string;
  /** 원본에 미저장 편집이 있는지 — 안내 문구만 바꾼다(동작은 동일: 지금 화면 그대로 복제). */
  dirty: boolean;
  /** 사본 저장 진행 중. */
  saving: boolean;
  /** 성공하면 null, 실패하면 사용자에게 보여줄 한국어 메시지를 돌려준다. */
  onSubmit: (title: string) => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent
        // no-print: report-styles 의 인쇄 규칙(.no-print 강제 숨김)에 편승.
        // z-[95]: 편집기 내부 레이어(z-[80]/z-[90])와 호스트 모달(z-50)보다 위.
        className="no-print z-[95] sm:max-w-md"
        // 호스트 모달들이 window keydown 으로 Escape 를 잡아 '미저장 닫기 가드'를 띄운다.
        // 여기서 끊지 않으면 이름 입력만 닫으려던 Esc 가 모달까지 닫으려 한다.
        // (Radix 의 Esc 처리는 document 리스너라 그대로 살아 있다 — 다이얼로그는 정상적으로 닫힌다.)
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
        // 기본 포커스를 제목 입력으로 옮기고 전체 선택 — 곧바로 새 이름을 덮어쓸 수 있게.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          el.select();
        }}
      >
        {/* 폼 상태(제목·에러)는 내부 컴포넌트가 들고 있다. 닫히면 Radix 가 통째로 언마운트하므로
            다음에 열 때 최신 제목 기준 "(사본)" 기본값으로 자연히 초기화된다(초기화 effect 불필요). */}
        <SaveAsForm
          inputRef={inputRef}
          sourceTitle={sourceTitle}
          dirty={dirty}
          saving={saving}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SaveAsForm({
  inputRef,
  sourceTitle,
  dirty,
  saving,
  onCancel,
  onSubmit,
  onDone,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  sourceTitle: string;
  dirty: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (title: string) => Promise<string | null>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(() => buildReportSaveAsTitle(sourceTitle));
  const [error, setError] = useState<string | null>(null);

  const trimmed = title.trim();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || saving) return;
    setError(null);
    const message = await onSubmit(trimmed);
    // 실패하면 닫지 않는다 — 입력한 이름을 잃지 않게 그대로 두고 이유만 보여준다.
    if (message) setError(message);
    else onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="text-[15px] font-black text-slate-900">다른 이름으로 저장</DialogTitle>
        <DialogDescription className="text-[12px] leading-relaxed text-slate-500">
          지금 편집 중인 내용을 <span className="font-bold text-slate-700">새 학습지 사본</span>으로 저장합니다. 원본
          학습지는 그대로 유지됩니다.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="report-save-as-title" className="text-[12px] font-bold text-slate-600">
          새 학습지 이름
        </Label>
        <Input
          id="report-save-as-title"
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={saving}
          maxLength={120}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby="report-save-as-hint"
        />
        <p id="report-save-as-hint" className="text-[11px] font-medium leading-relaxed text-slate-400">
          학습지 내용만 복제되며 문제·배포 과제는 복제되지 않습니다.
        </p>
        {dirty ? (
          <p className="text-[11px] font-semibold text-amber-600">
            원본에는 저장하지 않은 편집이 남아 있어요 — 사본에는 지금 화면 그대로 담깁니다.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <SaveButton type="submit" saving={saving} disabled={saving || !trimmed} title="새 학습지 사본으로 저장" />
      </DialogFooter>
    </form>
  );
}
