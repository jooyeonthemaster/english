// 오프라인 홍보물 UI 공용 상수/헬퍼.

/** 바이트 → 사람이 읽는 단위. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** same-origin 프록시 URL(인쇄/미리보기/다운로드). */
export function assetFileUrl(id: string, download = false): string {
  return `/api/admin/offline-marketing/${id}/file${download ? "?download=1" : ""}`;
}
