/**
 * Leitura (COQL) e escrita (funções do CRM) do Calendário partilhado.
 * Campos confirmados no CRM (getFields, só leitura): Deliveries_Pickups, Reservations, Reservation_Items,
 * Equipment_Units, Inspections (14/11/2026) e Maintenances, Reservations (Pre_Reservation_Expiry) e Quotes
 * (Valid_Till, Quote_Stage) a 16/11/2026.
 * Hipóteses por validar no CRM real estão marcadas com "HIPÓTESE".
 */
import type { ZohoInterface } from '@/interfaces/zohoInterface'
import type { CalContext, CalEvent, ModuleKey, TabKey } from '@/interfaces/calendar'
import type { Booking, DealRef, Equipment, EquipmentAvailability, EquipmentRequestPayload, Party, Unit, UnitAvailability } from '@/interfaces/availability'
import { addDays, parseDay, toZohoDate, toZohoDateTime } from '@/utils/dates'
import { MOCK_ACCOUNTS, MOCK_BOOKINGS, MOCK_CONTACTS, MOCK_DEALS, MOCK_EQUIPMENTS, MOCK_UNITS, mockEvents } from '@/utils/mock'
import { MODULES, MODULE_ORDER, isFinal, overlapsDay } from '@/config/modules'
import { useSessionStore } from '@/stores/session'

declare const ZOHO: ZohoInterface

const PAGE_SIZE = 200 // limite da COQL por pedido
const IN_LIMIT = 50 // HIPÓTESE: a COQL aceita no máximo 50 valores num "in"
const DEBUG = false // true = escreve na consola os pedidos e respostas

const log = (...a: unknown[]) => DEBUG && console.log('[calendar]', ...a)

// --- utilitários sobre as respostas da COQL ---------------------------------------------------

// Um lookup pode vir como texto, como { id, name } ou vazio
function lookupName(v: any): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.name || v.Name || v.full_name || ''
}

// Campos relacionados (ex.: Account.Account_Name) podem vir com a chave plana ou aninhada
function related(r: any, lookup: string, field: string): string {
  const v = r[`${lookup}.${field}`] ?? r[lookup]?.[field]
  return v ? String(v) : ''
}

const fullName = (r: any, lookup: string, first: string, last: string) =>
  `${related(r, lookup, first)} ${related(r, lookup, last)}`.trim() || lookupName(r[lookup])

const idOf = (r: any, lookup: string) => related(r, lookup, 'id') || r[lookup]?.id || ''

async function coqlAll(select: string, from: string, where: string, order: string, label: string): Promise<any[]> {
  const rows: any[] = []
  let offset = 0
  let more = true
  while (more) {
    const query = `select ${select} from ${from} where ${where} order by ${order} limit ${offset}, ${PAGE_SIZE}`
    log(query)
    try {
      const res = await ZOHO.CRM.API.coql({ select_query: query })
      // Sem resultados, a COQL pode devolver vazio (não é erro)
      rows.push(...(res?.data ?? []))
      more = Boolean(res?.info?.more_records)
    } catch (error) {
      console.error(`[calendário] COQL recusada em ${label}:`, query, error)
      throw error
    }
    offset += PAGE_SIZE
  }
  return rows
}

async function coql(query: string, label = 'consulta'): Promise<any[]> {
  log(query)
  try {
    const res = await ZOHO.CRM.API.coql({ select_query: query })
    return res?.data ?? []
  } catch (error) {
    console.error(`[calendário] COQL recusada em ${label}:`, query, error)
    throw error
  }
}

const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const inList = (ids: string[]) => ids.map((i) => `'${i}'`).join(',')
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '')

const userSel = (f: string) => `${f}.first_name, ${f}.last_name, ${f}.id`
const blank = (): Omit<CalEvent, 'id' | 'module' | 'code' | 'kind' | 'status' | 'start' | 'allDay' | 'entity'> => ({
  end: undefined, ownerId: '', ownerName: '', vehicle: '', client: '', clientId: '', contactId: '', city: '', address: '', reservation: null,
  unit: '', unitId: '', equipment: '', category: '', validUntil: '', value: null, rows: [],
})

function refOf(r: any, lookup: string, nameField: string) {
  const id = idOf(r, lookup)
  return id ? { id: String(id), name: related(r, lookup, nameField) || lookupName(r[lookup]) } : null
}

// --- contexto (ficha da Reserva, do Cliente/Empresa ou da Unidade) ---------------------------------

/** Reservas relacionadas com o contexto (para filtrar Entregas, Inspeções e Reservas) */
async function contextReservationIds(ctx: CalContext): Promise<string[]> {
  if (ctx.entity === 'Reservations') return [ctx.id]
  if (ctx.entity === 'Accounts' || ctx.entity === 'Contacts') {
    const field = ctx.entity === 'Accounts' ? 'Account' : 'Contact'
    const rows = await coql(`select id from Reservations where ${field} = '${ctx.id}' limit 0, 200`, 'contexto: reservas do cliente')
    return rows.map((r) => r.id)
  }
  const rows = await coql(`select Reservation.id from Reservation_Items where Unit = '${ctx.id}' limit 0, 200`, 'contexto: reservas da unidade')
  return [...new Set(rows.map((r) => idOf(r, 'Reservation')).filter(Boolean))]
}

// --- leitura dos eventos de cada módulo -------------------------------------------------------

type Reader = (start: Date, end: Date, ctx: CalContext | null) => Promise<CalEvent[]>

/** Lê com uma condição por cada grupo de reservas do contexto (a COQL limita o "in") */
async function readByReservations(ctx: CalContext, make: (ids: string[]) => Promise<any[]>): Promise<any[]> {
  const ids = await contextReservationIds(ctx)
  const out: any[] = []
  for (const part of chunk(ids, IN_LIMIT)) out.push(...(await make(part)))
  return out
}

