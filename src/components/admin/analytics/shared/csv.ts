// 표 CSV 내보내기 공용 유틸(§14 D19).
// 표의 셀은 ReactNode 라 값 추출기가 필요하다 — 열마다 csvValue 를 주면 그 값을, 없으면 렌더된 노드의
// 텍스트를 쓴다(그래서 모든 분해표가 별도 작업 없이 CSV 를 얻는다).

import { isValidElement, type ReactNode } from "react";

/** ReactNode 에서 사람이 읽는 텍스트만 뽑는다(아이콘·색점 등 텍스트 없는 노드는 무시). */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode } | null;
    return nodeText(props?.children);
  }
  return "";
}

/** "1,234" → "1234" (엑셀에서 숫자로 읽히도록). 숫자 모양이 아닌 값은 그대로 둔다. */
export function csvNumericText(text: string): string {
  const t = text.trim();
  return /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t;
}

function cell(value: string | number): string {
  const s = typeof value === "number" ? String(value) : csvNumericText(value.replace(/\s+/g, " ").trim());
  // 순수 숫자는 따옴표를 씌우지 않는다 — 엑셀이 문자열 열로 읽어 합계가 안 되는 것을 막는다.
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  // 앞이 = + - @ 면 스프레드시트가 수식으로 해석한다 → 작은따옴표로 무력화(CSV 인젝션 방어).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: Array<string>, rows: Array<Array<string | number>>): string {
  return [header.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
}

/** 파일명에 쓸 수 없는 문자를 걷어낸다. */
export function csvSafeName(part: string): string {
  return part.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").slice(0, 40) || "표";
}

/** UTF-8 BOM 을 붙여 내려받는다(엑셀 한글 깨짐 방지). */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 일부 브라우저는 click 직후 즉시 revoke 하면 저장이 취소된다.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
