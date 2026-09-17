#!/usr/bin/env python3
"""QA catalog PDF: per-page text extraction + PNG rendering for visual check."""
import sys
import pymupdf

PDF = '/home/z/my-project/download/catalog/catalog.pdf'
OUT = '/home/z/my-project/download/catalog/_qa'

import os
os.makedirs(OUT, exist_ok=True)

doc = pymupdf.open(PDF)
print(f'pages={len(doc)}  metadata_title={doc.metadata.get("title")!r}')

bad = []
for i, page in enumerate(doc):
    txt = page.get_text()
    n_words = len([w for w in txt.split() if w.strip()])
    has_fffd = '\ufffd' in txt
    has_zwnj = '\u200c' in txt
    has_fadigit = any('\u06f0' <= c <= '\u06f9' for c in txt)
    print(f'--- page {i+1}: words={n_words} zwnj={has_zwnj} fa_digits={has_fadigit} fffd={has_fffd}')
    if has_fffd:
        bad.append((i+1, 'U+FFFD found'))
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.35, 1.35))
    pix.save(f'{OUT}/page-{i+1:02d}.png')

if bad:
    print('PROBLEMS:', bad)
    sys.exit(1)
print('text QA ok')