const readDeliveries: Reader = async (start, end, ctx) => {
  const select =
    'id, Name, Logistics_Type, Logistics_Status, Scheduled_DateTime, Vehicle, ' +
    `${userSel('Responsible')}, Delivery_Address_City, Reservation.Name, Reservation.id`
  const range = `Scheduled_DateTime between '${toZohoDateTime(start)}' and '${toZohoDateTime(end)}'`
  const rows = ctx
    ? await readByReservations(ctx, (ids) => coqlAll(select, 'Deliveries_Pickups', `Reservation in (${inList(ids)}) and ${range}`, 'Scheduled_DateTime asc', 'Entregas e Recolhas'))
    : await coqlAll(select, 'Deliveries_Pickups', range, 'Scheduled_DateTime asc', 'Entregas e Recolhas')
  return rows.map((r) => ({
    ...blank(),
    id: r.id,
    module: 'deliveries' as const,
    code: r.Name ?? '',
    kind: r.Logistics_Type ?? '',
    status: r.Logistics_Status ?? '',
    start: r.Scheduled_DateTime,
    allDay: false,
    entity: 'Deliveries_Pickups',
    ownerId: idOf(r, 'Responsible'),
    ownerName: fullName(r, 'Responsible', 'first_name', 'last_name'),
    vehicle: r.Vehicle ?? '',
    city: r.Delivery_Address_City ?? '',
    // Delivery_Address é de texto longo (a COQL pode recusar); a morada completa abre-se no registo do CRM
    reservation: refOf(r, 'Reservation', 'Name'),
  }))
}

const readInspections: Reader = async (start, end, ctx) => {
  const select =
    'id, Name, Inspection_Type, Inspection_Status, Inspection_DateTime, ' + `${userSel('Inspector')}, Unit.Name, Unit.id, Reservation.Name, Reservation.id`
  const range = `Inspection_DateTime between '${toZohoDateTime(start)}' and '${toZohoDateTime(end)}'`
  let rows: any[]
  if (!ctx) rows = await coqlAll(select, 'Inspections', range, 'Inspection_DateTime asc', 'Inspeções')
  else if (ctx.entity === 'Equipment_Units') rows = await coqlAll(select, 'Inspections', `Unit = '${ctx.id}' and ${range}`, 'Inspection_DateTime asc', 'Inspeções')
  else rows = await readByReservations(ctx, (ids) => coqlAll(select, 'Inspections', `Reservation in (${inList(ids)}) and ${range}`, 'Inspection_DateTime asc', 'Inspeções'))
  return rows.map((r) => ({
    ...blank(),
    id: r.id,
    module: 'inspections' as const,
    code: r.Name ?? '',
    kind: r.Inspection_Type ?? '',
    status: r.Inspection_Status ?? '',
    start: r.Inspection_DateTime,
    allDay: false,
    entity: 'Inspections',
    ownerId: idOf(r, 'Inspector'),
    ownerName: fullName(r, 'Inspector', 'first_name', 'last_name'),
    unit: related(r, 'Unit', 'Name') || lookupName(r.Unit),
    unitId: idOf(r, 'Unit'),
    reservation: refOf(r, 'Reservation', 'Name'),
  }))
}

const readReservations: Reader = async (start, end, ctx) => {
  const select =
    'id, Name, Reservation_Status, Start_Date, End_Date, Delivery_Address_City, Total_Amount, Pre_Reservation_Expiry, ' +
    `Account.id, Account.Account_Name, Contact.id, Contact.First_Name, Contact.Last_Name, ${userSel('Owner')}`
  const range = `Start_Date <= '${toZohoDate(end)}' and End_Date >= '${toZohoDate(start)}'`
  const rows = ctx
    ? await readByReservations(ctx, (ids) => coqlAll(select, 'Reservations', `id in (${inList(ids)}) and ${range}`, 'Start_Date asc', 'Reservas'))
    : await coqlAll(select, 'Reservations', range, 'Start_Date asc', 'Reservas')
  return rows.map((r) => ({
    ...blank(),
    id: r.id,
    module: 'reservations' as const,
    code: r.Name ?? '',
    kind: '',
    status: r.Reservation_Status ?? '',
    start: String(r.Start_Date).slice(0, 10),
    end: String(r.End_Date).slice(0, 10),
    allDay: true,
    entity: 'Reservations',
    ownerId: idOf(r, 'Owner'),
    ownerName: fullName(r, 'Owner', 'first_name', 'last_name'),
    client: related(r, 'Account', 'Account_Name') || fullName(r, 'Contact', 'First_Name', 'Last_Name') || lookupName(r.Account) || lookupName(r.Contact),
    clientId: idOf(r, 'Account'),
    contactId: idOf(r, 'Contact'),
    city: r.Delivery_Address_City ?? '',
    reservation: { id: r.id, name: r.Name ?? '' },
    validUntil: r.Pre_Reservation_Expiry ?? '',
    value: r.Total_Amount ?? null,
    rows: r.Total_Amount != null ? [['Valor total', `${r.Total_Amount} €`]] : [],
  }))
}

const MAINT_DONE = ['Concluída', 'Cancelada']

