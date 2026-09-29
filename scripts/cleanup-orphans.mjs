#!/usr/bin/env bun
/**
 * پاک‌سازی فایل‌های یتیم Upload — فایل‌هایی در UPLOAD_DIR که رکورد Attachment ندارند.
 *
 * اجرا:  bun scripts/cleanup-orphans.mjs [--dry-run]
 * Cron پیشنهادی Production: روزانه یک‌بار (فایل‌های کمتر از ۱ ساعت قدیم حفظ می‌شوند
 * تا با آپلودهای در جریان تداخل نکند).
 */
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'))
const GRACE_MS = 60 * 60 * 1000 // فایل‌های تازه‌تر از ۱ ساعت دست نمی‌خورند

const db = new PrismaClient()

async function main() {
  let files
  try {
    files = await readdir(UPLOAD_DIR)
  } catch {
    console.log(JSON.stringify({ ok: true, message: 'UPLOAD_DIR not found — nothing to clean', dir: UPLOAD_DIR }))
    return
  }

  const known = new Set(await db.attachment.findMany({ select: { storagePath: true } }).then((rows) => rows.map((r) => path.basename(r.storagePath))))

  const now = Date.now()
  const orphans = []
  for (const name of files) {
    if (name.startsWith('.')) continue
    if (known.has(name)) continue
    const full = path.join(UPLOAD_DIR, name)
    try {
      const st = await (await import('node:fs/promises')).stat(full)
      if (!st.isFile()) continue
      if (now - st.mtimeMs < GRACE_MS) continue
      orphans.push({ name, size: st.size })
    } catch {
      continue
    }
  }

  if (!DRY_RUN) {
    for (const o of orphans) {
      await unlink(path.join(UPLOAD_DIR, o.name)).catch(() => undefined)
    }
  }

  const totalBytes = orphans.reduce((a, o) => a + o.size, 0)
  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    dir: UPLOAD_DIR,
    orphansFound: orphans.length,
    removedBytes: totalBytes,
    ...(DRY_RUN ? { samples: orphans.slice(0, 10).map((o) => o.name) } : {}),
  }))
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err) }))
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
