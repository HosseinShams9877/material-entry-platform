import type { PurchaseRequest } from '@prisma/client'
import { isPurchaseOverdue } from '@/lib/permissions'

// ─────────────────────────── مالی ساده — محاسبات پرداخت و بدهی ───────────────────────────
// طبق سند سیستم یکپارچه (پرداخت، سررسید و بدهی): وضعیت هر خرید از نسبت
// مجموع پرداخت‌ها به مبلغ کل به‌دست می‌آید. خرید بدون مبلغ ثبت‌شده، وضعیت مالی ندارد.

export type PurchasePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'

export interface PurchasePaymentInfo {
  paidAmount: string // مجموع پرداخت‌ها (تومان)
  remainingAmount: string | null // ماندهٔ بدهی — فقط وقتی مبلغ کل ثبت شده باشد
  paymentStatus: PurchasePaymentStatus | null // بدون مبلغ کل → null
  isOverdue: boolean // سررسید گذشته و پرداخت‌نشده
  paymentsCount: number
}

export function computePaymentInfo(
  purchase: Pick<PurchaseRequest, 'totalAmount' | 'dueDate'> & {
    payments?: Array<{ amount: bigint }>
  }
): PurchasePaymentInfo {
  const paid = (purchase.payments ?? []).reduce((a, p) => a + p.amount, 0n)
  const total = purchase.totalAmount
  const remaining = total != null ? (total - paid > 0n ? total - paid : 0n) : null
  let status: PurchasePaymentStatus | null = null
  if (total != null) {
    if (paid === 0n) status = 'UNPAID'
    else if (remaining !== null && remaining === 0n) status = 'PAID'
    else status = 'PARTIAL'
  }
  return {
    paidAmount: paid.toString(),
    remainingAmount: remaining !== null ? remaining.toString() : null,
    paymentStatus: status,
    isOverdue: isPurchaseOverdue(purchase.dueDate, remaining === null ? 0 : Number(remaining)),
    paymentsCount: purchase.payments?.length ?? 0,
  }
}

/** قالب نمایشی مبلغ تومانی — برای اعلان‌ها و لاگ‌ها */
export function formatToman(amount: bigint): string {
  return amount.toLocaleString('fa-IR')
}
