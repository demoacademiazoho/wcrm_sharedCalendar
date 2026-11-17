/**
 * Configuração por módulo do Calendário partilhado (MR-024 / MR-072).
 * Para juntar outro módulo basta acrescentar uma entrada em MODULES (API name, estados, atalhos, avisos,
 * filtros, agrupamentos) e um leitor em utils/calendarData.ts que converta os registos para CalEvent.
 * Os separadores aparecem todos, com a Visão geral primeiro (a restrição por perfil fica para a MR-035:
 * quando existir, basta filtrar TAB_ORDER).
 */
import type { CalEvent, ModuleKey, TabKey } from '@/interfaces/calendar'
import { EQ } from '@/config/equiply'
import { addDays } from '@/utils/dates'

export interface StatusConfig {
  name: string
  color: string
  hidden?: boolean // começa oculto na legenda
}

export interface KpiConfig {
  id: string
  label: string
  tone: 'blue' | 'orange' | 'red'
  fn: (e: CalEvent, now: Date) => boolean
}

export interface Flag {
  key: 'late' | 'unassigned' | 'expiring' | 'parts'
  text: string
}

export type FilterKey = 'type' | 'owner' | 'vehicle' | 'city' | 'client' | 'category' | 'unit'
export type GroupKey = 'module' | 'owner' | 'vehicle' | 'category' | 'equipment' | 'type'

export interface GroupConfig {
  key: GroupKey
  label: string
  /** agrupamento em que arrastar entre linhas reatribui o campo ('owner' = Responsável/Inspetor/Técnico) */
  edit?: 'owner' | 'vehicle'
}

export interface ModuleConfig {
  key: TabKey
  tab: string
  subtitle: string
  api: string
  color: string // cor do módulo (Visão geral)
  typeLabel: string // '' = o módulo não tem tipo
  types: string[]
  ownerLabel: string
  vehicles: string[] // lista base de viaturas (as lidas do CRM juntam-se)
  searchHint: string
  statuses: StatusConfig[]
  kpis: KpiConfig[]
  filters: FilterKey[]
  groups: GroupConfig[]
  /** o que se pode atribuir no detalhe */
  assign: { owner?: string; vehicle?: boolean }
  /** pode ser arrastado/reagendado? (a validação final é do CRM) */
  draggable: (e: CalEvent) => boolean
  flags: (e: CalEvent, now: Date) => Flag[]
}

// --- auxiliares de datas -----------------------------------------------------------------------

export const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const toDate = (e: CalEvent) => new Date(e.allDay ? `${e.start.slice(0, 10)}T00:00:00` : e.start)
const lastDay = (e: CalEvent) => (e.allDay ? new Date(`${(e.end ?? e.start).slice(0, 10)}T23:59:59`) : toDate(e))

/** O registo ocupa o dia indicado? */
export const overlapsDay = (e: CalEvent, day: Date): boolean => {
  const d = day0(day)
  return day0(toDate(e)) <= d && d <= day0(lastDay(e))
}
const isToday = (e: CalEvent, now: Date) => overlapsDay(e, now)
export const weekStart = (d: Date) => {
  const x = day0(d)
  return addDays(x, -((x.getDay() + 6) % 7))
}
const inThisWeek = (e: CalEvent, now: Date) => day0(toDate(e)) <= addDays(weekStart(now), 6) && day0(lastDay(e)) >= weekStart(now)
const pastTime = (e: CalEvent, now: Date) => toDate(e) < now

const FINAL: Record<ModuleKey, string[]> = {
  deliveries: ['Concluída', 'Falhada'],
  inspections: ['Aprovada', 'Aprovada com observações', 'Reprovada – Avaria'],
  reservations: ['Concluída', 'Concluída com avaria', 'Cancelada', 'Expirada'],
  maintenances: ['Concluída', 'Cancelada'],
  commercial: ['Concluída', 'Ganho', 'Perdido', 'Expirado'],
}
export const isFinal = (e: CalEvent) => FINAL[e.module].includes(e.status)

// --- Entregas e Recolhas -----------------------------------------------------------------------