const readMaintenances: Reader = async (start, end, ctx) => {
  if (ctx && ctx.entity !== 'Equipment_Units') return [] // as Manutenções só se ligam à Unidade
  const s = toZohoDate(start)
  const e = toZohoDate(end)
  const select =
    'id, Name, Maintenance_Type, Maintenance_Status, Planned_Date, Start_Date, Expected_Completion_Date, Completion_Date, ' + `${userSel('Technician')}, Unit.Name, Unit.id`
  // A COQL recusou o "or" entre parênteses ("error occured while parsing the query"): lê-se uma vez por cada data
  // da manutenção (Planeada, Início, Fim previsto, Conclusão) e juntam-se os resultados sem repetir o registo.
  const byId = new Map<string, any>()
  for (const field of ['Planned_Date', 'Start_Date', 'Expected_Completion_Date', 'Completion_Date']) {
    const range = `${field} between '${s}' and '${e}'`
    const where = ctx ? `Unit = '${ctx.id}' and ${range}` : range
    const part = await coqlAll(select, 'Maintenances', where, `${field} asc`, 'Manutenções')
    for (const r of part) byId.set(r.id, r)
  }
  const rows = [...byId.values()].sort((x, y) => String(x.Planned_Date ?? '').localeCompare(String(y.Planned_Date ?? '')))
  const events: CalEvent[] = rows.map((r) => {
    const from = String(r.Start_Date || r.Planned_Date || r.Expected_Completion_Date || r.Completion_Date).slice(0, 10)
    const to = String(r.Completion_Date || r.Expected_Completion_Date || from).slice(0, 10)
    return {
      ...blank(),
      id: r.id,
      module: 'maintenances' as const,
      code: r.Name ?? '',
      kind: r.Maintenance_Type ?? '',
      status: r.Maintenance_Status ?? '',
      start: from,
      end: to < from ? from : to,
      allDay: true,
      entity: 'Maintenances',
      ownerId: idOf(r, 'Technician'),
      ownerName: fullName(r, 'Technician', 'first_name', 'last_name'),
      unit: related(r, 'Unit', 'Name') || lookupName(r.Unit),
      unitId: idOf(r, 'Unit'),
    }
  })
  await maintenanceExtras(events)
  return events
}

// Dados só para o detalhe (fornecedor, inspeção de origem): se a COQL recusar, o calendário não falha
async function maintenanceExtras(events: CalEvent[]): Promise<void> {
  try {
    for (const part of chunk(events.map((e) => e.id), IN_LIMIT)) {
      const rows = await coql(`select id, Vendor.Vendor_Name, Source_Inspection.Name from Maintenances where id in (${inList(part)}) limit 0, ${IN_LIMIT}`, 'Manutenções: detalhe')
      for (const r of rows) {
        const ev = events.find((x) => x.id === r.id)
        if (ev) ev.rows = [['Fornecedor de peças', related(r, 'Vendor', 'Vendor_Name') || lookupName(r.Vendor) || '—'], ['Inspeção de origem', related(r, 'Source_Inspection', 'Name') || lookupName(r.Source_Inspection) || '—']]
      }
    }
  } catch (error) {
    console.warn('[calendário] detalhe das Manutenções indisponível', error)
  }
}

// Fases (Oportunidades) e estados (Orçamentos, Tarefas) agrupados nos estados do Comercial.
// HIPÓTESE: as fases das Oportunidades começam por "Ganho"/"Perdido" quando fecham (nomes abreviados na injeção).
const dealStatus = (stage: string) => (/^ganho/i.test(stage) ? 'Ganho' : /^perdido/i.test(stage) ? 'Perdido' : /negoci|propost/i.test(stage) ? 'Em negociação' : 'Em aberto')
const quoteStatus = (stage: string) => (/^(aceite|confirmado|entregue|ganho)/i.test(stage) ? 'Ganho' : /^(rejeitado|perda)/i.test(stage) ? 'Perdido' : /^expirado/i.test(stage) ? 'Expirado' : /negoci|revis/i.test(stage) ? 'Em negociação' : 'Em aberto')
const taskStatus = (status: string) => (/conclu|complet|feit/i.test(status) ? 'Concluída' : 'Por fazer')

const readCommercial: Reader = async (start, end, ctx) => {
  if (ctx && (ctx.entity === 'Reservations' || ctx.entity === 'Equipment_Units')) return [] // sem ligação direta
  const range = (f: string) => `${f} between '${toZohoDate(start)}' and '${toZohoDate(end)}'`
  const ctxDeal = ctx ? ` and ${ctx.entity === 'Accounts' ? 'Account_Name' : 'Contact_Name'} = '${ctx.id}'` : ''
  const events: CalEvent[] = []
  const failed: string[] = []
  // HIPÓTESE: nomes nativos Deals (Closing_Date, Stage, Amount, Deal_Name, Account_Name, Contact_Name) e Tasks (Due_Date, Status, Subject)
  const jobs: [string, () => Promise<void>][] = [
    [
      'Oportunidades',
      async () => {
        const rows = await coqlAll(
          `id, Deal_Name, Stage, Closing_Date, Amount, Account_Name.id, Account_Name.Account_Name, Contact_Name.id, ${userSel('Owner')}`,
          'Deals', range('Closing_Date') + ctxDeal, 'Closing_Date asc', 'Comercial: Oportunidades',
        )
        for (const r of rows)
          events.push({
            ...blank(), id: r.id, module: 'commercial', code: r.Deal_Name ?? '', kind: 'Fecho previsto', status: dealStatus(r.Stage ?? ''),
            start: String(r.Closing_Date).slice(0, 10), allDay: true, entity: 'Deals', ownerId: idOf(r, 'Owner'),
            ownerName: fullName(r, 'Owner', 'first_name', 'last_name'), client: related(r, 'Account_Name', 'Account_Name') || lookupName(r.Account_Name),
            clientId: idOf(r, 'Account_Name'), contactId: idOf(r, 'Contact_Name'), value: r.Amount ?? null, rows: [['Fase', r.Stage ?? '—']],
          })
      },
    ],
    [
      'Pedidos de Orçamento',
      async () => {
        const rows = await coqlAll(
          `id, Subject, Quote_Stage, Valid_Till, Account_Name.id, Account_Name.Account_Name, Contact_Name.id, ${userSel('Owner')}`,
          'Quotes', range('Valid_Till') + ctxDeal, 'Valid_Till asc', 'Comercial: Pedidos de Orçamento',
        )
        for (const r of rows)
          events.push({
            ...blank(), id: r.id, module: 'commercial', code: r.Subject ?? '', kind: 'Validade do orçamento', status: quoteStatus(r.Quote_Stage ?? ''),
            start: String(r.Valid_Till).slice(0, 10), allDay: true, entity: 'Quotes', ownerId: idOf(r, 'Owner'),
            ownerName: fullName(r, 'Owner', 'first_name', 'last_name'), client: related(r, 'Account_Name', 'Account_Name') || lookupName(r.Account_Name),
            clientId: idOf(r, 'Account_Name'), contactId: idOf(r, 'Contact_Name'), rows: [['Fase do orçamento', r.Quote_Stage ?? '—']],
          })
      },
    ],
  ]
  if (!ctx)
    jobs.push([
      'Tarefas',
      async () => {
        const rows = await coqlAll(`id, Subject, Status, Due_Date, ${userSel('Owner')}`, 'Tasks', range('Due_Date'), 'Due_Date asc', 'Comercial: Tarefas')
        for (const r of rows)
          events.push({
            ...blank(), id: r.id, module: 'commercial', code: r.Subject ?? '', kind: 'Follow-up', status: taskStatus(r.Status ?? ''),
            start: String(r.Due_Date).slice(0, 10), allDay: true, entity: 'Tasks', ownerId: idOf(r, 'Owner'),
            ownerName: fullName(r, 'Owner', 'first_name', 'last_name'), rows: [['Estado da tarefa', r.Status ?? '—']],
          })
      },
    ])
  const results = await Promise.allSettled(jobs.map(([, f]) => f()))
  results.forEach((r, i) => r.status === 'rejected' && failed.push(jobs[i]![0]))
  if (failed.length === jobs.length) throw new Error('Comercial: leitura recusada pelo CRM.')
  if (failed.length) partialFailures.push(`Comercial (${failed.join(', ')})`)
  return events
}

