// Dados da disponibilidade de unidades (módulo Reservas)
export interface Equipment {
  id: string
  name: string // Products.Product_Name (Equipamento Catálogo)
  category: string
  dailyPrice: number // preço por dia (HIPÓTESE: Products.Unit_Price)
}

export interface Unit {
  id: string
  code: string // Equipment_Units.Name
  equipmentId: string
  serial: string
  location: string
  opStatus: string // Operational_Status
}

// Ocupação de uma unidade que bloqueia o período
export interface Booking {
  unitId: string
  start: string // yyyy-MM-dd
  end: string
  label: string // ex.: RES-0226 · Tecnoconstrói
  status: string // Item_Status ou estado da Manutenção
  kind: 'reservation' | 'maintenance'
  recordId?: string
}

export interface Party {
  id: string
  name: string
}

export interface DealRef extends Party {
  stage: string
}

export type UnitState = 'Disponível' | 'Reservada' | 'Pré-reservada' | 'Em manutenção'

// Estado de uma unidade para o período escolhido
export interface UnitAvailability {
  /** texto a mostrar em "Livre a partir de" quando não há data (ex.: Sem data prevista) */
  freeFromNote?: string
  unit: Unit
  state: UnitState
  free: boolean
  detail: string // ocupação (motivo, datas)
  freeFrom: string // "Livre a partir de" (yyyy-MM-dd) ou '' = sem data nos 90 dias seguintes
  recordId?: string
}

export interface EquipmentAvailability {
  /** aviso quando alguma leitura (reservas, manutenções) falhou */
  warning?: string
  equipment: Equipment
  units: UnitAvailability[]
}

/** Unidade escolhida para o pedido */
export interface RequestItem {
  unit: Unit
  equipmentName: string
  dailyPrice: number
  /** período do aluguer desta unidade (yyyy-MM-dd); cada equipamento tem o seu */
  start: string
  end: string
}

// Pedido enviado ao CRM: o widget NÃO cria reservas. Cria a Oportunidade (se a Empresa não tiver
// nenhuma em aberto) ou adiciona o equipamento à que já está em aberto. A Reserva nasce depois, no Blueprint.
export interface EquipmentRequestPayload {
  /** uma linha por unidade, cada uma com o seu período */
  items: { unitId: string; start: string; end: string }[]
  accountId: string
  contactId: string // '' = sem Cliente
  dealId: string // '' = o CRM cria a Oportunidade
}
