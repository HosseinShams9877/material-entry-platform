// پاک‌سازی کاربران آزمایشی زباله (tmpuser*) — با مدیریت ارجاع‌ها
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const tmp = await db.user.findMany({ where: { username: { startsWith: 'tmpuser' } }, select: { id: true, username: true } })
  console.log(`tmp users found: ${tmp.length}`)
  let deleted = 0
  for (const u of tmp) {
    try {
      await db.user.delete({ where: { id: u.id } })
      deleted++
    } catch (e) {
      console.log(`  ! ${u.username}: ${(e).message?.slice(0, 120)}`)
      // تلاش دستی: حذف ارجاع‌های سبک سپس حذف کاربر
      await db.session.deleteMany({ where: { userId: u.id } }).catch(() => undefined)
      await db.notification.deleteMany({ where: { userId: u.id } }).catch(() => undefined)
      await db.taskAssignee.deleteMany({ where: { userId: u.id } }).catch(() => undefined)
      await db.auditLog.updateMany({ where: { userId: u.id }, data: { userId: null } }).catch(() => undefined)
      try {
        await db.user.delete({ where: { id: u.id } })
        deleted++
      } catch (e2) {
        console.log(`  ✗ still blocked: ${u.username}: ${(e2).message?.slice(0, 200)}`)
      }
    }
  }
  console.log(`deleted: ${deleted}/${tmp.length}`)
  // حذف نشست‌های منقضی
  const exp = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  console.log(`expired sessions removed: ${exp.count}`)
}

main().finally(() => db.$disconnect())
