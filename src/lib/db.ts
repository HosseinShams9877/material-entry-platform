import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// لاگ Query فقط در Development — در Production هم حجم لاگ و هم نشت دادهٔ PII
// از طریق پارامترهای کوئری جلوگیری می‌شود.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