// Falhas parciais da leitura em curso (ex.: só as Tarefas falharam): o calendário mostra o resto e avisa
let partialFailures: string[] = []

const READERS: Record<ModuleKey, Reader> = {
  deliveries: readDeliveries,
  inspections: readInspections,
  reservations: readReservations,
  maintenances: readMaintenances,
  commercial: readCommercial,
}

// Cliente e Localidade vêm da Reserva; equipamento, unidade e categoria vêm da Unidade (Entregas e Inspeções)
async function enrichFromReservations(events: CalEvent[]): Promise<void> {
  const targets = events.filter((e) => e.reservation && e.module !== 'reservations')
  const ids = [...new Set(targets.map((e) => e.reservation!.id))]
  if (!ids.length) return
  const info = new Map<string, { client: string; clientId: string; contactId: string; city: string }>()
  for (const part of chunk(ids, IN_LIMIT)) {
    const rows = await coql(
      'select id, Delivery_Address_City, Account.id, Account.Account_Name, Contact.id, Contact.First_Name, Contact.Last_Name ' +
        `from Reservations where id in (${inList(part)}) limit 0, ${IN_LIMIT}`,
      'Reservas: cliente e localidade',
    )
    for (const r of rows)
      info.set(r.id, {
        client: related(r, 'Account', 'Account_Name') || fullName(r, 'Contact', 'First_Name', 'Last_Name') || lookupName(r.Account),
        clientId: idOf(r, 'Account'),
        contactId: idOf(r, 'Contact'),
        city: r.Delivery_Address_City ?? '',
      })
  }
  for (const e of targets) {
    const i = info.get(e.reservation!.id)
    if (!i) continue
    e.client = e.client || i.client
    e.clientId = e.clientId || i.clientId
    e.contactId = e.contactId || i.contactId
    e.city = e.city || i.city
  }
}

/** Equipamento, categoria (e unidade, nas Reservas e Entregas) a partir dos Itens de Reserva e das Unidades. Não é fatal. */
async function enrichEquipment(events: CalEvent[]): Promise<void> {
  try {
    // 1) Reservas e Entregas: Itens de Reserva (HIPÓTESE: Reservation_Items tem os lookups Equipment e Unit)
    const resIds = [...new Set(events.filter((e) => e.module !== 'inspections' && e.module !== 'maintenances' && e.reservation).map((e) => e.reservation!.id))]
    const byRes = new Map<string, { equip: Set<string>; units: Map<string, string> }>()
    for (const part of chunk(resIds, IN_LIMIT)) {
      const rows = await coql(`select Reservation.id, Equipment.Product_Name, Unit.Name, Unit.id from Reservation_Items where Reservation in (${inList(part)}) limit 0, 200`, 'Itens de Reserva')
      for (const r of rows) {
        const k = idOf(r, 'Reservation')
        const slot = byRes.get(k) ?? { equip: new Set<string>(), units: new Map<string, string>() }
        const en = related(r, 'Equipment', 'Product_Name') || lookupName(r.Equipment)
        if (en) slot.equip.add(en)
        const uid = idOf(r, 'Unit')
        if (uid) slot.units.set(uid, related(r, 'Unit', 'Name') || lookupName(r.Unit))
        byRes.set(k, slot)
      }
    }
    for (const e of events) {
      const s = e.reservation ? byRes.get(e.reservation.id) : undefined
      if (!s || e.module === 'inspections' || e.module === 'maintenances') continue
      e.equipment = e.equipment || [...s.equip].join(', ')
      if (!e.unit) {
        e.unit = [...s.units.values()].join(', ')
        e.unitId = [...s.units.keys()].join(',')
      }
    }
    // 2) Inspeções e Manutenções: equipamento e categoria vêm da Unidade
    const unitIds = [...new Set(events.filter((e) => e.unitId && !e.unitId.includes(',')).map((e) => e.unitId))]
    const equipOfUnit = new Map<string, { name: string; id: string }>()
    for (const part of chunk(unitIds, IN_LIMIT)) {
      const rows = await coql(`select id, Equipment.id, Equipment.Product_Name from Equipment_Units where id in (${inList(part)}) limit 0, ${IN_LIMIT}`, 'Unidades: equipamento')
      for (const r of rows) equipOfUnit.set(r.id, { id: idOf(r, 'Equipment'), name: related(r, 'Equipment', 'Product_Name') || lookupName(r.Equipment) })
    }
    for (const e of events) {
      const u = equipOfUnit.get(e.unitId)
      if (u) e.equipment = e.equipment || u.name
    }
    // 3) Categoria do equipamento (HIPÓTESE: Products.Product_Category)
    const names = [...new Set(events.map((e) => e.equipment).filter((n) => n && !n.includes(', ')))]
    if (names.length) {
      const rows: any[] = []
      for (const part of chunk(names, IN_LIMIT)) rows.push(...(await coql(`select Product_Name, Product_Category from Products where Product_Name in (${part.map((n) => `'${esc(n)}'`).join(',')}) limit 0, ${IN_LIMIT}`, 'Produtos: categoria')))
      const cat = new Map(rows.map((r) => [r.Product_Name, r.Product_Category ?? '']))
      for (const e of events) e.category = e.category || cat.get(e.equipment) || ''
    }
  } catch (error) {
    console.warn('[calendário] equipamento/categoria indisponíveis (filtros Categoria e Unidade podem ficar vazios)', error)
  }
}

