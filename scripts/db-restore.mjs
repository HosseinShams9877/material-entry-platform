#!/usr/bin/env node
/**
 * بازگردانی دیتابیس SQLite از فایل پشتیبان:
 *   RESTORE_FILE=backups/db-…db npm run db:restore
 * - مسیر مقصد از DATABASE_URL خوانده می‌شود (file:…)
 * - قبل از بازگردانی، از وضعیت فعلی یک پشتیبان اطمینان ساخته می‌شود
 * برای PostgreSQL: `psql "$DATABASE_URL" -f backups/db-…sql` (مستند شده در POSTGRES-MIGRATION.md)
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = (process.env.DATABASE_URL ?? '').trim()
const restoreFile = process.env.RESTORE_FILE ? resolve(process.env.RESTORE_FILE) : ''

if (!url.startsWith('file:')) {
  console.error('❌ این اسکریپت برای SQLite است. برای PostgreSQL: psql "$DATABASE_URL" -f <backup>.sql')
  process.exit(1)
}
if (!restoreFile || !existsSync(restoreFile)) {
  console.error('❌ RESTORE_FILE مشخص یا موجود نیست. مثال: RESTORE_FILE=backups/db-2026-01-01T00-00-00.db npm run db:restore')
  process.exit(1)
}

const target = url.replace(/^file:/, '').startsWith('/') ? url.replace(/^file:/, '') : join(root, url.replace(/^file:/, ''))

// پشتیبان اطمینان از وضعیت فعلی
if (existsSync(target)) {
  const safeCopy = join(dirname(target), `pre-restore-${basename(target)}`)
  copyFileSync(target, safeCopy)
  console.log(`🛟 وضعیت فعلی کپی شد: ${safeCopy}`)
}

// بازگردانی: فایل پشتیبان را با VACUUM INTO مقصد می‌ریزیم (سازگار با نسخهٔ در حال اجرا)
const tmpTarget = `${target}.restoring`
const src = new DatabaseSync(restoreFile)
src.exec(`VACUUM INTO '${tmpTarget.replace(/'/g, "''")}'`)
src.close()

const { renameSync, unlinkSync } = await import('node:fs')
if (existsSync(target)) unlinkSync(target)
renameSync(tmpTarget, target)
console.log(`✅ بازگردانی کامل شد: ${basename(restoreFile)} → ${target}`)
console.log('   ⚠️ اگر سرور در حال اجراست، آن را ری‌استارت کنید تا Prisma Client کش قدیمی را نبیند.')
