"use client";

// ============================================================================
// 학생 시험 리포트 — 리포트 에디터 상태 훅 (report-editor 의 상태·커밋 코어)
//
// 로컬 문서/버전 상태 + 2s 디바운스 저장(version CAS, envelope current 저장) +
// 롤백 + 재생성 + 진행 폴링. UI(툴바·패널·상태 분기 렌더)는 report-editor 담당.
// report-editor.tsx 의 500줄 상한을 지키기 위해 상태 로직을 이 훅으로 분리했다
// (순수 이관 — 동작 불변). 재생성 진행 중(GENERATING) 저장 거부만 신규 처리.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import type { ExamStudentDetail } from "../ui-contracts";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";
import {
  updateStudentReportDoc,
  rollbackStudentReport,
} from "@/actions/exam-report";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import type { PreviewDevice } from "./device-preview-toggle";

export type SaveState = "saved" | "dirty" | "saving" | "conflict";

const studentUrl = (id: string) => `/api/exam-report/students/${id}`;

interface UseReportEditorStateArgs {
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
}

export interface ReportEditorState {
  doc: StudentReportDoc | null;
  saveState: SaveState;
  device: PreviewDevice;
  setDevice: (device: PreviewDevice) => void;
  regenerating: boolean;
  handleDocChange: (next: StudentReportDoc) => void;
  handleRollback: () => Promise<void>;
  handleRegenerate: () => Promise<void>;
}