// Modo demonstração: aplica o período e o contexto aos dados fictícios
function matchesCtx(e: CalEvent, ctx: CalContext | null): boolean {
  if (!ctx) return true
  if (ctx.entity === 'Reservations') return e.reservation?.id === ctx.id
  if (ctx.entity === 'Accounts') return e.clientId === ctx.id
  if (ctx.entity === 'Contacts') return e.contactId === ctx.id
  return e.unitId.split(',').includes(ctx.id)
}

function mockRead(module: ModuleKey, start: Date, end: Date, ctx: CalContext | null): CalEvent[] {
  return mockEvents[module].filter((e) => {
    const s = new Date(e.allDay ? `${e.start}T00:00:00` : e.start)
    const f = new Date(e.allDay && e.end ? `${e.end}T23:59:59` : e.allDay ? `${e.start}T23:59:59` : e.start)
    return s <= end && f >= start && matchesCtx(e, ctx)
  })
}

export interface LoadResult {
  events: CalEvent[]
  /** módulos (ou fontes) cuja leitura falhou; o resto é mostrado */
  failed: string[]
}

async function readModule(module: ModuleKey, start: Date, end: Date, ctx: CalContext | null): Promise<CalEvent[]> {
  if (useSessionStore().mock) {
    await new Promise((r) => setTimeout(r, 350)) // simula a latência do CRM
    return mockRead(module, start, end, ctx)
  }
  const events = await READERS[module](start, end, ctx)
  if (module !== 'reservations') await enrichFromReservations(events)
  await enrichEquipment(events)
  return events
}

/** Lê os eventos do separador para o período visível. A Visão geral junta todos os módulos. */
export async function getEvents(tab: TabKey, start: Date, end: Date, ctx: CalContext | null): Promise<LoadResult> {
  partialFailures = []
  if (tab !== 'overview') return { events: await readModule(tab, start, end, ctx), failed: [] }
  const results = await Promise.allSettled(MODULE_ORDER.map((m) => readModule(m, start, end, ctx)))
  const events: CalEvent[] = []
  const failed: string[] = []
  results.forEach((r, i) => (r.status === 'fulfilled' ? events.push(...r.value) : failed.push(MODULES[MODULE_ORDER[i]!].tab)))
  if (failed.length === MODULE_ORDER.length) throw new Error('Nenhum módulo respondeu.')
  return { events, failed: [...failed, ...partialFailures] }
}

/** Nº de registos de hoje de cada separador (estados ocultos por defeito não contam) */
export async function getTodayCounts(ctx: CalContext | null): Promise<Record<TabKey, number | null>> {
  const t = new Date()
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59)
  const out = { overview: null as number | null } as Record<TabKey, number | null>
  const results = await Promise.allSettled(MODULE_ORDER.map((m) => readModule(m, start, end, ctx)))
  let total: number | null = 0
  results.forEach((r, i) => {
    const m = MODULE_ORDER[i]!
    if (r.status === 'rejected') {
      out[m] = null
      total = null
      return
    }
    const hidden = MODULES[m].statuses.filter((s) => s.hidden).map((s) => s.name)
    out[m] = r.value.filter((e) => overlapsDay(e, start) && !hidden.includes(e.status)).length
    if (total !== null) total += out[m]!
  })
  out.overview = total
  return out
}

// --- reagendar e reatribuir -------------------------------------------------------------------

export interface MoveResult {
  ok: boolean
  message: string
}

// Funções autónomas no CRM (Hub de programador > Funções). Só a primeira existe; as outras estão por criar
// (ver docs/funcoes_a_criar_no_crm.md). Enquanto não existirem, o CRM recusa e o widget mostra a mensagem.
const RESCHEDULE_FUNCTIONS: Record<ModuleKey, string> = {
  deliveries: 'fn_reagendar_entrega_recolha',
  inspections: 'fn_reagendar_inspecao',
  maintenances: 'fn_reagendar_manutencao',
  reservations: 'fn_reagendar_reserva',
  commercial: 'fn_reagendar_comercial',
}
const ASSIGN_FUNCTIONS: Partial<Record<ModuleKey, string>> = {
  deliveries: 'fn_atribuir_logistica', // Responsável e Viatura
  inspections: 'fn_atribuir_inspetor',
  maintenances: 'fn_atribuir_tecnico',
}

async function callFunction(name: string, args: Record<string, unknown>): Promise<MoveResult> {
  try {
    const response = await ZOHO.CRM.FUNCTIONS.execute(name, { arguments: JSON.stringify(args) })
    const output: string = response?.details?.output ?? ''
    if (response?.code !== 'success' || !output) {
      // Mostra o que o CRM devolveu (código e mensagem) em vez de uma mensagem genérica, e regista a resposta completa na consola
      console.error(`[calendário] função ${name} sem resultado`, response)
      const detail = [response?.code, response?.message, response?.details?.userMessage, response?.details?.message].filter(Boolean).join(' | ')
      return { ok: false, message: detail ? `O CRM não executou a operação (${detail}).` : 'O CRM não respondeu.' }
    }
    const [status, ...rest] = output.split('|')
    return { ok: status === 'OK', message: rest.join('|') }
  } catch (error) {
    return { ok: false, message: (error as { message?: string })?.message ?? 'Erro ao comunicar com o CRM.' }
  }
}

