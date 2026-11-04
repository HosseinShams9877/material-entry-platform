"use client"

import { EntryDraftForm, emptyDraft, type DraftFormValue } from '@/components/app/entry-draft-form'
import { entryTypeLabel, ENTRY_DIRECTIONS, type EntryTypeKey, type EntryDirectionKey } from '@/lib/permissions'

/** ثبت دستی — فرم کوتاه با نوع ورود از پیش انتخاب‌شده (یا حالت ویرایش)
 *  جریان یکپارچه: جهت (ورود/خروج) و پروژهٔ قفل‌شده از گازهای قبل دریافت می‌شود. */
export default function ManualEntry({ params }: { params?: Record<string, unknown> }) {
  const editId = params?.editId as string | undefined
  const type = (params?.type as EntryTypeKey) ?? 'PURCHASE'
  const direction = (params?.direction as EntryDirectionKey) ?? 'IN'
  const lockProjectId = (params?.projectId as string | undefined) ?? undefined
  const initial: DraftFormValue = emptyDraft(type, direction, lockProjectId)

  if (editId) {
    return (
      <EntryDraftForm
        initial={initial}
        editId={editId}
        lockProjectId={lockProjectId}
        title="ویرایش ثبت"
        subtitle="پس از ذخیره، نسخه جدید ایجاد می‌شود"
      />
    )
  }

  return (
    <EntryDraftForm
      initial={initial}
      lockProjectId={lockProjectId}
      title={`${ENTRY_DIRECTIONS[direction]} — ${entryTypeLabel(type, direction)}`}
      subtitle="فرم کوتاه — کمتر از ۳۰ ثانیه"
    />
  )
}