const DELIVERIES: ModuleConfig = {
  key: 'deliveries',
  tab: 'Entregas e Recolhas',
  subtitle: 'Entregas e Recolhas',
  api: 'Deliveries_Pickups',
  color: EQ.blue,
  typeLabel: 'Tipo',
  types: ['Entrega', 'Recolha'],
  ownerLabel: 'Responsável',
  vehicles: ['Carrinha 1', 'Carrinha 2', 'Camião grua'],
  searchHint: 'Registo, reserva, cliente, morada…',
  statuses: [
    { name: 'Agendada', color: EQ.blue },
    { name: 'Em curso', color: EQ.orange },
    { name: 'Concluída', color: EQ.green },
    { name: 'Falhada', color: EQ.red },
    { name: 'Reagendada', color: EQ.grey },
  ],
  filters: ['type', 'owner', 'vehicle', 'city', 'client'],
  groups: [
    { key: 'vehicle', label: 'Viatura', edit: 'vehicle' },
    { key: 'owner', label: 'Responsável', edit: 'owner' },
  ],
  assign: { owner: 'Responsável', vehicle: true },
  draggable: (e) => ['Agendada', 'Reagendada'].includes(e.status),
  kpis: [
    { id: 'today', label: 'Hoje', tone: 'blue', fn: (e, now) => isToday(e, now) },
    { id: 'running', label: 'Em curso', tone: 'orange', fn: (e) => e.status === 'Em curso' },
    { id: 'late', label: 'Atrasadas', tone: 'red', fn: (e, now) => deliveries_late(e, now) },
    { id: 'novehicle', label: 'Sem viatura', tone: 'orange', fn: (e) => !isFinal(e) && !e.vehicle },
  ],
  flags: (e, now) => {
    const out: Flag[] = []
    if (deliveries_late(e, now)) out.push({ key: 'late', text: 'Atrasada: a hora marcada já passou e ainda não foi iniciada.' })
    if (!isFinal(e) && !e.vehicle) out.push({ key: 'unassigned', text: 'Sem viatura atribuída.' })
    return out
  },
}
function deliveries_late(e: CalEvent, now: Date) {
  return ['Agendada', 'Reagendada'].includes(e.status) && pastTime(e, now)
}

// --- Inspeções ---------------------------------------------------------------------------------

const inspLate = (e: CalEvent, now: Date) => e.status === 'Pendente' && pastTime(e, now)

const INSPECTIONS: ModuleConfig = {
  key: 'inspections',
  tab: 'Inspeções',
  subtitle: 'Inspeções de equipamento',
  api: 'Inspections',
  color: EQ.orange,
  typeLabel: 'Tipo',
  types: ['Pós-devolução', 'Pré-entrega', 'Periódica'],
  ownerLabel: 'Inspetor',
  vehicles: [],
  searchHint: 'Registo, unidade, reserva, cliente…',
  statuses: [
    { name: 'Pendente', color: EQ.blue },
    { name: 'Em curso', color: EQ.orange },
    { name: 'Aprovada', color: EQ.green },
    { name: 'Aprovada com observações', color: EQ.light },
    { name: 'Reprovada – Avaria', color: EQ.red },
  ],
  filters: ['owner', 'type', 'category', 'client'],
  groups: [
    { key: 'owner', label: 'Inspetor', edit: 'owner' },
    { key: 'category', label: 'Categoria' },
  ],
  assign: { owner: 'Inspetor' },
  draggable: (e) => e.status === 'Pendente',
  kpis: [
    { id: 'today', label: 'Hoje', tone: 'blue', fn: (e, now) => isToday(e, now) },
    { id: 'pending', label: 'Pendentes', tone: 'orange', fn: (e) => e.status === 'Pendente' },
    { id: 'late', label: 'Em atraso', tone: 'red', fn: (e, now) => inspLate(e, now) },
    { id: 'failed', label: 'Reprovadas', tone: 'red', fn: (e) => e.status.startsWith('Reprovada') },
  ],
  flags: (e, now) => {
    const out: Flag[] = []
    if (inspLate(e, now)) out.push({ key: 'late', text: 'Em atraso: a data da inspeção já passou e ainda está pendente.' })
    if (!isFinal(e) && !e.ownerId) out.push({ key: 'unassigned', text: 'Sem inspetor atribuído.' })
    return out
  },
}

// --- Reservas ----------------------------------------------------------------------------------

const resLate = (e: CalEvent, now: Date) => ['Em aluguer', 'Recolha agendada'].includes(e.status) && !!e.end && new Date(`${e.end}T23:59:59`) < day0(now)
// pré-reserva a expirar nas próximas 48 h
const resExpiring = (e: CalEvent, now: Date) => {
  if (e.status !== 'Pré-reserva' || !e.validUntil) return false
  const v = new Date(e.validUntil)
  return v >= now && v.getTime() - now.getTime() <= 48 * 3600e3
}

