import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { taskCommentSchema } from '@/lib/validate'
import { canAccessTask } from '@/lib/daily'
import { makeSignedDailyAudioUrl } from '@/lib/signed-url'

// ─────────────────────────── GET /api/v1/daily-tasks/[id]/comments — گفتگوهای وظیفه ───────────────────────────

export const GET = apiHandler(
  async ({ params, user }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, workshopId: true, projectId: true },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    if (!(await canAccessTask(user, task))) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    const comments = await db.taskComment.findMany({
      where: { taskId: task.id },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        audio: { select: { id: true, fileName: true, size: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return ok({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        transcript: c.transcript,
        createdAt: c.createdAt.toISOString(),
        userId: c.user.id,
        userName: c.user.fullName,
        audio: c.audio ? { id: c.audio.id, fileName: c.audio.fileName, size: c.audio.size, audioUrl: makeSignedDailyAudioUrl(c.audio.id) } : null,
      })),
    })
  },
  { permission: 'task.view', rateLimit: { limit: 60, windowMs: 60_000, scope: 'daily-tasks' } }
)

// ─────────────────────────── POST /api/v1/daily-tasks/[id]/comments — افزودن دیدگاه ───────────────────────────

export const POST = apiHandler(
  async ({ params, user, body }) => {
    const task = await db.dailyTask.findUnique({
      where: { id: params.id },
      select: { id: true, workshopId: true, projectId: true, assignees: { select: { userId: true } } },
    })
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')
    if (!(await canAccessTask(user, task))) throw new ApiError(404, 'NOT_FOUND', 'وظیفه یافت نشد.')

    // صوت دیدگاه باید متعلق به همین کاربر باشد
    if (body.audioId) {
      const audio = await db.dailyAudio.findUnique({
        where: { id: body.audioId },
        select: { id: true, uploadedById: true, kind: true },
      })
      if (!audio || audio.uploadedById !== user.id || audio.kind !== 'COMMENT') {
        throw new ApiError(404, 'NOT_FOUND', 'فایل صوتی یافت نشد.')
      }
      const used = await db.taskComment.findFirst({ where: { audioId: body.audioId }, select: { id: true } })
      if (used) throw new ApiError(409, 'AUDIO_USED', 'این فایل صوتی قبلاً استفاده شده است.')
    }

    const comment = await db.taskComment.create({
      data: {
        taskId: task.id,
        userId: user.id,
        content: body.content,
        audioId: body.audioId ?? null,
      },
    })

    return ok({ commentId: comment.id }, { status: 201 })
  },
  {
    permission: 'task.view',
    schema: taskCommentSchema,
    rateLimit: { limit: 30, windowMs: 60_000, scope: 'daily-tasks-write' },
  }
)
