import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { getUserScope, canAccessWorkshopRecord } from '@/lib/scope'
import { verifyAttachmentSignature } from '@/lib/signed-url'
import { resolveStoragePath } from '@/lib/upload'
import { NextResponse, type NextRequest } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * نمایش تصویر/PDF فاکتور خرید — دو مسیر مجاز:
 * - مسیر ۱: Signed URL معتبر (HMAC با TTL)
 * - مسیر ۲: نشست دارای Scope (کارگاه/پروژه/ادمین)
 * فایل هرگز Public نیست و هر دو مسیر مهار مسیر دارند.
 */
export async function GET(req: NextRequest, ctx: RouteParams) {
  try {
    const { id } = await ctx.params
    const token = req.nextUrl.searchParams.get('token')

    const request = await db.purchaseRequest.findUnique({
      where: { id },
      select: {
        id: true,
        invoicePath: true,
        invoiceFileName: true,
        invoiceMimeType: true,
        invoiceSize: true,
        workshopId: true,
        projectId: true,
        requestedById: true,
      },
    })
    if (!request || !request.invoicePath) {
      return fail(404, 'NOT_FOUND', 'فاکتور یافت نشد.')
    }

    // مسیر ۱: Signed URL
    let authorized = token ? verifyAttachmentSignature(id, token) : false

    // مسیر ۲: نشست با Scope
    if (!authorized) {
      const user = await getSessionUser()
      if (user) {
        const scope = await getUserScope(user)
        authorized = canAccessWorkshopRecord(scope, request, user.id)
      }
    }

    if (!authorized) {
      return fail(404, 'NOT_FOUND', 'فاکتور یافت نشد یا دسترسی منقضی شده است.')
    }

    // مهار مسیر داخل UPLOAD_DIR — دفاع در برابر دستکاری رکورد/Path Traversal
    let absolute: string
    let fileStat
    try {
      absolute = resolveStoragePath(request.invoicePath)
      fileStat = await stat(absolute)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
    }

    const mime = request.invoiceMimeType ?? 'application/octet-stream'
    const stream = createReadStream(absolute)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(request.invoiceFileName ?? 'invoice')}`,
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
  }
}
