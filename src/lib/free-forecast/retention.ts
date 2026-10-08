import "server-only";

// 무료 적중 예측 팩 버킷 자동 정리 — 사람 손 없이 약속을 지킨다(api/cron/free-forecast-purge 가 매일 부른다).
//   ① 접수된 신청(request.json 있음): 보관 기한(ffPurgeDueAt — 접수 6개월)이 지났으면 폴더째 지운다.
//      동의문 「이메일과 올린 파일은 … 접수 6개월 뒤 모두 지웁니다」.
//   ② 접수 안 한 폴더(request.json 없음): 가장 새 파일이 FF_ORPHAN_DAYS(7일) 넘었으면 지운다.
//      업로드 칸 아래 안내 「접수하지 않은 파일은 7일 뒤 자동으로 지웁니다」.
//      「가장 새 파일」 기준인 이유: 탭을 열어 둔 채 며칠에 걸쳐 올리는 사람의 앞 파일을 지우지 않게(신청 번호는 그 탭 메모리에만 산다).
// 모르면 지우지 않는다: 목록 실패·시각 없음은 그 폴더를 건너뛰고 다음 날 다시 본다.
// 접수 시각은 request.json 의 저장 시각(목록의 created_at)으로 본다 — 덮어쓰지 않는 파일(upsert:false)이라 신청서의
// createdAt 과 밀리초 차이다. 시각이 비면 신청서를 내려받아 createdAt 을 읽는다.

import {
  FF_REQUEST_FILE,
  FF_RETENTION_DAYS,
  ensureFfBucket,
  ffBucket,
  ffListLevel,
  ffMapLimit,
  ffPurgeDueAt,
  isFfSubmitted,
  listFfFolderFiles,
  listFfRequestIds,
  readFfRequest,
  removeFfPaths,
  type FfStoredFile,
} from "./storage";

export const FF_ORPHAN_DAYS = 7;
const DAY_MS = 86_400_000;
/** 동시에 보는 폴더 수 — 폴더 하나는 목록 1~4번 */
const CONCURRENCY = 6;
const LAST_RUN_PATH = "_ops/purge-last-run.json";

export interface FfSweepResult {
  ok: true;
  mode: "run" | "dry";
  startedAt: string;
  durationMs: number;
  retentionDays: number;
  orphanDays: number;
  /** 버킷의 신청 폴더 수 · 이번에 본 수 */
  folders: number;
  scanned: number;
  /** 시간 예산을 넘겨 다 못 봤다 — 순서를 매번 섞으므로 다음 실행들이 나머지를 본다 */
  truncated: boolean;
  /** ① 기한 지난 접수 신청(dry 면 지울 대상) · 그 파일 수 */
  purged: number;
  purgedObjects: number;
  /** ② 접수 안 한 오래된 폴더 · 그 파일 수 */
  orphans: number;
  orphanObjects: number;
  /** 기한 전 접수 신청 · 아직 7일 안 된 미접수 폴더 */
  keptSubmitted: number;
  keptPending: number;
  /** 올린 시각을 몰라 건너뜀 · 목록·삭제 실패로 건너뜀(다음 실행이 다시 본다) */
  skippedUnknownAge: number;
  failed: number;
}

// 갈래마다 따로 둔다 — kind 를 「"a" | "b"」 묶음으로 두면 else-if 로 하나씩 뺀 뒤에도 TS 가 좁히지 못해 v.files 가 오류였다
type Verdict =
  | { kind: "purge"; files: FfStoredFile[] }
  | { kind: "orphan"; files: FfStoredFile[] }
  | { kind: "keepSubmitted" }
  | { kind: "keepPending" }
  | { kind: "unknownAge" };

