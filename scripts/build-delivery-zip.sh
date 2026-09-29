#!/usr/bin/env bash
# بازسازی بستهٔ تحویل — سورس کامل بدون node_modules/.next/db/uploads
set -e
cd /home/z/my-project
OUT=download/material-entry-platform-source.zip
rm -f "$OUT"
zip -r -q "$OUT" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x "db/*" \
  -x "uploads/*" \
  -x "download/*" \
  -x "tool-results/*" \
  -x "upload/*" \
  -x "*.log" \
  -x ".env" \
  -x "dev.log" \
  -x "worklog.md" \
  -x "skills/*" \
  -x "examples/*" \
  -x "mini-services/*" \
  -x ".git/*" \
  -x "agent-ctx/*"
echo "files: $(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
du -h "$OUT"
