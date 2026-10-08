import "server-only";

// 무료 적중 예측 팩 신청 — 비공개 Supabase Storage 버킷.
//
// 신청자 파일은 브라우저가 서명 URL 로 직접 올린다(Vercel 본문 4.5MB 상한 우회 — offline-marketing 과 같은 방식).
// 신청서는 DB 행 대신 같은 폴더의 request.json 으로 남긴다(스키마 변경 없이 운영자가 /admin/free-forecast 에서 본다).
//   <requestId>/<slot>/<시각>-<난수>.<확장자>   올린 파일(원래 이름은 request.json 에)
//   <requestId>/request.json                    신청서 — 이 파일이 있으면 「접수됨」
//   _ops/purge-last-run.json                    자동 정리 마지막 실행 기록(retention.ts)
// 보관: 접수 6개월 뒤, 접수하지 않은 폴더는 마지막 업로드 7일 뒤 크론이 지운다(retention.ts · api/cron/free-forecast-purge).
// 서버 전용(service-role key). 클라이언트에서 import 금지.

import { getServiceSupabase } from "@/lib/supabase-storage";
import { FF_EXT_TYPES, FF_MAX_FILE_BYTES, FF_REQUEST_ID_RE, FF_SLOT_KEYS, ffSlotOfPath, type FfGichulPick, type FfSlotKey, type FfUploadedFile } from "./constants";

export const FF_BUCKET = "free-forecast-requests";
export const FF_REQUEST_FILE = "request.json";

export const ffBucket = () => getServiceSupabase().storage.from(FF_BUCKET);

/** list() 한 항목 — 폴더 행은 id·created_at·metadata 가 null */
export interface FfEntry {
  name: string;
  id: string | null;
  created_at: string | null;
  metadata: { size?: number } | null;
}

let ensured = false;

/** 없으면 비공개 버킷 생성(멱등). MIME 은 확장자 허용 목록으로 서버에서 거른다 — HWP 는 브라우저마다 type 이 제각각이라 버킷 MIME 제한을 두지 않는다. */
export async function ensureFfBucket(): Promise<void> {
  if (ensured) return;
  const sb = getServiceSupabase();
  const { data } = await sb.storage.getBucket(FF_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(FF_BUCKET, { public: false, fileSizeLimit: FF_MAX_FILE_BYTES });
    if (error && !/already exists/i.test(error.message)) throw new Error(`버킷 생성 실패: ${error.message}`);
  }
  ensured = true;
}

/** list() 한 쪽 크기 — 저장소 기본값. 이보다 적게 오면 마지막 쪽이다. */
const LIST_PAGE = 100;

/**
 * 한 겹 목록을 끝까지(이름순 쪽 넘김). 실패는 던진다 — 절반만 본 목록으로 「request.json 없음」을 판정하면
 * 접수된 신청을 지울 수 있다. 넘기는 사이 항목이 늘어 겹친 이름은 한 번만 센다.
 */
export async function ffListLevel(prefix: string): Promise<FfEntry[]> {
  const byName = new Map<string, FfEntry>();
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await ffBucket().list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`목록 실패(${prefix || "/"}): ${error.message}`);
    const rows: FfEntry[] = data ?? [];
    const before = byName.size;
    for (const o of rows) byName.set(o.name, o);
    if (rows.length < LIST_PAGE) break;
    if (byName.size === before) throw new Error(`목록 쪽이 넘어가지 않습니다(${prefix || "/"})`);
  }
  return [...byName.values()];
}

