/** 金额统一以分存储，展示端转元（去掉无意义的 .00） */
export function fenToYuan(fen?: number | null): string {
  const value = Number(fen || 0) / 100
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export function formatMoney(fen?: number | null): string {
  return `¥${fenToYuan(fen)}`
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 本地时区的 YYYY-MM-DD，避免 toISOString 的 UTC 偏移 */
export function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function formatDate(value?: string | null): string {
  if (!value) return '--'
  return String(value).slice(0, 10).replace(/-/g, '.')
}

export function formatDateTime(value?: string | null): string {
  const date = parseDateOnly(value)
  if (!date) return '--'
  if (String(value).length <= 10) return formatDate(value)
  const time = new Date(value as string)
  if (Number.isNaN(time.getTime())) return formatDate(value)
  return `${formatDate(value)} ${pad2(time.getHours())}:${pad2(time.getMinutes())}`
}

/** 与后端 monthsBetween 完全一致：整月数，不足整月按 1 个月计 */
export function monthsBetween(start: string, end: string): number {
  const s = parseDateOnly(start)
  const e = parseDateOnly(end)
  if (!s || !e) return 0
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() > s.getDate()) months += 1
  return Math.max(1, months)
}

/** 与后端 addMonths 一致：月末日期自动取目标月最后一天 */
export function addMonthsToDate(value: string, months: number): string {
  const base = parseDateOnly(value)
  if (!base) return value
  const targetIndex = base.getMonth() + months
  const targetYear = base.getFullYear() + Math.floor(targetIndex / 12)
  const targetMonth = ((targetIndex % 12) + 12) % 12
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
  const targetDay = Math.min(base.getDate(), lastDay)
  return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(targetDay)}`
}

/** 日期字符串比较（YYYY-MM-DD 字典序即时间序） */
export function isDateAfter(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false
  return String(left).slice(0, 10) > String(right).slice(0, 10)
}

export function laterDate(a: string, b: string): string {
  return isDateAfter(a, b) ? a : b
}
