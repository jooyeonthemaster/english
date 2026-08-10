# 파일럿: 기존 시험지 PDF에서 29(어법)·30(어휘)·41-42 문항의 밑줄 단어를 추출할 수 있는가?
# 성공하면 이 방식으로 평가원/학평 전체를 긁어 정확한 정답 원장을 만든다.
import re, sys, json
import fitz  # pymupdf

PDF = sys.argv[1] if len(sys.argv) > 1 else "experiments/question-quality-20260715/db-audit/mp6-eng.pdf"

doc = fitz.open(PDF)
print(f"파일: {PDF} | 페이지 {len(doc)}")

# 전체 텍스트 (레이아웃 유지 시도)
pages = [p.get_text("text") for p in doc]
full = "\n".join(pages)
print(f"추출 문자수: {len(full)}")

MARKERS = "①②③④⑤"
print(f"원형숫자 마커 등장: {sum(full.count(m) for m in MARKERS)}회")

# 문항 경계로 분할 — 줄 시작의 "29." 같은 패턴
def slice_question(text, qnum):
    # qnum 으로 시작하는 지점부터 다음 문항 번호 전까지
    m = re.search(rf"(?m)^\s*{qnum}\s*[.．]\s", text)
    if not m:
        m = re.search(rf"{qnum}\s*[.．]\s*다음", text)
    if not m:
        return None
    start = m.start()
    nxt = re.search(rf"(?m)^\s*{qnum+1}\s*[.．]\s", text[start+10:])
    end = start + 10 + nxt.start() if nxt else min(len(text), start + 3000)
    return text[start:end]

for q in (29, 30, 42):
    seg = slice_question(full, q)
    if not seg:
        print(f"\n[{q}번] 구간 미탐")
        continue
    # 마커 뒤에 붙은 단어 추출
    found = re.findall(r"([①-⑤])\s*([A-Za-z][A-Za-z'’\-]*(?:\s+[a-z][A-Za-z'’\-]*){0,3})", seg)
    print(f"\n[{q}번] 구간 {len(seg)}자 | 마커-단어 {len(found)}개")
    for mk, w in found:
        print(f"    {mk} {w.strip()}")
    if not found:
        print("    (마커-단어 매칭 실패) 앞 300자:")
        print("   ", seg[:300].replace("\n", " "))