const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const MIN90 = 90 * 60000

/** Simula as regras do backend no modo demonstração (no CRM real quem valida é a função Deluge) */
function mockValidate(e: CalEvent, newStart: Date | null, set: { ownerId?: string; vehicle?: string } | null): MoveResult {
  if (isFinal(e)) return { ok: false, message: `Registo "${e.status}" não pode ser alterado.` }
  if (e.status === 'Em curso' && e.module !== 'reservations') return { ok: false, message: 'Registo em curso não pode ser reagendado.' }
  if (newStart) {
    if (sod(newStart) < sod(new Date())) return { ok: false, message: 'Não é possível agendar no passado (VR17).' }
    if (newStart.getDay() === 0 && ['deliveries', 'inspections', 'maintenances'].includes(e.module)) return { ok: false, message: 'Domingo: sem equipa operacional disponível.' }
  }
  const vehicle = set?.vehicle ?? e.vehicle
  if (e.module === 'deliveries' && vehicle && (newStart || set?.vehicle !== undefined)) {
    const at = newStart ?? new Date(e.start)
    const c = mockEvents.deliveries.find((o) => o.id !== e.id && o.vehicle === vehicle && !isFinal(o) && Math.abs(+new Date(o.start) - +at) < MIN90)
    if (c) return { ok: false, message: `${vehicle} já está alocada a ${c.code} às ${new Date(c.start).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}.` }
  }
  if (e.module === 'reservations' && newStart) {
    const days = Math.round((+parseDay(e.end ?? e.start) - +parseDay(e.start)) / 864e5)
    const ns = toZohoDate(newStart)
    const ne = toZohoDate(addDays(newStart, days))
    const c = mockEvents.reservations.find((o) => o.id !== e.id && o.unitId === e.unitId && !['Cancelada', 'Concluída', 'Concluída com avaria', 'Expirada'].includes(o.status) && o.start <= ne && (o.end ?? o.start) >= ns)
    if (c) return { ok: false, message: `A unidade ${e.unit} já está reservada em ${c.code} nesse período (VR21).` }
  }
  return { ok: true, message: '' }
}

/** Reagenda e/ou reatribui. Em ambos os casos a validação é do CRM; se recusar, nada muda no widget. */
export async function moveRecord(e: CalEvent, newStart: Date | null, set: { ownerId?: string; ownerName?: string; vehicle?: string } | null): Promise<MoveResult> {
  const mock = useSessionStore().mock
  if (mock) {
    await new Promise((r) => setTimeout(r, 450))
    const v = mockValidate(e, newStart, set)
    if (!v.ok) return v
    const rec = mockEvents[e.module].find((x) => x.id === e.id)
    if (rec) {
      if (newStart) {
        if (rec.allDay) {
          const days = Math.round((+parseDay(rec.end ?? rec.start) - +parseDay(rec.start)) / 864e5)
          rec.start = toZohoDate(newStart)
          if (rec.end) rec.end = toZohoDate(addDays(newStart, days))
        } else rec.start = toZohoDateTime(newStart)
        if (rec.module === 'deliveries' && rec.status === 'Agendada') rec.status = 'Reagendada'
      }
      if (set?.ownerId !== undefined) {
        rec.ownerId = set.ownerId
        rec.ownerName = set.ownerName ?? ''
      }
      if (set?.vehicle !== undefined) rec.vehicle = set.vehicle
    }
    return { ok: true, message: 'Validado pelo CRM (simulado).' }
  }
  if (newStart) {
    const args: Record<string, unknown> = { recordId: e.id, entity: e.entity }
    if (e.allDay) {
      const days = Math.round((+parseDay(e.end ?? e.start) - +parseDay(e.start)) / 864e5)
      args.newDate = toZohoDate(newStart)
      args.newEndDate = toZohoDate(addDays(newStart, days))
    } else args.newDateTime = toZohoDateTime(newStart)
    // a função das Entregas e Recolhas já existe e recebe recordId e newDateTime
    const r = await callFunction(RESCHEDULE_FUNCTIONS[e.module], e.module === 'deliveries' ? { recordId: e.id, newDateTime: toZohoDateTime(newStart) } : args)
    if (!r.ok) return r
  }
  if (set) {
    const fn = ASSIGN_FUNCTIONS[e.module]
    if (!fn) return { ok: false, message: 'Este módulo não permite atribuir.' }
    const args =
      e.module === 'deliveries'
        ? { recordId: e.id, responsibleId: set.ownerId ?? e.ownerId, vehicle: set.vehicle ?? e.vehicle }
        : { recordId: e.id, [e.module === 'inspections' ? 'inspectorId' : 'technicianId']: set.ownerId ?? e.ownerId }
    const r = await callFunction(fn, args)
    if (!r.ok) return newStart ? { ok: false, message: `A data foi gravada, mas a atribuição foi recusada: ${r.message}` } : r
  }
  return { ok: true, message: 'Gravado no CRM.' }
}

// --- disponibilidade de unidades (separador Reservas) --------------------------------------------

const BLOCKING_ITEM_STATUS = ['Pré-reservado', 'Reservado', 'Entregue'] // = Blocks_Availability = true
const UNAVAILABLE_UNIT_STATUS = ['Em manutenção', 'Avariado', 'Abatido', 'Em inspeção']
const SEARCH_DAYS = 90 // "Livre a partir de": procura nos 90 dias seguintes

/** Texto curto do erro do SDK (objeto { code, message }, Error ou texto) */
function describeError(error: unknown): string {
  const e = error as { message?: string; code?: string; details?: unknown } | string | undefined
  if (!e) return 'erro desconhecido'
  if (typeof e === 'string') return e
  return e.message || e.code || JSON.stringify(e).slice(0, 120)
}