/** 동시에 n 개씩 — 폴더 수백 개를 한꺼번에 부르지 않게 */
export async function ffMapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    for (let k = next++; k < items.length; k = next++) out[k] = await fn(items[k]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

export async function createFfUploadTarget(requestId: string, slot: FfSlotKey, ext: string) {
  await ensureFfBucket();
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${requestId}/${slot}/${Date.now()}-${rand}.${ext}`;
  const { data, error } = await ffBucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`서명 업로드 URL 발급 실패: ${error?.message ?? "unknown"}`);
  return { uploadUrl: data.signedUrl, path: data.path, contentType: FF_EXT_TYPES[ext] ?? "application/octet-stream" };
}

/**
 * 신청서가 가리키는 파일이 실제로 올라왔는지 — 칸 폴더 목록과 대조해 크기를 실측값으로 바꾼다.
 * stray: 폴더에는 있는데 신청서가 가리키지 않는 파일(✕ 로 뺐는데 지우기 요청이 닿지 못한 것 등) — 접수 뒤 지운다.
 */
export async function verifyFfFiles(requestId: string, slot: FfSlotKey, files: FfUploadedFile[]): Promise<{ files: FfUploadedFile[]; stray: string[] }> {
  const prefix = `${requestId}/${slot}`;
  const listed = (await ffListLevel(prefix)).filter((o) => o.id);
  const sizes = new Map(listed.map((o) => [o.name, Number(o.metadata?.size ?? 0)]));
  const used = new Set<string>();
  const out: FfUploadedFile[] = [];
  for (const f of files) {
    if (!f.path.startsWith(`${prefix}/`)) continue;
    const name = f.path.slice(prefix.length + 1);
    const size = sizes.get(name);
    if (size === undefined || used.has(name)) continue;
    used.add(name);
    out.push({ path: f.path, name: f.name.slice(0, 200), size });
  }
  return { files: out, stray: listed.filter((o) => !used.has(o.name)).map((o) => `${prefix}/${o.name}`) };
}

export interface FfRequestRecord {
  requestId: string;
  createdAt: string;
  email: string;
  /** 초기 신청서에만 있던 칸(10-08 이메일만 받기로 바꿈) — 옛 기록 표시용 */
  school?: string;
  grade?: string;
  exam?: string;
  memo?: string;
  files: Record<FfSlotKey, FfUploadedFile[]>;
  gichul: Partial<Record<FfSlotKey, FfGichulPick[]>>;
  /** 10-08 이전 기록에만 있다 — 동의문에 없는 항목이라 더는 저장하지 않는다(남용 방지는 메모리의 IP 로). 옛 기록을 읽어도 깨지지 않게 남겨 둔다 */
  ipHash?: string;
  userAgent?: string;
}

/** 신청서 저장. 같은 requestId 로 두 번 내면 false(첫 신청 유지). */
export async function saveFfRequest(rec: FfRequestRecord): Promise<boolean> {
  await ensureFfBucket();
  const body = new Blob([JSON.stringify(rec, null, 1)], { type: "application/json" });
  const { error } = await ffBucket().upload(`${rec.requestId}/${FF_REQUEST_FILE}`, body, { upsert: false, contentType: "application/json" });
  if (error) {
    if (/exists|duplicate/i.test(error.message)) return false;
    throw new Error(`신청서 저장 실패: ${error.message}`);
  }
  return true;
}

/** 신청서 하나 — 없거나 깨졌으면 null. 칸 목록이 빠진 옛 기록도 화면이 깨지지 않게 채운다. */
export async function readFfRequest(requestId: string): Promise<FfRequestRecord | null> {
  const { data } = await ffBucket().download(`${requestId}/${FF_REQUEST_FILE}`);
  if (!data) return null;
  try {
    const rec = JSON.parse(await data.text()) as Partial<FfRequestRecord> | null;
    if (!rec || typeof rec.createdAt !== "string" || typeof rec.email !== "string") return null;
    const files = Object.fromEntries(
      FF_SLOT_KEYS.map((k) => {
        const list = rec.files?.[k];
        return [k, Array.isArray(list) ? list : []];
      }),
    ) as Record<FfSlotKey, FfUploadedFile[]>;
    return { ...rec, requestId, createdAt: rec.createdAt, email: rec.email, files, gichul: rec.gichul && typeof rec.gichul === "object" ? rec.gichul : {} };
  } catch {
    return null;
  }
}

/** 최상위의 신청 폴더 이름(requestId) 전부 — _ops 같은 운영 폴더는 뺀다 */
export async function listFfRequestIds(): Promise<string[]> {
  return (await ffListLevel("")).filter((o) => !o.id && FF_REQUEST_ID_RE.test(o.name)).map((o) => o.name);
}

/** 운영자 화면 — 신청서 전부(접수 최신순). 폴더를 끝까지 넘겨 본다 — 최근 N건만 보면 파기 기한이 지난 옛 신청이 화면에서 빠진다. */
export async function listFfRequests(): Promise<FfRequestRecord[]> {
  await ensureFfBucket();
  const recs = await ffMapLimit(await listFfRequestIds(), 12, readFfRequest);
  return recs.filter((r): r is FfRequestRecord => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 내려받는 파일 이름 — 한글 이름을 넘기면 저장소가 두 번 인코딩해 「%ED%95…」로 저장된다(실측). 영문·숫자만 남기고 칸·순번을 붙인다. */
function asciiDownloadName(f: FfUploadedFile, i: number): string {
  const slot = f.path.split("/")[1] ?? "file";
  const ext = f.path.split(".").pop() ?? "bin";
  const base = f.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 40);
  return `${slot}-${i + 1}${base ? `-${base}` : ""}.${ext}`;
}

/** 운영자 내려받기용 서명 URL(1시간). 화면에는 원래 이름을 보이고, 저장 이름은 영문(asciiDownloadName). */
export async function signFfDownloads(files: FfUploadedFile[]): Promise<Record<string, string>> {
  const sb = ffBucket();
  const out: Record<string, string> = {};
  // 순번은 신청서·칸마다 1부터
  const seq = new Map<string, number>();
  const nth = files.map((f) => {
    const k = f.path.split("/").slice(0, 2).join("/");
    const n = seq.get(k) ?? 0;
    seq.set(k, n + 1);
    return n;
  });
  await ffMapLimit(
    files.map((f, i) => [f, i] as const),
    16,
    async ([f, i]) => {
      const { data } = await sb.createSignedUrl(f.path, 3600, { download: asciiDownloadName(f, nth[i]) });
      if (data?.signedUrl) out[f.path] = data.signedUrl;
    },
  );
  return out;
}

/**
 * 보관 기한(접수 6개월) — 동의문 「접수 6개월 뒤 모두 지웁니다」. 달력 6개월은 181~184일이라 183일로 두고,
 * 매일 도는 크론(api/cron/free-forecast-purge)이 기한 뒤 첫 실행에 지운다 — 달력 6개월과 어긋나도 하루 이르거나 사흘 늦는 데서 그친다
 * (개인정보 보호 표준지침의 「보유기간 경과 후 5일 이내 파기」 안).
 */
export const FF_RETENTION_DAYS = 183;

export function ffPurgeDueAt(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + FF_RETENTION_DAYS * 86400 * 1000);
}

export interface FfStoredFile {
  path: string;
  /** 올린 시각(ms) — 저장소가 주지 않으면 null(= 나이를 모른다) */
  createdAt: number | null;
}

const toMs = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** 신청 폴더 안 파일 전부(칸 폴더 한 겹 아래까지). top 에 이미 읽은 첫 겹을 넘기면 다시 읽지 않는다. */
export async function listFfFolderFiles(requestId: string, top?: FfEntry[]): Promise<FfStoredFile[]> {
  const out: FfStoredFile[] = [];
  for (const o of top ?? (await ffListLevel(requestId))) {
    const p = `${requestId}/${o.name}`;
    if (o.id) {
      out.push({ path: p, createdAt: toMs(o.created_at) });
      continue;
    }
    for (const f of await ffListLevel(p)) if (f.id) out.push({ path: `${p}/${f.name}`, createdAt: toMs(f.created_at) });
  }
  return out;
}

/** 경로 묶음 삭제(100개씩). 실패는 던진다 — 「지웠다」고 기록하기 전에 실패를 알아야 한다. 신청서(request.json)는 맨 나중에
 *  지운다: 중간에 끊겨도 신청이 화면·크론에 남아 다음 실행이 마저 지운다. 실제로 지운 개수를 돌려준다. */
export async function removeFfPaths(paths: string[]): Promise<number> {
  const ordered = [...paths].sort((a, b) => Number(a.endsWith(`/${FF_REQUEST_FILE}`)) - Number(b.endsWith(`/${FF_REQUEST_FILE}`)));
  let removed = 0;
  for (let i = 0; i < ordered.length; i += 100) {
    const { data, error } = await ffBucket().remove(ordered.slice(i, i + 100));
    if (error) throw new Error(`삭제 실패: ${error.message}`);
    removed += data?.length ?? 0;
  }
  return removed;
}

/** 신청 하나를 통째로 지운다(신청서·올린 파일 전부). 되돌릴 수 없다. 지운 개수. */
export async function purgeFfRequest(requestId: string): Promise<number> {
  if (!FF_REQUEST_ID_RE.test(requestId)) throw new Error("잘못된 신청 번호");
  return removeFfPaths((await listFfFolderFiles(requestId)).map((f) => f.path));
}

/** 접수됐나(request.json 있음) — 목록 실패는 던진다(모르면 「접수 안 됨」으로 치지 않는다) */
export async function isFfSubmitted(requestId: string): Promise<boolean> {
  const { data, error } = await ffBucket().list(requestId, { limit: 10, search: FF_REQUEST_FILE });
  if (error) throw new Error(`신청 확인 실패: ${error.message}`);
  return (data ?? []).some((o) => o.id && o.name === FF_REQUEST_FILE);
}

/** 접수 전에 ✕ 로 뺀 파일 하나를 지운다. 이미 접수됐으면 손대지 않는다(접수된 자료를 지우는 것은 6개월 파기·관리자 「파기」뿐). */
export async function removeFfPendingFile(requestId: string, path: string): Promise<"removed" | "submitted"> {
  if (!ffSlotOfPath(requestId, path)) throw new Error("잘못된 경로");
  if (await isFfSubmitted(requestId)) return "submitted";
  await removeFfPaths([path]);
  return "removed";
}
