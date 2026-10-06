"""동형 대조 PDF — 쪽마다 왼쪽에 실물 기출 스캔, 오른쪽에 봉투 회차(또는 기출 재조판)를 같은 크기로 나란히.

  python scripts/exam-forecast/build-fidelity-pdfs.py <work-dir> <pdf-dir>

입력  <work-dir>/exam/crops/pNN_full.png(실물 시험지 스캔 10쪽) · <pdf-dir>/set-NN-paper.pdf · <pdf-dir>/reference.pdf
출력  <pdf-dir>/fidelity-set-NN.pdf · <pdf-dir>/fidelity-reference.pdf (A3 가로, 쪽당 좌우 한 쌍)
개인정보: 스캔 1쪽 왼쪽 위 학생 이름(손글씨)을 흰 상자로 가린다. 나머지 쪽은 이름 칸이 없다(쪽 머리 대조 확인).
"""
import glob, io, os, sys
import fitz
from PIL import Image, ImageDraw

# 쪽 머리 글자는 PDF 내장 한글 CID 글꼴(파일을 심지 않는다 — 맑은 고딕 파일을 심으면 쪽마다 4MB)
FONT = 'korea'
A3 = fitz.Rect(0, 0, 1190.55, 841.89)
NAME_BOX = (72, 12, 272, 92)  # 1쪽 스캔(1080 폭으로 줄인 뒤) 이름 자리


def scan_bytes(path, first):
    im = Image.open(path).convert('RGB')
    im = im.resize((1080, round(im.height * 1080 / im.width)), Image.LANCZOS)  # 화면·인쇄 확인용 해상도
    if first:
        ImageDraw.Draw(im).rectangle(NAME_BOX, fill='white')
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=72)
    return buf.getvalue()


def build(scans, right_pdf, out, right_label):
    src = fitz.open(right_pdf)
    doc = fitz.open()
    n = max(len(scans), len(src))
    margin, gap, top = 22, 18, 46
    col_w = (A3.width - 2 * margin - gap) / 2
    col_h = A3.height - top - margin
    # A4 비율(1:1.414)로 칸 안에 맞춘다
    w = min(col_w, col_h / 1.4142)
    h = w * 1.4142
    left = fitz.Rect(margin + (col_w - w) / 2, top, margin + (col_w - w) / 2 + w, top + h)
    right = fitz.Rect(margin + col_w + gap + (col_w - w) / 2, top, margin + col_w + gap + (col_w - w) / 2 + w, top + h)
    for i in range(n):
        page = doc.new_page(width=A3.width, height=A3.height)
        page.insert_text((left.x0, 28), f'실물 기출 · 2026학년도 1학기 1차 — {i + 1}쪽', fontname=FONT, fontsize=11, color=(0.55, 0.1, 0.1))
        page.insert_text((right.x0, 28), f'{right_label} — {i + 1}쪽', fontname=FONT, fontsize=11, color=(0.1, 0.1, 0.1))
        if i < len(scans):
            page.insert_image(left, stream=scan_bytes(scans[i], i == 0), keep_proportion=True)
        else:
            page.insert_text((left.x0 + 20, left.y0 + 40), '(기출에 없는 쪽)', fontname=FONT, fontsize=10, color=(0.5, 0.5, 0.5))
        if i < len(src):
            page.show_pdf_page(right, src, i, keep_proportion=True)
        else:
            page.insert_text((right.x0 + 20, right.y0 + 40), '(쪽 없음)', fontname=FONT, fontsize=10, color=(0.5, 0.5, 0.5))
        page.draw_rect(left, color=(0.8, 0.8, 0.8), width=0.6)
        page.draw_rect(right, color=(0.8, 0.8, 0.8), width=0.6)
    doc.save(out, garbage=4, deflate=True, deflate_fonts=True)
    return n


def main():
    wd, pdf_dir = sys.argv[1], sys.argv[2]
    scans = sorted(glob.glob(os.path.join(wd, 'exam/crops/p[0-9][0-9]_full.png')))
    if len(scans) != 10:
        sys.exit(f'스캔 쪽이 10장이 아니다: {len(scans)}')
    made = []
    ref = os.path.join(pdf_dir, 'reference.pdf')
    if os.path.exists(ref):
        made.append(('fidelity-reference', build(scans, ref, os.path.join(pdf_dir, 'fidelity-reference.pdf'), '같은 30문항을 우리 조판 엔진으로 다시 찍은 것')))
    for p in sorted(glob.glob(os.path.join(pdf_dir, 'set-[0-9][0-9]-paper.pdf'))):
        no = int(os.path.basename(p)[4:6])
        made.append((f'fidelity-set-{no:02d}', build(scans, p, os.path.join(pdf_dir, f'fidelity-set-{no:02d}.pdf'), f'봉투 모의고사 제{no}회')))
    for name, pages in made:
        print('ok', name, f'{pages}쪽')


if __name__ == '__main__':
    main()
