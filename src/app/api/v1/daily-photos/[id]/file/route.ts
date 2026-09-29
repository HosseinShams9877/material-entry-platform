import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canAccessTask } from '@/lib/daily'
import { resolveStoragePath } from '@/lib/upload'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * سرو عکس اثبات انجام — فایل هرگز Public نیست.
 * فقط نشست دارای Scope روی وظیفهٔ مربوط (گیرنده/ایجادکننده/مدیر کارگاه/مدیر پروژه).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getSessionUser()
    if (!user) return fail(404, 'NOT_FOUND', 'عکس یافت نشد.')

    const photo = await db.taskItemPhoto.findUnique({
      where: { id },
      select: {
        id: true,
        storagePath: true,
        mimeType: true,
        fileName: true,
        item: { include: { task: { select: { id: true, workshopId: true, projectId: true } } } },
      },
    })
    if (!photo) return fail(404, 'NOT_FOUND', 'عکس یافت نشد.')

    const authorized = await canAccessTask(user, photo.item.task)
    if (!authorized) return fail(404, 'NOT_FOUND', 'عکس یافت نشد.')

    let absolute: string
    let fileStat
    try {
      absolute = resolveStoragePath(photo.storagePath)
      fileStat = await stat(absolute)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
    }

    const stream = createReadStream(absolute)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': photo.mimeType,
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(photo.fileName)}`,
        'Cache-Control': 'private, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
  }
}
