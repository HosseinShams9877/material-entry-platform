#!/usr/bin/env bash
# اجرای کامل سوئیت‌های تست — با ری‌استارت سرور بین سوئیت‌ها (جلوگیری از 429 نرخ ورود)
set -u
cd /home/z/my-project
OUT=/home/z/my-project/tool-results/test-runs
mkdir -p "$OUT"

SUITES=(
  "enterprise:scripts/enterprise-tests.mjs"
  "modules:scripts/modules-tests.mjs"
  "daily:scripts/daily-tasks-tests.mjs"
  "proposal:scripts/proposal-tests.mjs"
  "security:scripts/security-tests.mjs"
  "production:scripts/production-tests.mjs"
  "removal:scripts/removal-tests.mjs"
  "inventory:scripts/inventory-tests.mjs"
)

restart_server() {
  pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
  sleep 3
  (nohup bun run dev > /dev/null 2>&1 &)
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  echo "SERVER FAILED TO START"; return 1
}

TOTAL_PASS=0; TOTAL_FAIL=0
for entry in "${SUITES[@]}"; do
  name="${entry%%:*}"; file="${entry#*:}"
  [ -f "$file" ] || { echo "== $name: FILE MISSING =="; continue; }
  echo "════ $name ════"
  restart_server || exit 1
  timeout 420 node "$file" > "$OUT/$name.log" 2>&1
  code=$?
  summary=$(grep -oE "نتیجه: [0-9]+ موفق، [0-9]+ ناموفق" "$OUT/$name.log" | tail -1)
  if [ -z "$summary" ]; then summary=$(tail -2 "$OUT/$name.log" | tr '\n' ' ' | head -c 160); fi
  echo "  exit=$code | $summary"
  sleep 2
done

# پاک‌سازی کاربران tmp ساخته‌شده توسط تست‌ها
node scripts/cleanup-tmp-users.mjs 2>&1 | tail -2
restart_server
echo "DONE — logs in $OUT"
