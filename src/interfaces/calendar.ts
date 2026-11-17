// Modelo genérico de um evento do calendário (qualquer módulo é convertido para este formato)
import type { CrmUser, LookupRef } from '@/interfaces/delivery'

export type ModuleKey = 'deliveries' | 'inspections' | 'reservations' | 'maintenances' | 'commercial'
/** Separadores: a Visão geral é sempre o primeiro (MR-072) */
export type TabKey = 'overview' | ModuleKey

export interface CalEvent {
  id: string
  module: ModuleKey
  code: string // nº do registo (ex.: LOG-14)
  kind: string // tipo (Entrega, Recolha, Pós-devolução, Preventiva, Follow-up, ...); em Reservas fica vazio
  status: string
  start: string // ISO 8601 (data/hora) ou yyyy-MM-dd (dia inteiro)
  end?: string // dia inteiro com duração: último dia, inclusive
  allDay: boolean
  ownerId: string // Responsável / Inspetor / Técnico / Comercial, conforme o módulo
  ownerName: string
  vehicle: string // só Entregas e Recolhas
  client: string // Empresa ou Cliente (vem da Reserva)
  clientId: string // id da Empresa (contexto "Ficha do Cliente")
  contactId: string // id do Cliente/Contacto
  city: string // Localidade
  address: string
  reservation: LookupRef | null
  unit: string // código da unidade
  unitId: string
  equipment: string // nome do equipamento (catálogo)
  category: string // categoria do equipamento
  /** API name do módulo do registo, para "Abrir registo no CRM" (no Comercial pode ser Deals, Quotes ou Tasks) */
  entity: string
  /** Pré-reserva: validade; Orçamento: Valid_Till (ISO) */
  validUntil: string
  value: number | null
  /** linhas extra para o detalhe lateral */
  rows: [string, string][]
}

// Estado dos filtros do calendário ('' = sem filtro)
export interface CalFilters {
  q: string
  type: string
  ownerId: string
  vehicle: string
  client: string
  city: string
  category: string
  unit: string
  mine: boolean
}

export const emptyFilters = (): CalFilters => ({ q: '', type: '', ownerId: '', vehicle: '', client: '', city: '', category: '', unit: '', mine: false })

/** Contexto de abertura: o widget aberto a partir da ficha de uma Reserva, Cliente/Empresa ou Unidade */
export interface CalContext {
  entity: 'Reservations' | 'Accounts' | 'Contacts' | 'Equipment_Units'
  id: string
  label: string
}

export type ViewKey = 'month' | 'week' | 'agenda' | 'resources'

export type { CrmUser }