/** Categorias de Equipamento Catálogo que não são alugáveis (serviços de fatura): ficam fora da pesquisa */
const EXCLUDED_CATEGORIES = ['Serviços de fatura']

export async function searchEquipment(q: string): Promise<Equipment[]> {
  const text = q.trim()
  if (text.length < 2) return []
  if (useSessionStore().mock) {
    const n = text.toLowerCase()
    return MOCK_EQUIPMENTS.filter((e) => e.name.toLowerCase().includes(n) && !EXCLUDED_CATEGORIES.includes(e.category))
  }
  // HIPÓTESE: Products.Product_Category e Products.Unit_Price (preço por dia); se a COQL recusar, lê só o nome
  const map = (rows: any[]): Equipment[] => rows.map((r) => ({ id: r.id, name: r.Product_Name, category: r.Product_Category ?? '', dailyPrice: Number(r.Unit_Price ?? 0) }))
  try {
    return (map(await coql(`select id, Product_Name, Product_Category, Unit_Price from Products where Product_Name like '%${esc(text)}%' order by Product_Name asc limit 0, 40`, 'Equipamentos')))
      .filter((e) => !EXCLUDED_CATEGORIES.includes(e.category)).slice(0, 10)
  } catch {
    return map(await coql(`select id, Product_Name from Products where Product_Name like '%${esc(text)}%' order by Product_Name asc limit 0, 10`, 'Equipamentos (só nome)'))
  }
}

const freeBetween = (bookings: Booking[], a: string, b: string) => !bookings.some((x) => x.start <= b && x.end >= a)

/** Primeiro dia (nos 90 seguintes) em que a unidade fica livre durante todo o período pedido */
function findFreeFrom(bookings: Booking[], from: string, to: string): string {
  const len = Math.round((+parseDay(to) - +parseDay(from)) / 864e5)
  for (let d = 1; d <= SEARCH_DAYS; d++) {
    const s = addDays(parseDay(from), d)
    if (freeBetween(bookings, toZohoDate(s), toZohoDate(addDays(s, len)))) return toZohoDate(s)
  }
  return ''
}

/** Unidades de cada equipamento e o estado de cada uma no período (Reservas e Manutenções por concluir) */
export async function getAvailability(equipments: Equipment[], from: string, to: string): Promise<EquipmentAvailability[]> {
  const mock = useSessionStore().mock
  const out: EquipmentAvailability[] = []
  for (const equipment of equipments) {
    let units: Unit[]
    let bookings: Booking[]
    const warnings: string[] = []
    if (mock) {
      units = MOCK_UNITS.filter((u) => u.equipmentId === equipment.id)
      bookings = MOCK_BOOKINGS.filter((b) => (b.kind === 'maintenance' ? !MAINT_DONE.includes(b.status) : BLOCKING_ITEM_STATUS.includes(b.status)))
    } else {
      // Unidades do equipamento (campos confirmados no CRM: Name, Serial_Number, Location, Operational_Status, Equipment)
      const rows = await coql(`select id, Name, Serial_Number, Location, Operational_Status from Equipment_Units where Equipment = '${equipment.id}' order by Name asc limit 0, 100`, 'Unidades do equipamento')
      units = rows.map((r) => ({ id: r.id, code: r.Name, equipmentId: equipment.id, serial: r.Serial_Number ?? '', location: r.Location ?? '', opStatus: r.Operational_Status ?? '' }))
      bookings = []
      // As reservas e manutenções são lidas à parte: se uma leitura falhar, as unidades continuam a aparecer, com aviso.
      // Usam-se só campos simples (os lookups vêm como { id, name }), sem "Campo.subcampo".
      for (const part of chunk(units.map((u) => u.id), IN_LIMIT)) {
        try {
          const items = await coql(
            'select id, Unit, Reservation, Start_Date, End_Date, Item_Status from Reservation_Items ' +
              `where Unit in (${inList(part)}) and End_Date >= '${from}' limit 0, 200`,
            'Itens de Reserva (disponibilidade)',
          )
          // o estado do item é filtrado aqui (Blocks_Availability = Pré-reservado, Reservado ou Entregue)
          bookings.push(
            ...items
              .filter((r) => BLOCKING_ITEM_STATUS.includes(r.Item_Status))
              .map((r): Booking => ({ unitId: idOf(r, 'Unit'), start: String(r.Start_Date).slice(0, 10), end: String(r.End_Date).slice(0, 10), label: lookupName(r.Reservation), status: r.Item_Status, kind: 'reservation', recordId: idOf(r, 'Reservation') })),
          )
        } catch (error) {
          warnings.push(`reservas (${describeError(error)})`)
        }
        try {
          const man = await coql(
            'select id, Name, Unit, Maintenance_Type, Maintenance_Status, Planned_Date, Start_Date, Expected_Completion_Date from Maintenances ' +
              `where Unit in (${inList(part)}) limit 0, 200`,
            'Manutenções (disponibilidade)',
          )
          bookings.push(
            ...man
              .filter((r) => !MAINT_DONE.includes(r.Maintenance_Status))
              .map((r): Booking => {
                const s = String(r.Start_Date || r.Planned_Date || from).slice(0, 10)
                return { unitId: idOf(r, 'Unit'), start: s, end: String(r.Expected_Completion_Date || s).slice(0, 10), label: `${r.Maintenance_Type ?? 'Manutenção'} · ${r.Name ?? ''}`, status: 'Manutenção', kind: 'maintenance', recordId: r.id }
              }),
          )
        } catch (error) {
          warnings.push(`manutenções (${describeError(error)})`)
        }
      }
    }
    const avail: UnitAvailability[] = units.map((unit) => {
      const mine = bookings.filter((b) => b.unitId === unit.id).sort((a, b) => a.start.localeCompare(b.start))
      const clash = mine.find((b) => b.start <= to && b.end >= from)
      if (UNAVAILABLE_UNIT_STATUS.includes(unit.opStatus)) {
        // Estado operacional sem data de fim (Em inspeção, Avariado...): a unidade fica bloqueada até ao fim da última Reserva/Manutenção ativa; sem nenhuma, não há data
        const today = toZohoDate(new Date())
        const ends = mine.filter((b) => b.end >= today).map((b) => b.end).sort()
        if (!ends.length) return { unit, state: 'Em manutenção', free: false, detail: unit.opStatus, freeFrom: '', freeFromNote: 'Sem data prevista' }
        const blocked: Booking = { unitId: unit.id, start: today, end: ends[ends.length - 1]!, label: unit.opStatus, status: unit.opStatus, kind: 'maintenance' }
        return { unit, state: 'Em manutenção', free: false, detail: unit.opStatus, freeFrom: findFreeFrom([...mine, blocked], from, to) }
      }
      if (!clash) return { unit, state: 'Disponível', free: true, detail: '', freeFrom: from }
      const state = clash.kind === 'maintenance' ? 'Em manutenção' : clash.status === 'Pré-reservado' ? 'Pré-reservada' : 'Reservada'
      return { unit, state, free: false, detail: `${clash.label} · ${clash.start} a ${clash.end}`, freeFrom: findFreeFrom(mine, from, to), recordId: clash.recordId }
    })
    out.push({ equipment, units: avail, warning: warnings.length ? `Não foi possível ler: ${[...new Set(warnings)].join('; ')}. A disponibilidade pode não estar correta.` : '' })
  }
  return out
}