const RESERVATIONS: ModuleConfig = {
  key: 'reservations',
  tab: 'Reservas',
  subtitle: 'Reservas e disponibilidade de equipamento',
  api: 'Reservations',
  color: EQ.light,
  typeLabel: '',
  types: [],
  ownerLabel: 'Comercial',
  vehicles: [],
  searchHint: 'Reserva, cliente, localidade, equipamento…',
  statuses: [
    { name: 'Pedido', color: EQ.grey },
    { name: 'Pré-reserva', color: EQ.orange },
    { name: 'Confirmada', color: EQ.blue },
    { name: 'Em entrega', color: EQ.light },
    { name: 'Em aluguer', color: EQ.navy },
    { name: 'Recolha agendada', color: EQ.blue },
    { name: 'Devolvida – Em inspeção', color: EQ.grey },
    { name: 'Concluída', color: EQ.green },
    { name: 'Concluída com avaria', color: EQ.red },
    { name: 'Cancelada', color: EQ.grey, hidden: true },
    { name: 'Expirada', color: EQ.grey, hidden: true },
  ],
  filters: ['owner', 'client', 'category', 'city', 'unit'],
  groups: [
    { key: 'equipment', label: 'Equipamento' },
    { key: 'owner', label: 'Comercial' },
  ],
  assign: {},
  // só Pré-reserva e Confirmada mudam de período (VR21 impede sobreposição de unidade, no CRM)
  draggable: (e) => ['Pré-reserva', 'Confirmada'].includes(e.status),
  kpis: [
    { id: 'starting', label: 'A iniciar hoje', tone: 'blue', fn: (e, now) => day0(toDate(e)).getTime() === day0(now).getTime() },
    { id: 'ending', label: 'A terminar hoje', tone: 'blue', fn: (e, now) => !!e.end && day0(lastDay(e)).getTime() === day0(now).getTime() },
    { id: 'late', label: 'Devolução em atraso', tone: 'red', fn: (e, now) => resLate(e, now) },
    { id: 'expiring', label: 'Pré-reservas a expirar', tone: 'orange', fn: (e, now) => resExpiring(e, now) },
  ],
  flags: (e, now) => {
    const out: Flag[] = []
    if (resLate(e, now)) out.push({ key: 'late', text: 'Devolução em atraso: a data de fim já passou e o equipamento não foi devolvido.' })
    if (resExpiring(e, now)) out.push({ key: 'expiring', text: `Pré-reserva a expirar em ${new Date(e.validUntil).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} (48 h).` })
    return out
  },
}

// --- Manutenções -------------------------------------------------------------------------------

const AMBER = '#C98A00'

const MAINTENANCES: ModuleConfig = {
  key: 'maintenances',
  tab: 'Manutenções',
  subtitle: 'Manutenções preventivas e corretivas',
  api: 'Maintenances',
  color: EQ.grey,
  typeLabel: 'Tipo',
  types: ['Preventiva', 'Corretiva', 'Revisão legal/certific.'],
  ownerLabel: 'Técnico',
  vehicles: [],
  searchHint: 'Registo, unidade, equipamento, técnico…',
  statuses: [
    { name: 'Planeada', color: EQ.blue },
    { name: 'Em curso', color: EQ.orange },
    { name: 'A aguardar peças', color: AMBER },
    { name: 'Concluída', color: EQ.green },
    { name: 'Cancelada', color: EQ.grey, hidden: true },
  ],
  filters: ['owner', 'type', 'category', 'unit'],
  groups: [
    { key: 'owner', label: 'Técnico', edit: 'owner' },
    { key: 'type', label: 'Tipo' },
  ],
  assign: { owner: 'Técnico' },
  draggable: (e) => ['Planeada', 'A aguardar peças'].includes(e.status),
  kpis: [
    { id: 'running', label: 'Em curso', tone: 'orange', fn: (e) => e.status === 'Em curso' },
    { id: 'parts', label: 'A aguardar peças', tone: 'orange', fn: (e) => e.status === 'A aguardar peças' },
    { id: 'week', label: 'Planeadas esta semana', tone: 'blue', fn: (e, now) => e.status === 'Planeada' && inThisWeek(e, now) },
    { id: 'notech', label: 'Sem técnico', tone: 'red', fn: (e) => !isFinal(e) && !e.ownerId },
  ],
  flags: (e) => {
    const out: Flag[] = []
    if (!isFinal(e) && !e.ownerId) out.push({ key: 'unassigned', text: 'Sem técnico atribuído.' })
    if (e.status === 'A aguardar peças') out.push({ key: 'parts', text: 'A aguardar peças.' })
    return out
  },
}

// --- Comercial (Oportunidades, Pedidos de Orçamento e Tarefas) ----------------------------------

export const COMMERCIAL_KINDS = ['Follow-up', 'Validade do orçamento', 'Fecho previsto']
const followupDue = (e: CalEvent, now: Date) => e.kind === 'Follow-up' && e.status === 'Por fazer' && day0(toDate(e)) < day0(now)
const quoteExpiring = (e: CalEvent, now: Date) =>
  e.kind === 'Validade do orçamento' && !isFinal(e) && day0(toDate(e)) >= day0(now) && day0(toDate(e)) <= addDays(day0(now), 7)

