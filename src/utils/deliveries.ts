import type { ZohoInterface } from '@/interfaces/zohoInterface'
import type { Delivery } from '@/interfaces/delivery'

declare const ZOHO: ZohoInterface

const MODULE = 'Deliveries_Pickups'
const PAGE_SIZE = 200 // limite da COQL por pedido

// Converte uma Date para o formato que o CRM aceita: 2026-11-12T09:30:00+00:00
export function toZohoDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

// Lê só as entregas/recolhas do período visível no calendário
export async function getDeliveries(start: Date, end: Date): Promise<Delivery[]> {
  const result: Delivery[] = []
  let offset = 0
  let more = true

  while (more) {
    const query =
      'select id, Name, Logistics_Type, Logistics_Status, Scheduled_DateTime, ' +
      'Responsible, Vehicle, Address, Reservation ' +
      `from ${MODULE} ` +
      `where Scheduled_DateTime between '${toZohoDateTime(start)}' and '${toZohoDateTime(end)}' ` +
      `order by Scheduled_DateTime asc limit ${offset}, ${PAGE_SIZE}`

    const response = await ZOHO.CRM.API.coql({ select_query: query })
    // Sem resultados, a COQL pode devolver vazio (não é erro)
    const rows: Delivery[] = response?.data ?? []
    result.push(...rows)
    more = Boolean(response?.info?.more_records)
    offset += PAGE_SIZE
  }
  return result
}

export interface RescheduleResult {
  ok: boolean
  message: string // mensagem devolvida pela função do CRM quando recusa o reagendamento
}

// Nome API da função autónoma criada no CRM (Hub de programador > Funções)
const RESCHEDULE_FUNCTION = 'fn_reagendar_entrega_recolha'

// O reagendamento NÃO é gravado aqui com updateRecord: as regras de validação do CRM
// não se aplicam a gravações por API, por isso chamamos uma função Deluge no CRM que
// valida (estado, data no passado) e só depois grava. Assim a validação fica no backend.
// A função devolve texto no formato "OK|mensagem" ou "ERRO|mensagem".
export async function rescheduleDelivery(id: string, newDate: Date): Promise<RescheduleResult> {
  try {
    const response = await ZOHO.CRM.FUNCTIONS.execute(RESCHEDULE_FUNCTION, {
      // os argumentos da função Deluge seguem como um JSON dentro de "arguments"
      arguments: JSON.stringify({ recordId: id, newDateTime: toZohoDateTime(newDate) }),
    })
    const output: string = response?.details?.output ?? ''
    if (response?.code !== 'success' || !output) {
      return { ok: false, message: 'O CRM não respondeu ao reagendamento.' }
    }
    // Separa "OK|texto" ou "ERRO|texto" (o texto pode conter outros | por isso juntamos o resto)
    const [status, ...rest] = output.split('|')
    return { ok: status === 'OK', message: rest.join('|') }
  } catch (error) {
    const message = (error as { message?: string })?.message
    return { ok: false, message: message ?? 'Erro ao comunicar com o CRM.' }
  }
}
