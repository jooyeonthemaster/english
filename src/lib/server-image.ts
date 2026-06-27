import sharp from "sharp";

// Word(DOCX)·docx 라이브러리는 webp 등 일부 포맷의 이미지를 임베드하지 못한다(png/jpg/gif/bmp만).
// 미리보기(브라우저)는 webp 를 그대로 보여주지만 다운로드에선 빠지므로, 내보내기 전에
// 호환 불가 포맷의 data URL 을 PNG data URL 로 변환한다(서버 전용 — sharp 사용).
export async function toEmbeddableImageDataUrl(
  dataUrl: string | null | undefined,
): Promise<string | null> {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return dataUrl;
  const fmt = m[1].toLowerCase();
  if (fmt === "png" || fmt === "jpeg" || fmt === "jpg" || fmt === "gif" || fmt === "bmp") {
    return dataUrl;
  }
  try {
    const buf = Buffer.from(m[2], "base64");
    const png = await sharp(buf).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // 변환 실패 시 원본 유지(빌더가 대체 텍스트로 처리한다).
    return dataUrl;
  }
}
