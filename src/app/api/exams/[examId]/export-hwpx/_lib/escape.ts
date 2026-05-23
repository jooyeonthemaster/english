/** XML 텍스트 노드/속성 값 이스케이프. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 한컴 HWPX 텍스트는 일부 제어문자를 허용하지 않음.
 * XML 1.0 합법 문자만 남기고 제거. (탭/줄바꿈은 별도 처리 위해 보존)
 */
export function sanitizeXmlText(value: string): string {
  // U+0000~U+0008, U+000B, U+000C, U+000E~U+001F, U+FFFE, U+FFFF 제거.
  return value.replace(
    /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,
    "",
  );
}

/** 한 줄 내부 텍스트 → XML escape + sanitize. */
export function xmlText(value: string): string {
  return escapeXml(sanitizeXmlText(value));
}
