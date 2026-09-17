#!/usr/bin/env node
/**
 * تولید نسخهٔ PostgreSQL پرisma schema:
 * - provider → "postgresql"
 * - SQLite comment ها حفظ می‌شود؛ بقیهٔ مدل‌ها یک‌سان‌اند
 * خروجی: prisma/postgres/schema.prisma
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8')

const converted = src.replace(
  /datasource db \{[\s\S]*?\}/,
  `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`
)

if (!converted.includes('provider = "postgresql"')) {
  console.error('❌ تبدیل provider ناموفق بود.')
  process.exit(1)
}

mkdirSync(join(root, 'prisma', 'postgres'), { recursive: true })
writeFileSync(join(root, 'prisma', 'postgres', 'schema.prisma'), converted)
console.log('✅ prisma/postgres/schema.prisma ساخته شد (provider=postgresql).')
console.log('   استقرار: DATABASE_URL="postgresql://…" npx prisma migrate deploy --schema prisma/postgres/schema.prisma')
