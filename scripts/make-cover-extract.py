#!/usr/bin/env python3
"""Extract cover-only HTML from catalog.html for cover_validate.js
(cover_validate is cover-ONLY per SKILL.md — never run on full documents)."""
import re, sys

SRC = '/home/z/my-project/download/catalog/catalog.html'
DST = '/home/z/my-project/download/catalog/_cover_check.html'

raw = open(SRC, encoding='utf-8').read()

head = re.search(r'^(.*?)<body>', raw, re.S).group(1)
cover = re.search(r'(<!-- ======================= COVER ======================= -->\s*<div class="front">.*?</div>\s*(?=\n<!-- ))', raw, re.S)
if not cover:
    sys.exit('cover block not found')
html = head + '<body>\n' + cover.group(1) + '\n</body>\n</html>'
open(DST, 'w', encoding='utf-8').write(html)
print('written', DST, len(html), 'bytes')
