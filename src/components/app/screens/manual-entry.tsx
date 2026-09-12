"use client"

import { EntryDraftForm, emptyDraft, type DraftFormValue } from '@/components/app/entry-draft-form'
import { ENTRY_TYPES, type EntryTypeKey } from '@/lib/permissions'

/** ثبت دستی — فرم کوتاه با نوع ورود از پیش انتخاب‌شده (یا حالت ویرایش) */
export default function ManualEntry({ params }: { params?: Record<string, unknown> }) {
  const editId = params?.editId as string | undefined
  const type = (params?.type as EntryTypeKey) ?? 'PURCHASE'
  const initial: DraftFormValue = emptyDraft(type)

  if (editId) {
    return (
      <EntryDraftForm
        initial={initial}
        editId={editId}
        title="ویرایش ثبت"
        subtitle="پس از ذخیره، نسخه جدید ایجاد می‌شود"
      />
    )
  }

  return (
    <EntryDraftForm
      initial={initial}
      title={ENTRY_TYPES[type]}
      subtitle="فرم کوتاه — کمتر از ۳۰ ثانیه"
    />
  )
}
