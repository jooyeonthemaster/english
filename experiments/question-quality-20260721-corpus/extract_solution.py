# 해설지(EBSi hsj) PDF 에서 특정 문항의 해설 텍스트를 뽑아 정답 단어를 확정한다.
# 사용: python extract_solution.py <examId> <qNum>
import os, re, sys, glob, json
import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
SOLDIR = os.path.join(HERE, "pdfs_ebsi")

def find_sol(exam_id):
    pats = [os.path.join(SOLDIR, f"{exam_id}_sol_*.pdf")]
    for p in pats:
        hits = glob.glob(p)
        if hits:
            return hits[0]
    return None

def sol_text(path):
    doc = fitz.open(path)
    return "\n".join(p.get_text("text") for p in doc)

def slice_q(text, qnum):
    """해설지에서 해당 문항 구간 추출. 해설지는 '29 정답 ④' 또는 '29. ' 형태."""
    pats = [
        rf"(?m)^\s*{qnum}\s*[.．]\s",
        rf"(?m)^\s*{qnum}\s+정답",
        rf"{qnum}\s*번?\s*정답",
    ]
    start = None
    for p in pats:
        m = re.search(p, text)
        if m:
            start = m.start()
            break
    if start is None:
        return None
    nxt = None
    for p in (rf"(?m)^\s*{qnum+1}\s*[.．]\s", rf"(?m)^\s*{qnum+1}\s+정답"):
        m = re.search(p, text[start + 20:])
        if m:
            nxt = start + 20 + m.start()
            break
    return text[start: nxt if nxt else min(len(text), start + 2500)]

if __name__ == "__main__":
    exam, q = sys.argv[1], int(sys.argv[2])
    p = find_sol(exam)
    if not p:
        print(f"해설지 없음: {exam}")
        sys.exit(1)
    seg = slice_q(sol_text(p), q)
    print(f"--- {exam} q{q} ({os.path.basename(p)}) ---")
    print(re.sub(r"\n{2,}", "\n", seg or "(구간 미탐)")[:1800])