// --- pesquisa Cliente / Empresa / Oportunidade e pedido de equipamento ------------------------------

export async function searchParties(kind: 'account' | 'contact', q: string, accountId = ''): Promise<Party[]> {
  const text = q.trim()
  if (text.length < 2) return []
  if (useSessionStore().mock) {
    const n = text.toLowerCase()
    if (kind === 'account') return MOCK_ACCOUNTS.filter((p) => p.name.toLowerCase().includes(n))
    return MOCK_CONTACTS.filter((p) => p.name.toLowerCase().includes(n) && (!accountId || p.accountId === accountId))
  }
  if (kind === 'account') {
    const rows = await coql(`select id, Account_Name from Accounts where Account_Name like '%${esc(text)}%' order by Account_Name asc limit 0, 8`, 'Empresas')
    return rows.map((r) => ({ id: r.id, name: r.Account_Name }))
  }
  const t = esc(text)
  const rows = await coql(`select id, First_Name, Last_Name from Contacts where Last_Name like '%${t}%' or First_Name like '%${t}%' limit 0, 8`, 'Clientes')
  return rows.map((r) => ({ id: r.id, name: `${r.First_Name ?? ''} ${r.Last_Name ?? ''}`.trim() }))
}

/** Cria a Empresa ou o Cliente escolhido na pesquisa (HIPÓTESE: gravação direta com insertRecord) */
export async function createParty(kind: 'account' | 'contact', name: string, accountId = ''): Promise<Party> {
  const n = name.trim()
  if (useSessionStore().mock) {
    const p = { id: `new-${Date.now()}`, name: n }
    if (kind === 'account') MOCK_ACCOUNTS.push(p)
    else MOCK_CONTACTS.push({ ...p, accountId })
    return p
  }
  const parts = n.split(' ')
  const data = kind === 'account' ? { Account_Name: n } : { Last_Name: parts.length > 1 ? parts.slice(1).join(' ') : n, First_Name: parts.length > 1 ? parts[0] : '', ...(accountId ? { Account_Name: accountId } : {}) }
  const res = await (ZOHO.CRM.API as any).insertRecord({ Entity: kind === 'account' ? 'Accounts' : 'Contacts', APIData: data })
  const row = res?.data?.[0]
  if (row?.code !== 'SUCCESS') throw new Error(row?.message || 'O CRM recusou a criação.')
  return { id: row.details.id, name: n }
}

// Fases que fecham a Oportunidade (nomes abreviados na injeção: "Ganho – Reserva confirm.", "Perdido")
const isClosedStage = (stage: string) => /^(ganho|perdido)/i.test(stage.trim())

/** Oportunidades em aberto da Empresa (HIPÓTESE: o lookup da Empresa em Deals tem o API name Account_Name) */
export async function getOpenDealsOf(accountId: string): Promise<DealRef[]> {
  if (!accountId) return []
  if (useSessionStore().mock) return MOCK_DEALS.filter((d) => d.accountId === accountId).map((d) => ({ id: d.id, name: d.name, stage: 'Qualificação' }))
  const rows = await coql(`select id, Deal_Name, Stage from Deals where Account_Name = '${accountId}' order by Created_Time desc limit 0, 50`, 'Oportunidades da Empresa')
  return rows.filter((r) => !isClosedStage(r.Stage ?? '')).map((r) => ({ id: r.id, name: r.Deal_Name, stage: r.Stage ?? '' }))
}

// Nome API da função autónoma que trata do pedido (ver docs/fn_Deals_addEquipmentFromCalendar.deluge)
const ADD_EQUIPMENT_FUNCTION = 'fn_deals_addequipmentfromcalendar'

export async function requestEquipment(p: EquipmentRequestPayload): Promise<MoveResult> {
  if (useSessionStore().mock) {
    await new Promise((r) => setTimeout(r, 500))
    const today = toZohoDate(new Date())
    if (p.items.some((i) => i.start < today)) return { ok: false, message: 'A data de início não pode estar no passado.' }
    return { ok: true, message: p.dealId ? 'Equipamento adicionado ao Pedido de Orçamento em Rascunho da oportunidade (simulação).' : 'Oportunidade criada, com Pedido de Orçamento em Rascunho (simulação).' }
  }
  // Os argumentos da função Deluge são texto: "idUnidade:início:fim" separados por vírgulas (as datas não têm ":")
  return callFunction(ADD_EQUIPMENT_FUNCTION, {
    unitLines: p.items.map((i) => `${i.unitId}:${i.start}:${i.end}`).join(','),
    accountId: p.accountId,
    contactId: p.contactId,
    dealId: p.dealId,
  })
}
