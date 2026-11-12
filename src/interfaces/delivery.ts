// Valores fixos do CRM (módulo Deliveries_Pickups)
export type LogisticsStatus =
  | 'Agendada'
  | 'Em curso'
  | 'Concluída'
  | 'Falhada'
  | 'Reagendada'

export type LogisticsType = 'Entrega' | 'Recolha'

export type Vehicle = 'Carrinha 1' | 'Carrinha 2' | 'Camião grua'

// Campo de pesquisa (lookup / userlookup) devolvido pela COQL
export interface LookupRef {
  id: string
  name?: string
}

// Uma Entrega ou Recolha, como a COQL a devolve
export interface Delivery {
  id: string
  Name: string
  Logistics_Type: LogisticsType
  Logistics_Status: LogisticsStatus
  Scheduled_DateTime: string // ISO 8601 com fuso, ex.: 2026-11-12T09:30:00+00:00
  Responsible: LookupRef | null
  Vehicle: Vehicle | null
  Address: string | null
  Reservation: LookupRef | null
}

// Estado dos filtros do calendário ('' = sem filtro)
export interface CalendarFilters {
  responsibleId: string
  vehicle: Vehicle | ''
}
