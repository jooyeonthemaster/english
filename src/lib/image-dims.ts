// data URL(base64) 이미지의 자연 크기(픽셀)를 디코딩 없이 헤더만 파싱해 동기적으로 읽는다.
// 미리보기 페이지네이션(클라이언트)과 내보내기(서버)가 같은 종횡비로 이미지 높이를 계산해
// "이미지가 남은 공간에 안 들어가면 다음 페이지로" 동작을 양쪽에서 일치시키기 위함.
// PNG / JPEG / GIF 지원(그 외/실패 시 null → 호출부가 기본 종횡비로 폴백).

function bytesFromBase64Prefix(b64: string, maxBytes = 65536): Uint8Array {
  // 헤더만 필요하므로 앞부분만 디코딩(대용량 data URL 성능 보호).
  // base64 4글자 = 3바이트. 패딩 경계에 맞춰 자른다.
  const need = Math.ceil((maxBytes / 3) * 4);
  let slice = b64.length > need ? b64.slice(0, need - (need % 4)) : b64;
  // atob 는 잘린 base64 에서 padding 오류를 낼 수 있으니 안전 패딩.
  const rem = slice.length % 4;
  if (rem) slice = slice.slice(0, slice.length - rem);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(slice, "base64"));
  }
  const bin = atob(slice);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ImageDims {
  width: number;
  height: number;
}

export function imageDimsFromDataUrl(dataUrl: string | null | undefined): ImageDims | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp|webp);base64,(.+)$/i);
  if (!m) return null;
  const fmt = m[1].toLowerCase();
  let bytes: Uint8Array;
  try {
    bytes = bytesFromBase64Prefix(m[2]);
  } catch {
    return null;
  }
  if (bytes.length < 24) return null;
  const u16be = (o: number) => (bytes[o] << 8) | bytes[o + 1];
  const u32be = (o: number) =>
    ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const u16le = (o: number) => bytes[o] | (bytes[o + 1] << 8);

  // PNG: 8바이트 시그니처 + IHDR(길이4 'IHDR'4) → 데이터가 offset 16 부터 width(4) height(4) BE.
  if (fmt === "png" && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const w = u32be(16);
    const h = u32be(20);
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }

  // GIF: 'GIF8' + offset6 width(2) height(2) LE.
  if (fmt === "gif" && bytes[0] === 0x47 && bytes[1] === 0x49) {
    const w = u16le(6);
    const h = u16le(8);
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }

  // BMP: 'BM' + offset18 width(4) height(4) LE.
  if (fmt === "bmp" && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const w = bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24);
    const h = bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24);
    if (w > 0 && h > 0) return { width: Math.abs(w), height: Math.abs(h) };
    return null;
  }

  // WebP: 'RIFF'....'WEBP' 컨테이너. VP8 (손실)/VP8L(무손실)/VP8X(확장) 청크별로 크기 위치가 다르다.
  if (
    fmt === "webp" &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourcc === "VP8 ") {
      const w = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const h = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (fourcc === "VP8L") {
      // 0x2f 시그니처(offset 20) 다음 4바이트에 14비트 width-1, height-1 비트팩.
      const d1 = bytes[21],
        d2 = bytes[22],
        d3 = bytes[23],
        d4 = bytes[24];
      const w = 1 + (((d2 & 0x3f) << 8) | d1);
      const h = 1 + (((d4 & 0x0f) << 10) | (d3 << 2) | ((d2 & 0xc0) >> 6));
      if (w > 0 && h > 0) return { width: w, height: h };
    } else if (fourcc === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    return null;
  }

  // JPEG: 0xFFD8 로 시작. SOF0~SOFn(0xC0..0xCF, 단 C4/C8/CC 제외) 마커에서 height(2) width(2) BE.
  if ((fmt === "jpg" || fmt === "jpeg") && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    const n = bytes.length;
    while (o + 9 < n) {
      if (bytes[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = bytes[o + 1];
      if (marker === 0xff) {
        o++;
        continue;
      }
      // SOF 마커 집합(베이스라인/프로그레시브 등) — 크기를 담고 있다.
      const isSOF =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      const segLen = u16be(o + 2);
      if (isSOF) {
        const h = u16be(o + 5);
        const w = u16be(o + 7);
        if (w > 0 && h > 0) return { width: w, height: h };
        return null;
      }
      if (segLen < 2) return null;
      o += 2 + segLen;
    }
    return null;
  }

  return null;
}

// 이미지 종횡비(height/width). 미상이면 null.
export function imageAspectFromDataUrl(dataUrl: string | null | undefined): number | null {
  const d = imageDimsFromDataUrl(dataUrl);
  if (!d || d.width <= 0) return null;
  return d.height / d.width;
}

// 기본 종횡비(미상 이미지 폴백) — 기존 DOCX 가정(width*0.68)과 동일하게 유지.
export const DEFAULT_IMAGE_ASPECT = 0.68;
