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

  // پاک‌سازی مجوزهای حذف‌شده از کد (مثل voice.transcribe و finance.*) — همگام نگه‌داشتن پنل ادمین
  const currentPermKeys = new Set(Object.keys(PERMISSIONS))
  const stalePerms = await db.permission.findMany({ where: { key: { notIn: Array.from(currentPermKeys) } }, select: { id: true } })
  for (const p of stalePerms) {
    await db.permission.delete({ where: { id: p.id } }).catch(() => undefined)
  }

  // ── مهاجرت نقش‌ها — مدل سه‌نقشی (درخواست کارفرما) ──
  // همهٔ نقش‌های قدیمی مستقیماً به مقصد نهایی منتقل می‌شوند.
  const ROLE_MIGRATION: Record<string, string> = {
    ADMIN: 'PROJECT_MANAGER',
    SUPER_ADMIN: 'PROJECT_MANAGER',
    GENERAL_MANAGER: 'PROJECT_MANAGER',
    WORKSHOP_MANAGER: 'PROJECT_MANAGER',
    PURCHASER: 'PROJECT_MANAGER',
    ACCOUNTANT: 'FIELD_WORKER',
    INSPECTOR: 'SITE_SUPERVISOR',
    VIEWER: 'FIELD_WORKER',
    WORKSHOP_SUPERVISOR: 'SITE_SUPERVISOR',
    WAREHOUSE_MANAGER: 'SITE_SUPERVISOR',
  }
  for (const [from, to] of Object.entries(ROLE_MIGRATION)) {
    await db.user.updateMany({ where: { role: from }, data: { role: to } })
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
  // نقش‌ها: فقط ۳ نقش — PROJECT_MANAGER (مدیر پروژه‌ها) / SITE_SUPERVISOR (سرپرست کارگاه) / FIELD_WORKER (کارگر)
  // سرپرست می‌تواند یک یا چند کارگاه را سرپرستی کند (از طریق دسترسی چند-کارگاهی در مدیریت کاربران)
  const usersData = [
    { username: 'admin', fullName: 'مدیر پروژه‌ها', role: 'PROJECT_MANAGER', workshopId: null as string | null, active: true },
    { username: 'manager.sa', fullName: 'مهندس کریمی (مدیر پروژه‌ها)', role: 'PROJECT_MANAGER', workshopId: whA.id, active: true },
    { username: 'supervisor.sa', fullName: 'اکبر حسینی (سرپرست سعادت‌آباد)', role: 'SITE_SUPERVISOR', workshopId: whA.id, active: true },
    { username: 'supervisor.da', fullName: 'قادر رحیمی (سرپرست دروس)', role: 'SITE_SUPERVISOR', workshopId: whB.id, active: true },
    { username: 'warehouse.sa', fullName: 'رضا محمدی (سرپرست انبار سعادت‌آباد)', role: 'SITE_SUPERVISOR', workshopId: whA.id, active: true },
    { username: 'worker.sa', fullName: 'علی (کارگر سعادت‌آباد)', role: 'FIELD_WORKER', workshopId: whA.id, active: true, workerId: 'w-ali' },
  ]
  const created: Record<string, { id: string; role: string }> = {}
  for (const u of usersData) {
    const user = await db.user.upsert({
      where: { username: u.username },
      update: { role: u.role, workshopId: u.workshopId, fullName: u.fullName, isActive: u.active, workerId: 'workerId' in u ? (u.workerId ?? null) : undefined },
      create: {
        username: u.username,
        passwordHash: await hashPassword('123456'),
        fullName: u.fullName,
        role: u.role,
        workshopId: u.workshopId,
        isActive: u.active,
        workerId: 'workerId' in u ? (u.workerId ?? null) : null,
      },
    })
    created[u.username] = { id: user.id, role: u.role }
  }

  // ── حذف حساب‌های زائد نقش‌های حذف‌شده (کارپرداز/حسابدار/ناظر/بیننده/مدیر کل) ──
  // کارفرما: حسابداری خارجی است — حساب حسابدار و بقیهٔ نقش‌های حذف‌شده باید از فهرست کاربران پاک شوند.
  const legacyUsernames = ['purchaser.sa', 'accountant.sa', 'inspector.sa', 'viewer.sa', 'gm.sa']
  for (const username of legacyUsernames) {
    const legacy = await db.user.findUnique({ where: { username } })
    if (!legacy) continue
    try {
      await db.session.deleteMany({ where: { userId: legacy.id } })
      await db.notification.deleteMany({ where: { userId: legacy.id } })
      await db.userWorkshop.deleteMany({ where: { userId: legacy.id } })
      await db.userProject.deleteMany({ where: { userId: legacy.id } })
      await db.userRole.deleteMany({ where: { userId: legacy.id } })
      await db.user.delete({ where: { id: legacy.id } })
      console.log(`🗑 Removed legacy account: ${username}`)
    } catch {
      // قید FK (سابقهٔ ثبت دارد) — غیرفعال می‌ماند، نقش و نامِ خنثی می‌گیرد
      await db.user
        .update({ where: { id: legacy.id }, data: { isActive: false, role: 'FIELD_WORKER', fullName: 'کاربر غیرفعال (حساب قدیمی)' } })
        .catch(() => undefined)
      console.log(`⚠️ Kept (FK-bound, deactivated): ${username}`)
    }
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
  for (const u of ['warehouse.sa', 'worker.sa']) {
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

  console.log('✅ Seed complete. حساب‌های آزمایشی (مدل ۳ نقشی): admin / manager.sa (مدیر پروژه‌ها) / supervisor.sa / supervisor.da / warehouse.sa (سرپرست کارگاه) / worker.sa (کارگر) — گذرواژه همه: 123456')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
