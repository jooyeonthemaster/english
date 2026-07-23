# HWP 텍스트 추출기 — 5.0(OLE) 정식 파싱 + 3.0(V3.00) 휴리스틱
#
# HWP 5.0: FileHeader 의 압축 플래그 확인 → BodyText/SectionN 을 raw deflate 해제 →
#          레코드 순회(tagID 66=PARA_HEADER, 67=PARA_TEXT) → PARA_TEXT 의 UTF-16LE 추출.
#          제어문자(0~31)는 대부분 인라인 개체 지시자라 규칙대로 스킵한다.
# HWP 3.0: 비공개 구형 포맷. 본문이 비압축인 경우가 있어 EUC-KR/ASCII 런을 긁어낸다.
#          영어 지문 + 원형숫자 마커만 필요하므로 이 정도로 충분하다.
import sys, os, re, zlib, struct

def hwp5_text(path):
    import olefile
    if not olefile.isOleFile(path):
        return ""
    ole = olefile.OleFileIO(path)
    names = ["/".join(s) for s in ole.listdir()]
    if "FileHeader" not in names:
        return ""
    fh = ole.openstream("FileHeader").read()
    compressed = bool(fh[36] & 0x01) if len(fh) > 36 else True

    out = []
    secs = sorted([n for n in names if n.startswith("BodyText/Section")],
                  key=lambda x: int(re.sub(r"\D", "", x) or 0))
    for sec in secs:
        data = ole.openstream(sec).read()
        if compressed:
            try:
                data = zlib.decompress(data, -15)
            except Exception:
                try:
                    data = zlib.decompress(data)
                except Exception:
                    continue
        i, n = 0, len(data)
        while i + 4 <= n:
            header = struct.unpack_from("<I", data, i)[0]
            tag = header & 0x3FF
            size = (header >> 20) & 0xFFF
            i += 4
            if size == 0xFFF:
                if i + 4 > n:
                    break
                size = struct.unpack_from("<I", data, i)[0]
                i += 4
            payload = data[i:i + size]
            i += size
            if tag == 67:  # HWPTAG_PARA_TEXT
                try:
                    s = payload.decode("utf-16-le", "ignore")
                except Exception:
                    continue
                # HWP5 규격: 확장 컨트롤만 8 WCHAR 를 차지한다. 나머지 제어문자는 1 WCHAR.
                # (이전 구현은 0 을 확장으로 오판해 실제 텍스트 7자를 먹었다 —
                #  문항 번호와 ②④ 마커가 사라지던 원인)
                EXTENDED = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}
                buf = []
                j = 0
                while j < len(s):
                    o = ord(s[j])
                    if o in (10, 13):
                        buf.append("\n"); j += 1
                    elif o in EXTENDED:
                        j += 8
                    elif o < 32:
                        j += 1
                    else:
                        buf.append(s[j]); j += 1
                out.append("".join(buf))
        out.append("\n")
    return "\n".join(out)

def hwp3_text(path):
    """HWP 3.0 — 구형. 본문 스트림에서 읽을 수 있는 텍스트 런을 긁는다."""
    raw = open(path, "rb").read()
    # 압축본이면 해제 시도 (헤더 뒤 어딘가에 zlib 스트림)
    cands = [raw]
    for off in range(0, min(len(raw), 4096)):
        if raw[off:off + 2] in (b"\x78\x9c", b"\x78\x01", b"\x78\xda"):
            try:
                cands.append(zlib.decompress(raw[off:]))
                break
            except Exception:
                pass
    best = ""
    for blob in cands:
        # UTF-16LE 런
        try:
            u = blob.decode("utf-16-le", "ignore")
            runs = re.findall(r"[\x20-\x7eㄱ-ㆎ가-힣①-⑳]{6,}", u)
            t = "\n".join(runs)
            if len(t) > len(best):
                best = t
        except Exception:
            pass
        # EUC-KR 런
        try:
            e = blob.decode("cp949", "ignore")
            runs = re.findall(r"[\x20-\x7e가-힣①-⑳]{6,}", e)
            t = "\n".join(runs)
            if len(t) > len(best):
                best = t
        except Exception:
            pass
    return best

def extract(path):
    head = open(path, "rb").read(32)
    if head.startswith(b"HWP Document File V3"):
        return hwp3_text(path), "hwp3"
    return hwp5_text(path), "hwp5"

if __name__ == "__main__":
    for p in sys.argv[1:]:
        t, kind = extract(p)
        eng = len(re.findall(r"[A-Za-z]{3,}", t))
        mk = len(re.findall(r"[①-⑤]", t))
        print(f"{os.path.basename(p)} [{kind}] {len(t):,}자 | 영단어 {eng} | 마커 {mk}")
        if "-v" in sys.argv:
            print(t[:700])
