# -*- coding: utf-8 -*-
"""page-XX.jpg 27장 -> smoat-IR-deck.pdf (16:9, 960x540pt, ~288DPI)"""
import glob
import os

from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "smoat-IR-deck.pdf")
PAGE_W, PAGE_H = 960, 540  # 16:9 (파워포인트 와이드 규격)

pages = sorted(glob.glob(os.path.join(HERE, "page-*.jpg")))
assert len(pages) == 27, f"expected 27 pages, got {len(pages)}"

c = canvas.Canvas(OUT, pagesize=(PAGE_W, PAGE_H))
c.setTitle("smoat IR Deck — 가장 스마트한 해자")
c.setAuthor("smoat (주식회사 네안데르)")
c.setSubject("Spark Claw Cohort 01 — Investor Relations")

for img in pages:
    c.drawImage(img, 0, 0, width=PAGE_W, height=PAGE_H)
    c.showPage()

c.save()
print("saved:", os.path.abspath(OUT), os.path.getsize(OUT) // 1024, "KB")
