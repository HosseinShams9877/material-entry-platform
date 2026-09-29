#!/usr/bin/env node
/**
 * پشتیبان‌گیری دیتابیس — بر اساس DATABASE_URL:
 * - file:* (SQLite) → VACUUM INTO یک فایل تمیز در backups/
 * - postgresql://*  → فراخوانی pg_dump (در صورت نصب بودن)
 * نگهداری: BACKUP_KEEP (پیش‌فرض ۳۰ فایل آخر)
 */
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { readdirSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = (process.env.DATABASE_URL ?? '').trim()
if (!url) {
  console.error('❌ DATABASE_URL تنظیم نشده است.')
  process.exit(1)
}

const KEEP = Number(process.env.BACKUP_KEEP ?? '30') || 30
const backupDir = join(root, 'backups')
mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

function prune(keep = KEEP) {
  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('db-') && (f.endsWith('.db') || f.endsWith('.sql')))
    .sort()
    .reverse()
  for (const f of files.slice(keep)) {
    try {
      unlinkSync(join(backupDir, f))
    } catch {
      /* ignore */
    }
  }
}

if (url.startsWith('file:')) {
  const source = url.replace(/^file:/, '').startsWith('/') ? url.replace(/^file:/, '') : join(root, url.replace(/^file:/, ''))
  const target = join(backupDir, `db-${stamp}.db`)
  const db = new DatabaseSync(source)
  // VACUUM INTO — اسنپ‌شات تمیز و سازگار حتی در حین کار
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  db.close()
  const size = statSync(target).size
  console.log(`✅ پشتیبان SQLite ساخته شد: ${target} (${(size / 1024 / 1024).toFixed(2)} MB)`)
  prune()
} else if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
  const target = join(backupDir, `db-${stamp}.sql`)
  const res = spawnSync('pg_dump', ['--no-owner', '--no-privileges', '--file=' + target, url], {
    stdio: 'inherit',
  })
  if (res.error || (res.status ?? 1) !== 0) {
    console.error('❌ pg_dump ناموفق بود — آیا PostgreSQL Client نصب است؟')
    process.exit(1)
  }
  console.log(`✅ پشتیبان PostgreSQL ساخته شد: ${target}`)
  prune()
} else {
  console.error(`❌ نوع DATABASE_URL پشتیبانی نمی‌شود: ${url.split(':')[0]}:`)
  process.exit(1)
}