export function useReportEditorState({
  student,
  onStudentChange,
}: UseReportEditorStateArgs): ReportEditorState {
  const pathname = usePathname();
  const creditsHref = `${pathname?.startsWith("/teacher") ? "/teacher" : "/director"}/credits`;

  // 최신 student 참조(저장 후 병합용).
  const studentRef = useRef(student);
  useEffect(() => {
    studentRef.current = student;
  }, [student]);

  // ── 로컬 문서/버전 상태 ────────────────────────────────────────────────────
  const [doc, setDoc] = useState<StudentReportDoc | null>(student.report);
  const [version, setVersion] = useState(student.version);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [device, setDevice] = useState<PreviewDevice>("pc");
  const [regenerating, setRegenerating] = useState(false);

  const docRef = useRef<StudentReportDoc | null>(doc);
  const versionRef = useRef(version);
  const savingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentIdRef = useRef(student.id);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // 학생 전환(id 변경) 시 재시드 / 같은 학생에서 뒤늦게 report 가 채워지면 채택.
  useEffect(() => {
    if (studentIdRef.current !== student.id) {
      studentIdRef.current = student.id;
      setDoc(student.report);
      setVersion(student.version);
      versionRef.current = student.version;
      setSaveState("saved");
      return;
    }
    if (docRef.current == null && student.report != null) {
      setDoc(student.report);
      setVersion(student.version);
      versionRef.current = student.version;
      setSaveState("saved");
    }
  }, [student]);

  const reseedFrom = useCallback((next: ExamStudentDetail) => {
    setDoc(next.report);
    setVersion(next.version);
    versionRef.current = next.version;
    docRef.current = next.report;
    setSaveState("saved");
  }, []);

  // ── 디바운스 저장 ──────────────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (savingRef.current) return;
    const current = docRef.current;
    if (!current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const res = await updateStudentReportDoc(
        studentIdRef.current,
        { current },
        versionRef.current,
      );
      if (res.ok) {
        const nv = versionRef.current + 1;
        versionRef.current = nv;
        setVersion(nv);
        onStudentChange({ ...studentRef.current, report: current, version: nv });
        setSaveState(docRef.current === current ? "saved" : "dirty");
      } else if (res.error === "VERSION_CONFLICT") {
        setSaveState("conflict");
        toast.error("다른 곳에서 수정되었습니다. 새로고침 해주세요");
      } else if (res.error === "GENERATING") {
        // 재생성 진행 중 — 편집 저장 보류(폴링 완료 후 재시드로 정리). 에러 토스트 생략.
        setSaveState("dirty");
      } else {
        setSaveState("dirty");
        toast.error("저장에 실패했습니다.");
      }
    } catch {
      setSaveState("dirty");
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      savingRef.current = false;
      // 저장 중 변경이 있었으면 한 번 더.
      if (docRef.current !== current && saveTimer.current == null) {
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          void flushSave();
        }, 600);
      }
    }
  }, [onStudentChange]);

  const scheduleSave = useCallback(
    (next: StudentReportDoc) => {
      docRef.current = next;
      setSaveState("dirty");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void flushSave();
      }, 2000);
    },
    [flushSave],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const handleDocChange = useCallback(
    (next: StudentReportDoc) => {
      setDoc(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  // ── 롤백 ──────────────────────────────────────────────────────────────────
  const refetchStudent = useCallback(async () => {
    try {
      const res = await fetch(studentUrl(studentIdRef.current), {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { student: ExamStudentDetail };
      onStudentChange(data.student);
      reseedFrom(data.student);
    } catch {
      /* 조용히 무시 — 다음 상호작용에서 재시도 */
    }
  }, [onStudentChange, reseedFrom]);

  const handleRollback = useCallback(async () => {
    const res = await rollbackStudentReport(
      studentIdRef.current,
      versionRef.current,
    );
    if (res.ok) {
      await refetchStudent();
      toast.success("이전 버전으로 되돌렸어요");
    } else if (res.error === "VERSION_CONFLICT") {
      toast.error("다른 곳에서 수정되었습니다. 새로고침 해주세요");
    } else {
      toast.error("되돌릴 이전 버전이 없습니다.");
    }
  }, [refetchStudent]);

  // ── 재생성 ────────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`${studentUrl(studentIdRef.current)}/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 402) {
        toast.error("크레딧이 부족합니다", {
          action: {
            label: "크레딧 관리",
            onClick: () => {
              window.location.href = creditsHref;
            },
          },
        });
        setRegenerating(false);
        return;
      }
      if (!res.ok) {
        toast.error("리포트 재생성을 시작하지 못했습니다.");
        setRegenerating(false);
        return;
      }
      // 이후 완료 감지는 아래 폴링 effect 가 담당.
    } catch {
      toast.error("리포트 재생성 중 오류가 발생했습니다.");
      setRegenerating(false);
    }
  }, [regenerating, creditsHref]);

  // 재생성 진행 폴링.
  useEffect(() => {
    if (!regenerating) return;
    return startAdaptivePoll({
      activeMs: 4000,
      idleMs: 4000,
      run: async (signal) => {
        try {
          const res = await fetch(studentUrl(studentIdRef.current), {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { student: ExamStudentDetail };
          if (signal.aborted) return null;
          const st = data.student.reportStatus;
          if (st === "GENERATED") {
            onStudentChange(data.student);
            reseedFrom(data.student);
            setRegenerating(false);
            toast.success("리포트를 다시 생성했어요");
            return "done";
          }
          if (st === "FAILED") {
            onStudentChange(data.student);
            setRegenerating(false);
            toast.error("리포트 재생성에 실패했습니다. 크레딧은 환불됩니다.");
            return "failed";
          }
          return `gen:${Date.now()}`;
        } catch {
          return null;
        }
      },
    });
  }, [regenerating, onStudentChange, reseedFrom]);

  // 상위 GENERATING(방어적) 폴링 — 셸이 리포트 탭을 GENERATED 에서만 열지만,
  // 직접 진입/전환 대비.
  useEffect(() => {
    if (student.reportStatus !== "GENERATING" || regenerating) return;
    return startAdaptivePoll({
      activeMs: 5000,
      idleMs: 5000,
      run: async (signal) => {
        try {
          const res = await fetch(studentUrl(studentIdRef.current), {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { student: ExamStudentDetail };
          if (signal.aborted) return null;
          if (data.student.reportStatus !== "GENERATING") {
            onStudentChange(data.student);
            reseedFrom(data.student);
            return "settled";
          }
          return `wait:${Date.now()}`;
        } catch {
          return null;
        }
      },
    });
  }, [student.reportStatus, regenerating, onStudentChange, reseedFrom]);

  return {
    doc,
    saveState,
    device,
    setDevice,
    regenerating,
    handleDocChange,
    handleRollback,
    handleRegenerate,
  };
}
