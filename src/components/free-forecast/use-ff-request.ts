"use client";

// 무료 신청서 상태 — 칸별 파일(서명 URL 로 바로 올리며 진행률 표시)·기출 DB 선택·신청자 정보·접수.
// ✕ 로 뺀 파일은 버킷에서도 지운다(api/free-forecast/remove — 접수 전에만). 놓친 것은 접수 때 서버가, 접수 안 하면 7일 정리가 지운다.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FF_EMAIL_RE,
  FF_EXT_TYPES,
  FF_MAX_FILE_BYTES,
  FF_MAX_FILES_PER_SLOT,
  FF_SLOT_KEYS,
  FF_SLOTS,
  ffExt,
  type FfGichulPick,
  type FfSlotKey,
  type FfUploadedFile,
} from "@/lib/free-forecast/constants";

export interface FfFileItem {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  progress: number;
  path?: string;
  error?: string;
}

/** 신청서는 이메일 하나(+ 동의, 봇 덫)만 */
export interface FfInfo {
  email: string;
  agree: boolean;
  website: string;
}

/** 막힌 곳 — 신청서·하단 막대가 같은 목록을 쓴다(검사가 갈라지면 한쪽만 400 을 받는다) */
export type FfBlocker = { kind: "slot"; slot: FfSlotKey; label: string } | { kind: "email"; label: string } | { kind: "agree"; label: string };

/** 화면 알림 한 줄(올림·거부·실패) — 토스트와 화면 낭독기 알림에 같이 쓴다 */
export interface FfNotice {
  id: number;
  text: string;
  tone: "ok" | "error";
}

/** 칸 상태 요약 — 카드·하단 막대 공용 */
export interface FfSlotStat {
  done: number;
  uploading: number;
  failed: number;
  /** 올리는 중인 파일들의 평균 진행률(0~1) */
  progress: number;
  /** 기출 DB 에서 고른 지문 수 */
  picked: number;
  ready: boolean;
}

const slotNo = (k: FfSlotKey) => FF_SLOTS.find((s) => s.key === k)?.no ?? 0;

const emptySlots = <T,>(make: () => T) => Object.fromEntries(FF_SLOT_KEYS.map((k) => [k, make()])) as Record<FfSlotKey, T>;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // 오래된 브라우저 — v4 모양만 맞춘다
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void, onStart: (xhr: XMLHttpRequest) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`업로드에 실패했습니다(${xhr.status})`)));
    xhr.onerror = () => reject(new Error("연결이 끊겼습니다"));
    // ✕ 로 뺀 파일 — 이것이 없으면 abort 뒤 약속이 영영 안 끝나 동시 3개 올리기 줄 하나가 멈춘다
    xhr.onabort = () => reject(new Error("취소"));
    onStart(xhr);
    xhr.send(file);
  });
}

/** 사용자에게 보일 실패 문구 — fetch 의 「Failed to fetch」(TypeError) 같은 영어 원문을 합쇼체로 */
function failText(err: unknown, fallback: string): string {
  if (err instanceof TypeError) return "연결이 끊겼습니다";
  return err instanceof Error && err.message ? err.message : fallback;
}

/** 오류 알림이 떠 있는 시간(ms) — 이 동안 들어온 보통 알림은 기다린다. 표시 시간도 이 값(free-forecast-landing.tsx) */
export const FF_ERROR_NOTICE_MS = 6000;

/** 접수 전에 뺀 파일을 버킷에서 지운다. 실패해도 그만 — 접수하면 서버가 신청서에 없는 파일을 지우고, 접수 안 하면 7일 정리가 지운다. */
function discardUploaded(requestId: string, path: string) {
  void fetch("/api/free-forecast/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, path }),
    keepalive: true,
  }).catch(() => {});
}

