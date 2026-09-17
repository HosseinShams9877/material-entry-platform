#!/usr/bin/env python3
"""Stamp Persian page numbers on catalog body pages (cover & back cover excluded).
Scheme: cover = hidden page 1; body pages show ۱..N in Vazirmatn."""
import io
from fontTools.ttLib import TTFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLTTFont
from pypdf import PdfReader, PdfWriter

SRC = '/home/z/my-project/download/catalog/catalog.pdf'
DST = '/home/z/my-project/download/catalog/catalog-numbered.pdf'
W, H = 595.5, 842.25  # 794x1123 px at 0.75 pt/px

# woff2 -> ttf buffer for reportlab
font = TTFont('/home/z/my-project/public/fonts/Vazirmatn-Regular.woff2')
font.flavor = None
buf = io.BytesIO()
font.save(buf)
buf.seek(0)
pdfmetrics.registerFont(RLTTFont('VazirNum', buf))

FA = {'0':'۰','1':'۱','2':'۲','3':'۳','4':'۴','5':'۵','6':'۶','7':'۷','8':'۸','9':'۹'}
def fa(n): return ''.join(FA[c] for c in str(n))

reader = PdfReader(SRC)
writer = PdfWriter()
n_pages = len(reader.pages)

for i, page in enumerate(reader.pages):
    if i == 0 or i == n_pages - 1:  # cover + back cover: no number
        writer.add_page(page)
        continue
    buf2 = io.BytesIO()
    c = canvas.Canvas(buf2, pagesize=(float(page.mediabox.width), float(page.mediabox.height)))
    c.setFont('VazirNum', 9)
    c.setFillColorRGB(0.46, 0.44, 0.41)  # muted warm #757168
    c.drawCentredString(float(page.mediabox.width) / 2, 22, fa(i))
    c.save()
    buf2.seek(0)
    overlay = PdfReader(buf2).pages[0]
    page.merge_page(overlay)
    writer.add_page(page)

with open(DST, 'wb') as f:
    writer.write(f)
print('numbered ->', DST, 'pages:', n_pages)
