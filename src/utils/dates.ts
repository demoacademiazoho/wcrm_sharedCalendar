const pad = (n: number) => String(n).padStart(2, '0')

// Converte uma Date para o formato que o CRM aceita: 2026-11-12T09:30:00+00:00
export function toZohoDateTime(date: Date): string {
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

// Só a data (campos Data do CRM): 2026-11-12
export const toZohoDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const addDays = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)

// 'yyyy-MM-dd' -> Date local às 00:00
export const parseDay = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00`)
