// ابزار بازرسی سریع DB — وضعیت کاربران، انبار و ثبت‌ها
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({ select: { username: true, role: true, workshopId: true }, orderBy: { username: 'asc' } })
  console.log('=== USERS ===')
  for (const u of users) console.log(`  ${u.username.padEnd(15)} ${u.role.padEnd(20)} ws=${u.workshopId ?? '-'}`)

  const stocks = await db.inventoryStock.findMany({})
  console.log('=== INVENTORY STOCKS ===', stocks.length)
  for (const s of stocks) console.log(`  ${s.workshopId} | ${s.materialName} | ${s.unit} | qty=${s.quantity}`)

  const movements = await db.inventoryMovement.findMany({ take: 20, orderBy: { createdAt: 'desc' } })
  console.log('=== RECENT MOVEMENTS ===', movements.length)
  for (const m of movements) console.log(`  ${m.createdAt.toISOString()} ${m.direction} ${m.quantity} ${m.materialName} (${m.reason})`)

  const entries = await db.materialEntry.findMany({
    select: { entryNumber: true, status: true, inventoryAppliedAt: true, warehouseConfirmedAt: true, workshopId: true },
    orderBy: { entryNumber: 'desc' }, take: 15,
  })
  console.log('=== ENTRIES (latest 15) ===')
  for (const e of entries) console.log(`  #${e.entryNumber} ${e.status.padEnd(20)} invApplied=${e.inventoryAppliedAt?.toISOString() ?? '-'} ws=${e.workshopId}`)

  const statements = await db.progressStatement.findMany({ select: { number: true, title: true, status: true, amount: true, needsGmSign: true }, orderBy: { number: 'desc' }, take: 10 })
  console.log('=== STATEMENTS ===', statements.length)
  for (const s of statements) console.log(`  #${s.number} ${s.status} ${s.amount} gmSign=${s.needsGmSign} "${s.title}"`)

  const purchases = await db.purchaseRequest.findMany({ select: { id: true, status: true, title: true }, orderBy: { createdAt: 'desc' }, take: 10 })
  console.log('=== PURCHASE REQUESTS ===', purchases.length)
  for (const p of purchases) console.log(`  ${p.status.padEnd(10)} "${p.title}"`)

  const audit = await db.auditLog.findMany({ where: { action: { in: ['WAREHOUSE_CONFIRM', 'DELIVER'] } }, orderBy: { createdAt: 'desc' }, take: 5 })
  console.log('=== WAREHOUSE CONFIRM AUDIT (last 5) ===', audit.length)
  for (const a of audit) console.log(`  ${a.createdAt.toISOString()} ${a.action} ${a.entityId}`)
}

main().finally(() => db.$disconnect())
