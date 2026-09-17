import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as _scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../src/lib/permissions'

const scrypt = promisify(_scrypt) as (p: string | Buffer, s: string | Buffer, k: number) => Promise<Buffer>
const db = new PrismaClient()

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `scrypt:${salt}:${derived.toString('hex')}`
}

async function main() {
  console.log('🌱 Seeding...')

  // ── Roles & Permissions ──
  for (const [key, nameFa] of Object.entries(ROLES)) {
    await db.role.upsert({ where: { key }, update: { nameFa }, create: { key, nameFa } })
  }
  for (const [key, nameFa] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, update: { nameFa }, create: { key, nameFa } })
  }
  for (const [roleKey, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.findUnique({ where: { key: roleKey } })
    if (!role) continue
    for (const permKey of perms) {
      const perm = await db.permission.findUnique({ where: { key: permKey } })
      if (!perm) continue
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      })
    }
  }

  // پاک‌سازی مجوزهای حذف‌شده از کد (مثل voice.transcribe) — همگام نگه‌داشتن پنل ادمین
  const currentPermKeys = new Set(Object.keys(PERMISSIONS))
  const stalePerms = await db.permission.findMany({ where: { key: { notIn: Array.from(currentPermKeys) } }, select: { id: true } })
  for (const p of stalePerms) {
    await db.permission.delete({ where: { id: p.id } }).catch(() => undefined)
  }
  const currentRoleKeys = new Set(Object.keys(ROLES))
  const staleRoles = await db.role.findMany({ where: { key: { notIn: Array.from(currentRoleKeys) } }, select: { id: true } })
  for (const r of staleRoles) {
    await db.role.delete({ where: { id: r.id } }).catch(() => undefined)
  }

  // ── Units ──
  const units = ['کیسه', 'تن', 'عدد', 'متر', 'مترمربع', 'مترمکعب', 'لیتر', 'بسته', 'پالت', 'دستگاه', 'ماشین', 'شاخه', 'رول']
  for (const title of units) {
    await db.materialUnit.upsert({ where: { title }, update: {}, create: { title } })
  }

  // ── Workshops ──
  const whA = await db.workshop.upsert({
    where: { code: 'WH-SAADAT' },
    update: {},
    create: { name: 'کارگاه پروژه سعادت‌آباد', code: 'WH-SAADAT', address: 'تهران، سعادت‌آباد' },
  })
  const whB = await db.workshop.upsert({
    where: { code: 'WH-DAROUS' },
    update: {},
    create: { name: 'کارگاه پروژه دروس', code: 'WH-DAROUS', address: 'تهران، دروس' },
  })

  // ── Projects ──
  const prjA = await db.project.upsert({
    where: { code: 'PRJ-SA01' },
    update: {},
    create: { name: 'سعادت‌آباد', code: 'PRJ-SA01', workshopId: whA.id, clientName: 'آقای محمدی' },
  })
  const prjA2 = await db.project.upsert({
    where: { code: 'PRJ-SA02' },
    update: {},
    create: { name: 'سعادت‌آباد – فاز ۲', code: 'PRJ-SA02', workshopId: whA.id },
  })
  const _prjB = await db.project.upsert({
    where: { code: 'PRJ-DA01' },
    update: {},
    create: { name: 'دروس', code: 'PRJ-DA01', workshopId: whB.id, clientName: 'شرکت ساختمانی پارس' },
  })

  // ── Suppliers ──
  const supA = await db.supplier.upsert({
    where: { id: 'sup-x-a' },
    update: {},
    create: { id: 'sup-x-a', name: 'شرکت X', workshopId: whA.id, phone: '021-12345678' },
  })
  await db.supplier.upsert({ where: { id: 'sup-cem-a' }, update: {}, create: { id: 'sup-cem-a', name: 'سیمان تهران', workshopId: whA.id } })
  await db.supplier.upsert({ where: { id: 'sup-iron-a' }, update: {}, create: { id: 'sup-iron-a', name: 'آهن‌آلات سپاهان', workshopId: whA.id } })
  await db.supplier.upsert({ where: { id: 'sup-y-b' }, update: {}, create: { id: 'sup-y-b', name: 'شرکت Y (کارگاه دروس)', workshopId: whB.id } })

  // ── Materials ──
  const matCement = await db.material.upsert({
    where: { id: 'mat-cement2' },
    update: {},
    create: { id: 'mat-cement2', name: 'سیمان تیپ دو', category: 'سیمان', defaultUnit: 'کیسه', workshopId: whA.id },
  })
  const matRebar = await db.material.upsert({
    where: { id: 'mat-rebar14' },
    update: {},
    create: { id: 'mat-rebar14', name: 'میلگرد ۱۴', category: 'آهن‌آلات', defaultUnit: 'تن', workshopId: whA.id },
  })
  await db.material.upsert({ where: { id: 'mat-block' }, update: {}, create: { id: 'mat-block', name: 'بلوک سفالی', category: 'بنایی', defaultUnit: 'عدد', workshopId: whA.id } })
  await db.material.upsert({ where: { id: 'mat-sand' }, update: {}, create: { id: 'mat-sand', name: 'ماسه شسته', category: 'شن و ماسه', defaultUnit: 'ماشین', workshopId: whA.id } })
  await db.material.upsert({ where: { id: 'mat-rebar16' }, update: {}, create: { id: 'mat-rebar16', name: 'میلگرد ۱۶', category: 'آهن‌آلات', defaultUnit: 'تن', workshopId: whA.id } })
  await db.material.upsert({ where: { id: 'mat-cementB' }, update: {}, create: { id: 'mat-cementB', name: 'سیمان تیپ دو (دروس)', category: 'سیمان', defaultUnit: 'کیسه', workshopId: whB.id } })

  // ── Workers ──
  const wAli = await db.worker.upsert({ where: { id: 'w-ali' }, update: {}, create: { id: 'w-ali', fullName: 'علی', kind: 'LABORER', workshopId: whA.id } })
  const wHasan = await db.worker.upsert({ where: { id: 'w-hasan' }, update: {}, create: { id: 'w-hasan', fullName: 'حسن', kind: 'LABORER', workshopId: whA.id } })
  await db.worker.upsert({ where: { id: 'w-reza' }, update: {}, create: { id: 'w-reza', fullName: 'رضا', kind: 'DRIVER', workshopId: whA.id } })
  await db.worker.upsert({ where: { id: 'w-mahdi' }, update: {}, create: { id: 'w-mahdi', fullName: 'مهدی', kind: 'FORKLIFT', workshopId: whA.id } })

  // ── Users ──
  const usersData = [
    { username: 'admin', fullName: 'مدیر سیستم', role: 'SUPER_ADMIN', workshopId: null as string | null },
    { username: 'gm.sa', fullName: 'حاج آقا رضایی (مدیر کل)', role: 'GENERAL_MANAGER', workshopId: null as string | null },
    { username: 'manager.sa', fullName: 'مهندس کریمی (مدیر پروژه سعادت‌آباد)', role: 'PROJECT_MANAGER', workshopId: null as string | null },
    { username: 'supervisor.sa', fullName: 'اکبر حسینی (سرپرست سعادت‌آباد)', role: 'WORKSHOP_SUPERVISOR', workshopId: whA.id },
    { username: 'supervisor.da', fullName: 'قادر رحیمی (سرپرست دروس)', role: 'WORKSHOP_SUPERVISOR', workshopId: whB.id },
    { username: 'warehouse.sa', fullName: 'رضا محمدی (انباردار سعادت‌آباد)', role: 'WAREHOUSE_MANAGER', workshopId: whA.id },
    { username: 'purchaser.sa', fullName: 'مهدی احمدی (کارپرداز سعادت‌آباد)', role: 'PURCHASER', workshopId: whA.id },
    { username: 'accountant.sa', fullName: 'مریم صادقی (حسابدار)', role: 'ACCOUNTANT', workshopId: null as string | null },
    { username: 'worker.sa', fullName: 'علی (نیروی اجرایی سعادت‌آباد)', role: 'FIELD_WORKER', workshopId: whA.id, workerId: 'w-ali' },
    { username: 'inspector.sa', fullName: 'حسین ناظری (ناظر کنترل کیفیت سعادت‌آباد)', role: 'INSPECTOR', workshopId: whA.id },
    { username: 'viewer.sa', fullName: 'سمیرا احمدی (بیننده سعادت‌آباد)', role: 'VIEWER', workshopId: whA.id },
  ]
  const created: Record<string, { id: string; role: string }> = {}
  for (const u of usersData) {
    const user = await db.user.upsert({
      where: { username: u.username },
      update: { role: u.role, workshopId: u.workshopId, fullName: u.fullName, workerId: 'workerId' in u ? (u.workerId ?? null) : undefined },
      create: {
        username: u.username,
        passwordHash: await hashPassword('123456'),
        fullName: u.fullName,
        role: u.role,
        workshopId: u.workshopId,
        workerId: 'workerId' in u ? (u.workerId ?? null) : null,
      },
    })
    created[u.username] = { id: user.id, role: u.role }
  }

  // دسترسی‌ها
  await db.userProject.upsert({
    where: { userId_projectId: { userId: created['manager.sa'].id, projectId: prjA.id } },
    update: {},
    create: { userId: created['manager.sa'].id, projectId: prjA.id },
  })
  await db.userProject.upsert({
    where: { userId_projectId: { userId: created['manager.sa'].id, projectId: prjA2.id } },
    update: {},
    create: { userId: created['manager.sa'].id, projectId: prjA2.id },
  })
  await db.userWorkshop.upsert({
    where: { userId_workshopId: { userId: created['supervisor.sa'].id, workshopId: whA.id } },
    update: {},
    create: { userId: created['supervisor.sa'].id, workshopId: whA.id },
  })
  await db.userWorkshop.upsert({
    where: { userId_workshopId: { userId: created['supervisor.da'].id, workshopId: whB.id } },
    update: {},
    create: { userId: created['supervisor.da'].id, workshopId: whB.id },
  })
  for (const u of ['warehouse.sa', 'inspector.sa', 'viewer.sa']) {
    await db.userWorkshop.upsert({
      where: { userId_workshopId: { userId: created[u].id, workshopId: whA.id } },
      update: {},
      create: { userId: created[u].id, workshopId: whA.id },
    })
  }

  // ── نمونه ثبت‌های اولیه ──
  const existingEntries = await db.materialEntry.count()
  if (existingEntries === 0) {
    const now = new Date()
    const e1 = await db.materialEntry.create({
      data: {
        entryNumber: 1,
        type: 'PURCHASE',
        status: 'PENDING_REVIEW',
        workshopId: whA.id,
        supervisorId: created['supervisor.sa'].id,
        sourceType: 'SUPPLIER',
        sourceSupplierId: supA.id,
        hasInvoice: true,
        submittedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        editDeadline: new Date(now.getTime() + 22 * 60 * 60 * 1000),
        items: { create: { materialId: matCement.id, materialName: 'سیمان تیپ دو', quantity: 50, unit: 'کیسه', sortOrder: 0 } },
        projects: { create: { projectId: prjA.id } },
        workers: {
          create: [
            { workerId: wAli.id, workerName: 'علی', workerKind: 'LABORER' },
            { workerId: wHasan.id, workerName: 'حسن', workerKind: 'LABORER' },
          ],
        },
        versions: {
          create: {
            version: 1,
            changedById: created['supervisor.sa'].id,
            snapshotJson: JSON.stringify({ type: 'PURCHASE', items: [{ materialName: 'سیمان تیپ دو', quantity: 50, unit: 'کیسه' }], note: 'نسخه اولیه' }),
          },
        },
      },
    })
    const e2 = await db.materialEntry.create({
      data: {
        entryNumber: 2,
        type: 'PURCHASE',
        status: 'APPROVED',
        workshopId: whA.id,
        supervisorId: created['supervisor.sa'].id,
        sourceType: 'SUPPLIER',
        sourceSupplierId: 'sup-iron-a',
        approvedById: created['manager.sa'].id,
        hasInvoice: false,
        submittedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        editDeadline: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        decidedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 3600000),
        items: { create: { materialId: matRebar.id, materialName: 'میلگرد ۱۴', quantity: 2, unit: 'تن', sortOrder: 0 } },
        projects: { create: { projectId: prjA.id } },
        versions: {
          create: {
            version: 1,
            changedById: created['supervisor.sa'].id,
            snapshotJson: JSON.stringify({ type: 'PURCHASE', items: [{ materialName: 'میلگرد ۱۴', quantity: 2, unit: 'تن' }] }),
          },
        },
      },
    })
    console.log('   sample entries:', e1.entryNumber, e2.entryNumber)
  }

  console.log('✅ Seed complete. حساب‌های آزمایشی: admin / gm.sa / manager.sa / supervisor.sa / supervisor.da / warehouse.sa / purchaser.sa / accountant.sa / worker.sa / inspector.sa / viewer.sa — گذرواژه همه: 123456')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
