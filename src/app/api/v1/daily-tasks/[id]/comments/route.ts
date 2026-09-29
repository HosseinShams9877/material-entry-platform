import { db } from '@/lib/db'
import { apiHandler, ok, ApiError } from '@/lib/api'
import { taskCommentSchema } from '@/lib/validate'
import { canAccessTask } from '@/lib/daily'

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
      },
      orderBy: { createdAt: 'asc' },
    })

    return ok({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        userId: c.user.id,
        userName: c.user.fullName,
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

    const comment = await db.taskComment.create({
      data: {
        taskId: task.id,
        userId: user.id,
        content: body.content,
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
