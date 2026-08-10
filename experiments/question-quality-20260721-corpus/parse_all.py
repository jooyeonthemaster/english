# 수집한 PDF 전수 파싱 → examId 매핑 → parsed/*.json
#   평가원: pdfs/manifest.json 의 boardSeq + year + siheng → 코퍼스 examId 매칭
#   학평:   pdfs_ebsi/manifest.json 의 examId 그대로 사용
import os, re, sys, json, glob, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_exam_pdf import parse_pdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "d:/Desktop/2026project/nara"
PARSED = os.path.join(HERE, "parsed")
os.makedirs(PARSED, exist_ok=True)

corpus = json.load(open(os.path.join(ROOT, "src/data/exam-passages/passages.json"), encoding="utf-8"))
exam_ids = sorted({c["examId"] for c in corpus})
kice_ids = [e for e in exam_ids if not e.startswith("ebsi_")]
# 2026_SN_5093799 → boardSeq 5093799
by_seq = {}
for e in kice_ids:
    m = re.search(r"_(\d{6,8})$", e)
    if m:
        by_seq[m.group(1)] = e

stats = {"kice_matched": 0, "kice_unmatched": 0, "ebsi_matched": 0, "ebsi_unmatched": 0, "parse_fail": 0}
unmatched = []

# ── 평가원 ──
kman_path = os.path.join(HERE, "pdfs/manifest.json")
if os.path.exists(kman_path):
    kman = json.load(open(kman_path, encoding="utf-8"))
    for m in kman:
        if m["kind"] not in ("paper", "other"):
            continue
        pdf = os.path.join(HERE, "pdfs", m["fileSeq"] + ".pdf")
        if not os.path.exists(pdf):
            continue
        exam = by_seq.get(str(m.get("boardSeq", "")))
        if not exam:
            stats["kice_unmatched"] += 1
            unmatched.append(("kice", m.get("boardSeq"), m.get("year"), m.get("siheng"), m.get("fileName")))
            continue
        out = os.path.join(PARSED, exam + ".json")
        if os.path.exists(out):
            stats["kice_matched"] += 1
            continue
        try:
            res = parse_pdf(pdf, exam)
            res["sourcePdf"] = m["fileSeq"] + ".pdf"
            res["fileName"] = m.get("fileName", "")
            json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            stats["kice_matched"] += 1
        except Exception:
            stats["parse_fail"] += 1

# ── 학평 (manifest 대신 디스크 파일명에서 examId 도출 — manifest 덮어쓰기 내성) ──
for pdf in sorted(glob.glob(os.path.join(HERE, "pdfs_ebsi", "ebsi_go*_paper_*.pdf"))):
    base = os.path.basename(pdf)
    m = re.match(r"(ebsi_go\d_\d{8})_paper_", base)
    if not m:
        continue
    exam = m.group(1)
    if exam not in exam_ids:
        stats["ebsi_unmatched"] += 1
        continue
    out = os.path.join(PARSED, exam + ".json")
    if os.path.exists(out):
        stats["ebsi_matched"] += 1
        continue
    try:
        res = parse_pdf(pdf, exam)
        if not res["questions"]:
            stats["parse_fail"] += 1
            continue
        res["sourcePdf"] = base
        json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        stats["ebsi_matched"] += 1
    except Exception:
        stats["parse_fail"] += 1

print("파싱 결과:", json.dumps(stats, ensure_ascii=False))
have = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(PARSED, "*.json"))}
print(f"파싱된 시험지: {len(have)} / 코퍼스 시험지 {len(exam_ids)}")
missing = [e for e in exam_ids if e not in have]
print(f"미확보 시험지 {len(missing)}개")
for e in missing[:20]:
    print("   ", e)
json.dump({"missing": missing, "unmatched": unmatched[:80]}, open(os.path.join(HERE, "coverage.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