/** 폴더 하나 판정 — 지울지, 왜 남기는지 */
async function judge(requestId: string, now: number): Promise<Verdict> {
  const top = await ffListLevel(requestId);
  const req = top.find((o) => o.id && o.name === FF_REQUEST_FILE);
  if (req) {
    const at = req.created_at ?? (await readFfRequest(requestId))?.createdAt;
    const due = at ? ffPurgeDueAt(at).getTime() : NaN;
    if (!Number.isFinite(due)) return { kind: "unknownAge" };
    if (due > now) return { kind: "keepSubmitted" };
    return { kind: "purge", files: await listFfFolderFiles(requestId, top) };
  }
  const files = await listFfFolderFiles(requestId, top);
  if (files.length === 0) return { kind: "keepPending" };
  if (files.some((f) => f.createdAt === null)) return { kind: "unknownAge" };
  const newest = Math.max(...files.map((f) => f.createdAt as number));
  return newest + FF_ORPHAN_DAYS * DAY_MS > now ? { kind: "keepPending" } : { kind: "orphan", files };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 버킷 전체를 훑어 ①·② 를 집행한다. dry 면 세기만 한다. deadline(ms) 이 지나면 새 폴더를 잡지 않는다. */
export async function sweepFfBucket({ dry, deadline }: { dry: boolean; deadline: number }): Promise<FfSweepResult> {
  const started = Date.now();
  const r: FfSweepResult = {
    ok: true,
    mode: dry ? "dry" : "run",
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    retentionDays: FF_RETENTION_DAYS,
    orphanDays: FF_ORPHAN_DAYS,
    folders: 0,
    scanned: 0,
    truncated: false,
    purged: 0,
    purgedObjects: 0,
    orphans: 0,
    orphanObjects: 0,
    keptSubmitted: 0,
    keptPending: 0,
    skippedUnknownAge: 0,
    failed: 0,
  };
  // 첫 업로드 전 배포에서도 「버킷 없음」 오류로 매일 실패하지 않게(멱등)
  await ensureFfBucket();
  // 매번 순서를 섞는다 — 하루 예산에 다 못 봐도 같은 앞쪽만 보다 끝나지 않게
  const ids = shuffle(await listFfRequestIds());
  r.folders = ids.length;

  await ffMapLimit(ids, CONCURRENCY, async (id) => {
    if (Date.now() > deadline) {
      r.truncated = true;
      return;
    }
    r.scanned += 1;
    try {
      const v = await judge(id, started);
      if (v.kind === "keepSubmitted") r.keptSubmitted += 1;
      else if (v.kind === "keepPending") r.keptPending += 1;
      else if (v.kind === "unknownAge") r.skippedUnknownAge += 1;
      // 판정과 삭제 사이에 접수됐으면(탭을 7일 넘게 열어 둔 사람이 지금 막 냄) 그 신청의 파일을 지우지 않는다
      else if (v.kind === "orphan" && !dry && (await isFfSubmitted(id))) r.keptSubmitted += 1;
      else {
        const n = dry ? v.files.length : await removeFfPaths(v.files.map((f) => f.path));
        if (v.kind === "purge") {
          r.purged += 1;
          r.purgedObjects += n;
        } else {
          r.orphans += 1;
          r.orphanObjects += n;
        }
      }
    } catch (err) {
      r.failed += 1;
      // 신청 번호만 남긴다(이메일 등 신청서 내용은 로그에 싣지 않는다)
      console.error(`[free-forecast-purge] ${id}`, err instanceof Error ? err.message : err);
    }
  });

  r.durationMs = Date.now() - started;
  return r;
}

/** 마지막 실행 기록 — 관리자 화면이 읽는다(「매일 조용히 401」과 「매일 0건」을 구분하려고). 실패는 결과를 바꾸지 않는다. */
export async function writeFfSweepRecord(r: FfSweepResult): Promise<void> {
  const body = new Blob([JSON.stringify(r)], { type: "application/json" });
  const { error } = await ffBucket().upload(LAST_RUN_PATH, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`실행 기록 저장 실패: ${error.message}`);
}

export async function readFfSweepRecord(): Promise<FfSweepResult | null> {
  const { data } = await ffBucket().download(LAST_RUN_PATH);
  if (!data) return null;
  try {
    const r = JSON.parse(await data.text()) as FfSweepResult;
    return typeof r?.startedAt === "string" ? r : null;
  } catch {
    return null;
  }
}
