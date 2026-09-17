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
 * نمایش تصویر امضای مدیرکل روی صورت وضعیت (فقط PNG):
 * - مسیر ۱: Signed URL معتبر (HMAC با TTL)
 * - مسیر ۲: نشست دارای Scope (نقش‌های دارای statement.view)
 * فایل هرگز Public نیست و هر دو مسیر مهار مسیر دارند.
 */
export async function GET(req: NextRequest, ctx: RouteParams) {
  try {
    const { id } = await ctx.params
    const token = req.nextUrl.searchParams.get('token')

    const statement = await db.progressStatement.findUnique({
      where: { id },
      select: { id: true, signaturePath: true, status: true, workshopId: true, projectId: true, createdById: true },
    })
    if (!statement || !statement.signaturePath || statement.status !== 'SIGNED') {
      return fail(404, 'NOT_FOUND', 'امضا یافت نشد.')
    }

    // مسیر ۱: Signed URL
    let authorized = token ? verifyAttachmentSignature(id, token) : false

    // مسیر ۲: نشست با Scope
    if (!authorized) {
      const user = await getSessionUser()
      if (user) {
        const scope = await getUserScope(user)
        authorized = canAccessWorkshopRecord(scope, statement, user.id)
      }
    }

    if (!authorized) {
      return fail(404, 'NOT_FOUND', 'امضا یافت نشد یا دسترسی منقضی شده است.')
    }

    // مهار مسیر داخل UPLOAD_DIR — دفاع در برابر دستکاری رکورد/Path Traversal
    let absolute: string
    let fileStat
    try {
      absolute = resolveStoragePath(statement.signaturePath)
      fileStat = await stat(absolute)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
    }

    const stream = createReadStream(absolute)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent('signature.png')}`,
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
  }
}
