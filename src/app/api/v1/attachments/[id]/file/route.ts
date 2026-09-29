import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { resolveAttachmentAccess } from '@/lib/scope'
import { verifyAttachmentSignature } from '@/lib/signed-url'
import { resolveStoragePath } from '@/lib/upload'
import { NextResponse, type NextRequest } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * دانلود فایل خصوصی (Streaming — بدون بارگذاری کامل در حافظه):
 * - Signed URL معتبر (انقضادار HMAC) یا
 * - نشست دارای دسترسی Scope
 * هر دو مسیر باید عبور کنند؛ فایل هرگز Public نیست.
 */
export async function GET(req: NextRequest, ctx: RouteParams) {
  try {
    const { id } = await ctx.params
    const token = req.nextUrl.searchParams.get('token')

    const attachment = await db.attachment.findUnique({
      where: { id },
      select: { id: true, entityType: true, entityId: true, entryId: true, mimeType: true, fileName: true, storagePath: true },
    })
    if (!attachment) {
      return fail(404, 'NOT_FOUND', 'مدرک یافت نشد.')
    }
    const entityId = attachment.entityId ?? attachment.entryId ?? ''

    // مسیر ۱: Signed URL
    let authorized = token ? verifyAttachmentSignature(id, token) : false

    // مسیر ۲: نشست دارای دسترسی — برای همهٔ انواع موجودیت
    if (!authorized) {
      const user = await getSessionUser()
      if (user) {
        const access = await resolveAttachmentAccess(user, attachment.entityType, entityId)
        authorized = access.exists && access.canView
      }
    }

    if (!authorized) {
      return fail(404, 'NOT_FOUND', 'مدرک یافت نشد یا دسترسی منقضی شده است.')
    }

    // مهار مسیر داخل UPLOAD_DIR — دفاع در برابر دستکاری رکورد/Path Traversal
    let absolute: string
    let fileStat
    try {
      absolute = resolveStoragePath(attachment.storagePath)
      fileStat = await stat(absolute)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
    }

    // Stream — مناسب فایل‌های بزرگ؛ کل فایل در حافظه بارگذاری نمی‌شود
    const stream = createReadStream(absolute)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        'Cache-Control': 'private, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
  }
}
