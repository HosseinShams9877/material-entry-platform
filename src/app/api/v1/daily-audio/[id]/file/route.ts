import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canAccessTask, canAccessReport } from '@/lib/daily'
import { verifyDailyAudioSignature } from '@/lib/signed-url'
import { resolveStoragePath } from '@/lib/upload'
import { NextResponse, type NextRequest } from 'next/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * پخش/دانلود فایل صوتی ماژول روزانه (Streaming):
 * - مسیر ۱: Signed URL معتبر (HMAC با TTL)
 * - مسیر ۲: نشست دارای Scope (گیرندهٔ وظیفه/مدیر کارگاه/مدیر پروژه/گزارش‌دهنده)
 * فایل هرگز Public نیست و هر دو مسیر مهار مسیر دارند.
 */
export async function GET(req: NextRequest, ctx: RouteParams) {
  try {
    const { id } = await ctx.params
    const token = req.nextUrl.searchParams.get('token')

    const audio = await db.dailyAudio.findUnique({ where: { id }, select: { id: true, storagePath: true, mimeType: true, fileName: true, kind: true } })
    if (!audio) {
      return fail(404, 'NOT_FOUND', 'فایل صوتی یافت نشد.')
    }

    // مسیر ۱: Signed URL
    let authorized = token ? verifyDailyAudioSignature(id, token) : false

    // مسیر ۲: نشست با Scope
    if (!authorized) {
      const user = await getSessionUser()
      if (user) {
        if (audio.kind === 'TASK') {
          const task = await db.dailyTask.findFirst({ where: { sourceAudioId: audio.id }, select: { id: true, workshopId: true, projectId: true } })
          if (task) authorized = await canAccessTask(user, task)
        } else if (audio.kind === 'REPORT') {
          const report = await db.dailyReport.findUnique({ where: { audioId: audio.id }, select: { workshopId: true, projectId: true, reporterId: true } })
          if (report) authorized = await canAccessReport(user, report)
        } else if (audio.kind === 'COMMENT') {
          const comment = await db.taskComment.findUnique({ where: { audioId: audio.id }, select: { taskId: true } })
          if (comment) {
            const task = await db.dailyTask.findUnique({ where: { id: comment.taskId }, select: { id: true, workshopId: true, projectId: true } })
            if (task) authorized = await canAccessTask(user, task)
          }
        }
      }
    }

    if (!authorized) {
      return fail(404, 'NOT_FOUND', 'فایل صوتی یافت نشد یا دسترسی منقضی شده است.')
    }

    // مهار مسیر داخل UPLOAD_DIR — دفاع در برابر دستکاری رکورد/Path Traversal
    let absolute: string
    let fileStat
    try {
      absolute = resolveStoragePath(audio.storagePath)
      fileStat = await stat(absolute)
      if (!fileStat.isFile()) throw new Error('not a file')
    } catch {
      return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
    }

    // Stream — بدون بارگذاری کامل در حافظه
    const stream = createReadStream(absolute)
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': audio.mimeType,
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(audio.fileName)}`,
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail(404, 'NOT_FOUND', 'فایل یافت نشد.')
  }
}