export function useFfRequest() {
  const requestId = useRef<string | null>(null);
  const [files, setFiles] = useState<Record<FfSlotKey, FfFileItem[]>>(() => emptySlots(() => []));
  const [picks, setPicks] = useState<Record<FfSlotKey, FfGichulPick[]>>(() => emptySlots(() => []));
  const [info, setInfo] = useState<FfInfo>({ email: "", agree: false, website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<FfNotice | null>(null);
  const noticeSeq = useRef(0);
  const errUntil = useRef(0);
  const pendingOk = useRef<number | null>(null);
  // 이메일 형식 안내는 「확인할 때」(칸을 떠날 때·접수를 시도할 때)부터 — 첫 글자부터 빨강이면 입력 중인 사람에게 틀렸다고 먼저 말한다(3차 R3-03)
  const [emailChecked, setEmailChecked] = useState(false);
  const checkEmail = useCallback(() => setEmailChecked(true), []);
  // ✕ 로 뺀 항목 — 올리는 중·차례 기다리는 중에 빠진 것도 끝까지 따라가 버킷에 남기지 않는다
  const removedIds = useRef(new Set<string>());
  const xhrs = useRef(new Map<string, XMLHttpRequest>());

  const rid = () => (requestId.current ??= newId());
  const push = useCallback((text: string, tone: FfNotice["tone"]) => {
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, text, tone });
  }, []);
  /** 알림 — 우선순위는 여기서 정한다(그린 뒤 효과에서 정하면 한 틱에 함께 온 오류가 「올렸습니다」에 덮여 사라졌다 — 3차 R3-02).
   *  error: 바로 띄우고 6초 동안 보통 알림을 막는다 · action(사용자가 방금 누른 동작의 안내): 바로 띄우고 오류 창을 끝낸다
   *  · auto(저절로 생긴 보통 알림): 오류 창 안이면 마지막 하나만 기다렸다가 창이 끝나면 띄운다 */
  const notify = useCallback(
    (text: string, tone: FfNotice["tone"], kind: "auto" | "action" = "auto") => {
      const now = Date.now();
      if (pendingOk.current !== null && (tone === "error" || kind === "action")) {
        window.clearTimeout(pendingOk.current);
        pendingOk.current = null;
      }
      if (tone === "error") {
        errUntil.current = now + FF_ERROR_NOTICE_MS;
        return push(text, tone);
      }
      if (kind === "action") {
        errUntil.current = 0;
        return push(text, tone);
      }
      if (now < errUntil.current) {
        if (pendingOk.current !== null) window.clearTimeout(pendingOk.current);
        pendingOk.current = window.setTimeout(() => {
          pendingOk.current = null;
          push(text, tone);
        }, errUntil.current - now);
        return;
      }
      push(text, tone);
    },
    [push],
  );
  useEffect(
    () => () => {
      if (pendingOk.current !== null) window.clearTimeout(pendingOk.current);
    },
    [],
  );

  const patch = useCallback((slot: FfSlotKey, id: string, p: Partial<FfFileItem>) => {
    setFiles((prev) => ({ ...prev, [slot]: prev[slot].map((f) => (f.id === id ? { ...f, ...p } : f)) }));
  }, []);

  /** 한 파일 올리기 — 결과만 돌려주고 알리지 않는다(알림은 묶음 addFiles 가 성공·실패를 한 줄로 낸다) */
  const uploadOne = useCallback(
    async (slot: FfSlotKey, item: FfFileItem, file: File): Promise<"ok" | "fail" | "gone"> => {
      const gone = () => removedIds.current.has(item.id);
      // 차례를 기다리는 사이 빠졌으면 아예 올리지 않는다
      if (gone()) return "gone";
      let path: string | undefined;
      try {
        const res = await fetch("/api/free-forecast/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: rid(), slot, name: file.name, size: file.size }),
        });
        const j = await res.json().catch(() => ({ ok: false, error: "업로드를 준비하지 못했습니다" }));
        if (!j.ok) throw new Error(j.error || "업로드를 준비하지 못했습니다");
        // 서명만 받고 아직 안 올렸다 — 지울 것이 없다
        if (gone()) return "gone";
        path = j.path as string;
        await putWithProgress(j.uploadUrl, file, j.contentType, (p) => patch(slot, item.id, { progress: p }), (xhr) => xhrs.current.set(item.id, xhr));
        // 다 올라간 뒤에 빠졌으면(✕ 와 완료가 엇갈림) 올라간 것을 지운다
        if (gone()) {
          discardUploaded(rid(), path);
          return "gone";
        }
        patch(slot, item.id, { status: "done", progress: 1, path });
        return "ok";
      } catch (err) {
        // 올리는 중에 빠진 것 — 알리지 않는다. 끊기 직전에 저장소에 닿았을 수 있어 지우기도 보낸다(없으면 아무 일 없음)
        if (gone()) {
          if (path) discardUploaded(rid(), path);
          return "gone";
        }
        patch(slot, item.id, { status: "error", error: failText(err, "업로드에 실패했습니다") });
        return "fail";
      } finally {
        xhrs.current.delete(item.id);
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (slot: FfSlotKey, list: FileList | File[]) => {
      const incoming = Array.from(list);
      const room = FF_MAX_FILES_PER_SLOT - files[slot].length;
      const items: { item: FfFileItem; file: File }[] = [];
      for (const file of incoming.slice(0, Math.max(0, room))) {
        const ext = ffExt(file.name);
        const item: FfFileItem = { id: newId(), name: file.name, size: file.size, status: "uploading", progress: 0 };
        if (!FF_EXT_TYPES[ext]) Object.assign(item, { status: "error", error: "받을 수 없는 형식" });
        else if (file.size > FF_MAX_FILE_BYTES) Object.assign(item, { status: "error", error: "50MB 초과 — 나눠서 올려 주세요" });
        else if (file.size === 0) Object.assign(item, { status: "error", error: "빈 파일" });
        items.push({ item, file });
      }
      // 한 번에 넣은 묶음의 문제(개수 초과·받을 수 없는 형식 등)는 오류 알림 한 줄로 — 여러 줄이면 앞의 것이 바로 덮인다
      const rejected = items.filter((x) => x.item.status === "error");
      const over = incoming.length - Math.max(0, room);
      const problems = [
        ...(over > 0 ? [`${FF_MAX_FILES_PER_SLOT}개까지라 ${over}개는 빠졌습니다`] : []),
        ...(rejected.length ? [`${rejected[0].item.name}: ${rejected[0].item.error}${rejected.length > 1 ? ` 외 ${rejected.length - 1}개` : ""}`] : []),
      ];
      if (problems.length) notify(`${slotNo(slot)}번 칸 — ${problems.join(" · ")}`, "error");
      if (!items.length) return;
      setFiles((prev) => ({ ...prev, [slot]: [...prev[slot], ...items.map((x) => x.item)] }));
      // 동시에 3개씩 — 큰 스캔 PDF 여러 개를 한꺼번에 올려도 브라우저가 버티게.
      // 성공 알림은 묶음이 끝난 뒤 한 번(파일마다 내면 오류 알림이 반 초 만에 「올렸습니다」로 덮였다 — 2차 검수)
      const queue = items.filter((x) => x.item.status === "uploading");
      let ok = 0;
      let fail = 0;
      let lastOk = "";
      let lastFail = "";
      const run = async () => {
        for (let x = queue.shift(); x; x = queue.shift()) {
          const r = await uploadOne(slot, x.item, x.file);
          if (r === "ok") {
            ok += 1;
            lastOk = x.file.name;
          } else if (r === "fail") {
            fail += 1;
            lastFail = x.file.name;
          }
        }
      };
      // 묶음이 끝나면 한 줄 — 실패가 하나라도 있으면 오류(몇 개는 올렸는지도 함께), 아니면 성공
      void Promise.all([run(), run(), run()]).then(() => {
        const n = slotNo(slot);
        if (fail) notify(`${n}번 칸 — ${fail === 1 ? `${lastFail}:` : `${fail}개를`} 올리지 못했습니다${ok ? ` · ${ok}개는 올렸습니다` : ""} — ✕로 빼고 다시 올려 주세요`, "error");
        else if (ok) notify(`${n}번 칸 — ${ok === 1 ? lastOk : `${ok}개`} 올렸습니다`, "ok");
      });
    },
    [files, uploadOne, notify],
  );

  /** ✕ — 목록에서는 바로 뺀다. 올라간 파일은 버킷에서도 지우고, 올리는 중이면 끊는다(끊긴 쪽은 uploadOne 이 마무리). */
  const removeFile = useCallback(
    (slot: FfSlotKey, id: string) => {
      const item = files[slot].find((f) => f.id === id);
      removedIds.current.add(id);
      if (item?.status === "done" && item.path) discardUploaded(rid(), item.path);
      else if (item?.status === "uploading") xhrs.current.get(id)?.abort();
      setFiles((prev) => ({ ...prev, [slot]: prev[slot].filter((f) => f.id !== id) }));
    },
    [files],
  );

  const setSlotPicks = useCallback((slot: FfSlotKey, next: FfGichulPick[]) => {
    setPicks((prev) => ({ ...prev, [slot]: next }));
  }, []);

  const uploading = FF_SLOT_KEYS.some((k) => files[k].some((f) => f.status === "uploading"));
  const slotReady = (k: FfSlotKey) => files[k].some((f) => f.status === "done") || picks[k].length > 0;
  const missing = FF_SLOTS.filter((s) => !slotReady(s.key));
  const emailOk = FF_EMAIL_RE.test(info.email.trim());
  const blockers: FfBlocker[] = [
    // 올리는 중인 칸은 「(올리는 중)」 — 「3번 칸」만 쓰면 안 올라간 것으로 읽혀 같은 파일을 또 넣었다(3차 R3-15)
    ...missing.map((m) => ({ kind: "slot" as const, slot: m.key, label: files[m.key].some((f) => f.status === "uploading") ? `${m.no}번 칸(올리는 중)` : `${m.no}번 칸` })),
    // 적었는데 형식이 틀리면 「이메일 형식」 — 「이메일」만 쓰면 안 적은 것으로 읽혔다(2차 검수)
    ...(emailOk ? [] : [{ kind: "email" as const, label: info.email.trim() ? "이메일 형식" : "이메일" }]),
    ...(info.agree ? [] : [{ kind: "agree" as const, label: "동의 체크" }]),
  ];
  const canSubmit = blockers.length === 0 && !uploading && !submitting;
  const stat = (k: FfSlotKey): FfSlotStat => {
    const up = files[k].filter((f) => f.status === "uploading");
    return {
      done: files[k].filter((f) => f.status === "done").length,
      uploading: up.length,
      failed: files[k].filter((f) => f.status === "error").length,
      progress: up.length ? up.reduce((a, f) => a + f.progress, 0) / up.length : 0,
      picked: picks[k].reduce((a, p) => a + p.q.length, 0),
      ready: slotReady(k),
    };
  };

  const submit = useCallback(async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const payloadFiles = emptySlots<FfUploadedFile[]>(() => []);
      for (const k of FF_SLOT_KEYS) {
        payloadFiles[k] = files[k].filter((f) => f.status === "done" && f.path).map((f) => ({ path: f.path as string, name: f.name, size: f.size }));
      }
      const res = await fetch("/api/free-forecast/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: rid(), ...info, email: info.email.trim(), files: payloadFiles, gichul: picks }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "접수하지 못했습니다" }));
      if (!j.ok) throw new Error(j.error || "접수하지 못했습니다");
      setDone(true);
    } catch (err) {
      setSubmitError(failText(err, "접수하지 못했습니다. 잠시 후 다시 눌러 주세요."));
    } finally {
      setSubmitting(false);
    }
  }, [files, info, picks]);

  return {
    files,
    picks,
    info,
    setInfo,
    addFiles,
    removeFile,
    setSlotPicks,
    uploading,
    slotReady,
    stat,
    missing,
    emailOk,
    emailChecked,
    checkEmail,
    blockers,
    canSubmit,
    submit,
    submitting,
    submitError,
    done,
    notice,
    notify,
  };
}

export type FfRequestState = ReturnType<typeof useFfRequest>;