const COMMERCIAL: ModuleConfig = {
  key: 'commercial',
  tab: 'Comercial',
  subtitle: 'Follow-ups, validades de orçamento e fechos previstos',
  api: 'Deals',
  color: EQ.green,
  typeLabel: 'Tipo',
  types: COMMERCIAL_KINDS,
  ownerLabel: 'Comercial',
  vehicles: [],
  searchHint: 'Oportunidade, orçamento, cliente, comercial…',
  statuses: [
    { name: 'Em aberto', color: EQ.blue },
    { name: 'Em negociação', color: EQ.orange },
    { name: 'Por fazer', color: EQ.blue },
    { name: 'Concluída', color: EQ.green },
    { name: 'Ganho', color: EQ.green },
    { name: 'Perdido', color: EQ.grey },
    { name: 'Expirado', color: EQ.red },
  ],
  filters: ['owner', 'type', 'client'],
  groups: [
    { key: 'owner', label: 'Comercial' },
    { key: 'type', label: 'Tipo' },
  ],
  assign: {},
  draggable: (e) => !isFinal(e),
  kpis: [
    { id: 'fuToday', label: 'Follow-ups hoje', tone: 'blue', fn: (e, now) => e.kind === 'Follow-up' && isToday(e, now) },
    { id: 'quotes', label: 'Orçamentos a expirar (7 dias)', tone: 'orange', fn: (e, now) => quoteExpiring(e, now) },
    { id: 'closing', label: 'Fechos esta semana', tone: 'blue', fn: (e, now) => e.kind === 'Fecho previsto' && !isFinal(e) && inThisWeek(e, now) },
    { id: 'fuLate', label: 'Follow-ups em atraso', tone: 'red', fn: (e, now) => followupDue(e, now) },
  ],
  flags: (e, now) => {
    const out: Flag[] = []
    if (followupDue(e, now)) out.push({ key: 'late', text: 'Follow-up por fazer: a data já passou.' })
    if (quoteExpiring(e, now)) out.push({ key: 'expiring', text: 'Orçamento a expirar nos próximos 7 dias.' })
    return out
  },
}

// --- Visão geral (todos os módulos) -------------------------------------------------------------

export const MODULE_ORDER: ModuleKey[] = ['deliveries', 'inspections', 'reservations', 'maintenances', 'commercial']

const flagsOf = (e: CalEvent, now: Date) => MODULES_BY_KEY[e.module].flags(e, now)

const OVERVIEW: ModuleConfig = {
  key: 'overview',
  tab: 'Visão geral',
  subtitle: 'Todos os módulos numa só vista',
  api: '',
  color: EQ.navy,
  typeLabel: '',
  types: [],
  ownerLabel: 'Responsável',
  vehicles: [],
  searchHint: 'Registo, cliente, equipamento, responsável…',
  statuses: [],
  filters: ['owner', 'client'],
  groups: [
    { key: 'module', label: 'Módulo' },
    { key: 'owner', label: 'Responsável' },
  ],
  assign: {},
  draggable: (e) => MODULES_BY_KEY[e.module].draggable(e),
  kpis: [
    { id: 'today', label: 'Hoje', tone: 'blue', fn: (e, now) => isToday(e, now) },
    { id: 'late', label: 'Em atraso', tone: 'red', fn: (e, now) => flagsOf(e, now).some((f) => f.key === 'late') },
    { id: 'unassigned', label: 'Sem atribuição', tone: 'orange', fn: (e, now) => flagsOf(e, now).some((f) => f.key === 'unassigned') },
    { id: 'next7', label: 'Próximos 7 dias', tone: 'blue', fn: (e, now) => day0(toDate(e)) >= day0(now) && day0(toDate(e)) <= addDays(day0(now), 7) },
  ],
  flags: (e, now) => flagsOf(e, now),
}

const MODULES_BY_KEY: Record<TabKey, ModuleConfig> = {
  overview: OVERVIEW,
  deliveries: DELIVERIES,
  inspections: INSPECTIONS,
  reservations: RESERVATIONS,
  maintenances: MAINTENANCES,
  commercial: COMMERCIAL,
}
export const MODULES = MODULES_BY_KEY

/** Separadores: todos sempre visíveis, Visão geral primeiro (MR-072). Filtrar aqui quando houver perfis (MR-035). */
export const TAB_ORDER: TabKey[] = ['overview', ...MODULE_ORDER]

/** Cor de um registo: na Visão geral pelo módulo, nos restantes pelo estado */
export const colorOf = (e: CalEvent, tab: TabKey): string =>
  tab === 'overview' ? MODULES[e.module].color : (MODULES[e.module].statuses.find((s) => s.name === e.status)?.color ?? EQ.grey)

export const statusColor = (e: CalEvent): string => MODULES[e.module].statuses.find((s) => s.name === e.status)?.color ?? EQ.grey
