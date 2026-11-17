// Dados fictícios para ver o widget fora do CRM (npm run dev). Nunca usados dentro do CRM.
import type { CalEvent, ModuleKey } from '@/interfaces/calendar'
import type { Booking, Equipment, Party, Unit } from '@/interfaces/availability'
import type { CrmUser } from '@/interfaces/delivery'
import { addDays, toZohoDate, toZohoDateTime } from '@/utils/dates'

export const MOCK_ME: CrmUser & { role: string } = { id: 'u1', full_name: 'João Silva', role: 'Logística' }

const U = (id: string, full_name: string): CrmUser => ({ id, full_name })
const u1 = MOCK_ME as CrmUser
const u2 = U('u2', 'Carlos Mendes')
const u3 = U('u3', 'Tiago Pinto')
const u4 = U('u4', 'Rita Sousa')
const u5 = U('u5', 'Pedro Nunes')
const u6 = U('u6', 'Inês Gaspar')
const u7 = U('u7', 'Mário Teixeira')
const u8 = U('u8', 'Sofia Lopes')
const u9 = U('u9', 'Bruno Matos')
const u10 = U('u10', 'Catarina Dias')

export const MOCK_USERS: CrmUser[] = [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10]
const TEAM = [u1, u2, u3, u4]
const INSPECTORS = [u5, u6, u1]
const TECHNICIANS = [u7, u5]
const COMMERCIALS = [u8, u9, u10]

export const MOCK_ACCOUNTS: Party[] = ['Tecnoconstrói', 'Obras do Minho', 'Vale do Ave', 'Edifícios Vale', 'Casa & Obra', 'Metalúrgica Norte'].map(
  (name, i) => ({ id: `a${i + 1}`, name }),
)
export const MOCK_CONTACTS: (Party & { accountId: string })[] = ['Ana Ribeiro', 'Bruno Costa', 'Marta Lopes', 'Paulo Nunes', 'Sofia Reis', 'Hugo Moreira'].map(
  (name, i) => ({ id: `c${i + 1}`, name, accountId: `a${(i % 6) + 1}` }),
)
export const MOCK_DEALS: (Party & { accountId: string })[] = [
  { id: 'd1', name: 'Obra Braga Sul', accountId: 'a1' },
  { id: 'd2', name: 'Pavilhão Guimarães', accountId: 'a2' },
  { id: 'd3', name: 'Reabilitação Porto', accountId: 'a1' },
  { id: 'd4', name: 'Armazém Vale', accountId: 'a3' },
]

export const MOCK_EQUIPMENTS: Equipment[] = [
  { id: 'e1', name: 'Plataforma elevatória tesoura 10 m', category: 'Elevação', dailyPrice: 95 },
  { id: 'e2', name: 'Mini-escavadora 1,7 t', category: 'Terraplanagem', dailyPrice: 120 },
  { id: 'e3', name: 'Gerador 20 kVA', category: 'Energia', dailyPrice: 70 },
  { id: 'e4', name: 'Compactador de placa 90 kg', category: 'Compactação', dailyPrice: 45 },
]

const LOCATIONS = ['Armazém Braga', 'Armazém Porto']
export const MOCK_UNITS: Unit[] = MOCK_EQUIPMENTS.flatMap((e, i) =>
  Array.from({ length: 4 }, (_, k) => ({
    id: `${e.id}-u${k + 1}`,
    code: `${['PLT', 'MEX', 'GER', 'COM'][i]}-${String(k + 1).padStart(3, '0')}`,
    equipmentId: e.id,
    serial: `SN${1000 + i * 10 + k}`,
    location: LOCATIONS[k % 2]!,
    opStatus: 'Disponível',
  })),
)
const equipOf = (u: Unit) => MOCK_EQUIPMENTS.find((e) => e.id === u.equipmentId)!

const CITIES = ['Braga', 'Guimarães', 'Porto', 'Famalicão', 'Barcelos']
const VEHICLES = ['Carrinha 1', 'Carrinha 2', 'Camião grua']

let seed = 20261116
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!
const day0 = () => {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
const own = (u: CrmUser | null) => ({ ownerId: u?.id ?? '', ownerName: u?.full_name ?? '' })

const blank = (): Omit<CalEvent, 'id' | 'module' | 'code' | 'kind' | 'status' | 'start' | 'allDay' | 'entity'> => ({
  end: undefined,
  ownerId: '',
  ownerName: '',
  vehicle: '',
  client: '',
  clientId: '',
  contactId: '',
  city: '',
  address: '',
  reservation: null,
  unit: '',
  unitId: '',
  equipment: '',
  category: '',
  validUntil: '',
  value: null,
  rows: [],
})

export const MOCK_BOOKINGS: Booking[] = []

function build(): Record<ModuleKey, CalEvent[]> {
  const now = new Date()
  const out: Record<ModuleKey, CalEvent[]> = { deliveries: [], inspections: [], reservations: [], maintenances: [], commercial: [] }
  const t0 = day0()

  // ---------- Reservas (primeiro, porque Entregas e Inspeções se ligam a elas) ----------
  type Slot = { u: Unit; s: number; f: number; status: string; expiry?: Date }
  const slots: Slot[] = []
  const taken = new Map<string, [number, number][]>()
  const free = (u: Unit, s: number, f: number) => !(taken.get(u.id) ?? []).some(([a, b]) => a <= f && b >= s)
  const take = (slot: Slot) => {
    slots.push(slot)
    taken.set(slot.u.id, [...(taken.get(slot.u.id) ?? []), [slot.s, slot.f]])
  }
  const [a1, a2, a3, a4] = MOCK_UNITS
  const inHours = (h: number) => new Date(now.getTime() + h * 3600e3)
  // casos garantidos para os atalhos e alertas do dia
  take({ u: a1!, s: -3, f: 0, status: 'Em aluguer' }) // termina hoje
  take({ u: a2!, s: 0, f: 3, status: 'Confirmada' }) // começa hoje
  take({ u: a3!, s: 2, f: 5, status: 'Pré-reserva', expiry: inHours(30) }) // pré-reserva a expirar (48 h)
  take({ u: a4!, s: -5, f: -1, status: 'Em aluguer' }) // devolução em atraso
  for (const u of MOCK_UNITS.slice(4)) {
    let cursor = -10 + Math.floor(rnd() * 6)
    while (cursor < 28) {
      const len = Math.floor(rnd() * 5) + 2
      if (rnd() < 0.4 && free(u, cursor, cursor + len - 1)) {
        const f = cursor + len - 1
        const status = f < 0 ? 'Concluída' : cursor <= 0 ? 'Em aluguer' : pick(['Confirmada', 'Confirmada', 'Pré-reserva', 'Pedido'])
        take({ u, s: cursor, f, status, expiry: status === 'Pré-reserva' ? inHours(24 * (2 + Math.floor(rnd() * 5))) : undefined })
        cursor += len + 1
      } else cursor += 2
    }
  }
  let nr = 100
  const resEvents: CalEvent[] = []
  for (const slot of slots) {
    nr++
    const eq = equipOf(slot.u)
    const acc = pick(MOCK_ACCOUNTS)
    const contact = MOCK_CONTACTS.find((c) => c.accountId === acc.id)
    const com = pick(COMMERCIALS)
    const s = addDays(t0, slot.s)
    const f = addDays(t0, slot.f)
    const code = `RES-${nr}`
    const city = pick(CITIES)
    MOCK_BOOKINGS.push({
      unitId: slot.u.id,
      start: toZohoDate(s),
      end: toZohoDate(f),
      label: `${code} · ${acc.name}`,
      status: slot.status === 'Pré-reserva' ? 'Pré-reservado' : slot.status === 'Em aluguer' ? 'Entregue' : slot.status === 'Concluída' ? 'Devolvido' : 'Reservado',
      kind: 'reservation',
      recordId: `res${nr}`,
    })
    const ev: CalEvent = {
      ...blank(),
      id: `res${nr}`,
      module: 'reservations',
      code,
      kind: '',
      status: slot.status,
      start: toZohoDate(s),
      end: toZohoDate(f),
      allDay: true,
      entity: 'Reservations',
      ...own(com),
      client: acc.name,
      clientId: acc.id,
      contactId: contact?.id ?? '',
      city,
      reservation: { id: `res${nr}`, name: code },
      unit: slot.u.code,
      unitId: slot.u.id,
      equipment: eq.name,
      category: eq.category,
      validUntil: slot.expiry ? toZohoDateTime(slot.expiry) : '',
      value: (slot.f - slot.s + 1) * eq.dailyPrice,
      rows: [['Valor total', `${(slot.f - slot.s + 1) * eq.dailyPrice} €`]],
    }
    out.reservations.push(ev)
    resEvents.push(ev)
  }

  // ---------- Entregas e Recolhas e Inspeções ----------
  const linkable = resEvents.filter((r) => !['Pedido', 'Pré-reserva'].includes(r.status))
  let n = 14
  let ni = 30
  for (let off = -14; off <= 21; off++) {
    const day = addDays(t0, off)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    if (off !== 0 && weekend) continue
    const count = off === 0 ? 5 : Math.floor(rnd() * 3) + 1
    for (let i = 0; i < count; i++) {
      const start = new Date(day)
      start.setHours(pick([8, 9, 10, 11, 14, 15, 16]), pick([0, 30]), 0, 0)
      const type = rnd() < 0.5 ? 'Entrega' : 'Recolha'
      let status: string
      if (start < now) status = rnd() < 0.08 ? 'Falhada' : rnd() < 0.07 ? 'Agendada' : 'Concluída'
      else status = rnd() < 0.1 ? 'Reagendada' : 'Agendada'
      const r = pick(linkable)
      n++
      out.deliveries.push({
        ...blank(),
        id: String(n),
        module: 'deliveries',
        code: `LOG-${n}`,
        kind: type,
        status,
        start: toZohoDateTime(start),
        allDay: false,
        entity: 'Deliveries_Pickups',
        ...own(rnd() < 0.05 && start >= now ? null : pick(TEAM)),
        vehicle: rnd() < 0.15 && start >= now ? '' : pick(VEHICLES),
        client: r.client,
        clientId: r.clientId,
        contactId: r.contactId,
        city: r.city,
        address: `Rua das Obras ${Math.floor(rnd() * 90) + 1}, ${r.city}`,
        reservation: r.reservation,
        unit: r.unit,
        unitId: r.unitId,
        equipment: r.equipment,
        category: r.category,
      })
    }
    if (!weekend && (off === 0 || rnd() < 0.55)) {
      const start = new Date(day)
      start.setHours(pick([9, 10, 14, 16]), 0, 0, 0)
      const status = start < now ? pick(['Aprovada', 'Aprovada', 'Aprovada com observações', 'Reprovada – Avaria', 'Pendente']) : off === 0 ? 'Em curso' : 'Pendente'
      const r = pick(linkable)
      ni++
      out.inspections.push({
        ...blank(),
        id: `i${ni}`,
        module: 'inspections',
        code: `INS-${ni}`,
        kind: pick(['Pós-devolução', 'Pós-devolução', 'Pré-entrega', 'Periódica']),
        status,
        start: toZohoDateTime(start),
        allDay: false,
        entity: 'Inspections',
        ...own(rnd() < 0.1 && status === 'Pendente' ? null : pick(INSPECTORS)),
        client: r.client,
        clientId: r.clientId,
        contactId: r.contactId,
        city: r.city,
        reservation: r.reservation,
        unit: r.unit,
        unitId: r.unitId,
        equipment: r.equipment,
        category: r.category,
      })
    }
  }
  const live = out.deliveries.find((d) => d.start.startsWith(toZohoDate(now)) && d.status === 'Agendada')
  if (live) live.status = 'Em curso'

  // ---------- Manutenções ----------
  let nm = 40
  const manDefs: { off: number; len: number; status: string; type: string; tech: CrmUser | null; unit: Unit; parts?: boolean }[] = [
    { off: -1, len: 4, status: 'Em curso', type: 'Corretiva', tech: u7, unit: MOCK_UNITS[5]! },
    { off: -6, len: 2, status: 'Concluída', type: 'Preventiva', tech: u5, unit: MOCK_UNITS[2]! },
    { off: 2, len: 2, status: 'Planeada', type: 'Preventiva', tech: u7, unit: MOCK_UNITS[8]! },
    { off: 3, len: 1, status: 'Planeada', type: 'Revisão legal/certific.', tech: null, unit: MOCK_UNITS[12]! },
    { off: 1, len: 5, status: 'A aguardar peças', type: 'Corretiva', tech: u5, unit: MOCK_UNITS[9]!, parts: true },
    { off: 9, len: 2, status: 'Planeada', type: 'Preventiva', tech: u7, unit: MOCK_UNITS[14]! },
    { off: -12, len: 3, status: 'Concluída', type: 'Corretiva', tech: u7, unit: MOCK_UNITS[7]! },
    { off: 14, len: 1, status: 'Planeada', type: 'Preventiva', tech: null, unit: MOCK_UNITS[1]! },
  ]
  for (const d of manDefs) {
    nm++
    const s = addDays(t0, d.off)
    const f = addDays(s, d.len - 1)
    const eq = equipOf(d.unit)
    MOCK_BOOKINGS.push({
      unitId: d.unit.id,
      start: toZohoDate(s),
      end: toZohoDate(f),
      label: `${d.type} · MAN-${nm}`,
      status: d.status,
      kind: 'maintenance',
      recordId: `man${nm}`,
    })
    out.maintenances.push({
      ...blank(),
      id: `man${nm}`,
      module: 'maintenances',
      code: `MAN-${nm}`,
      kind: d.type,
      status: d.status,
      start: toZohoDate(s),
      end: toZohoDate(f),
      allDay: true,
      entity: 'Maintenances',
      ...own(d.tech),
      unit: d.unit.code,
      unitId: d.unit.id,
      equipment: eq.name,
      category: eq.category,
      rows: [
        ['Fornecedor de peças', d.parts ? 'Hidrau-Norte, Lda' : '—'],
        ['Inspeção de origem', d.type === 'Corretiva' ? `INS-${30 + nm - 40}` : '—'],
      ],
    })
  }

  // ---------- Comercial: fechos previstos, validades de orçamento e follow-ups ----------
  let nc = 0
  for (const [i, acc] of MOCK_ACCOUNTS.entries()) {
    const com = COMMERCIALS[i % 3]!
    const contact = MOCK_CONTACTS.find((c) => c.accountId === acc.id)
    const common = { ...blank(), clientId: acc.id, client: acc.name, contactId: contact?.id ?? '', ...own(com), city: pick(CITIES) }
    const stage = pick(['Em aberto', 'Em negociação', 'Em negociação'])
    nc++
    out.commercial.push({ ...common, id: `deal${nc}`, module: 'commercial', code: `OPP-${nc}`, kind: 'Fecho previsto', status: stage, start: toZohoDate(addDays(t0, [0, 2, 4, 6, 9, 12][i]!)), allDay: true, entity: 'Deals', value: 1200 + i * 450, rows: [['Oportunidade', `Aluguer ${acc.name}`]] })
    nc++
    out.commercial.push({ ...common, id: `quote${nc}`, module: 'commercial', code: `ORC-${nc}`, kind: 'Validade do orçamento', status: i === 5 ? 'Expirado' : 'Em aberto', start: toZohoDate(addDays(t0, [-2, 1, 3, 5, 8, 20][i]!)), allDay: true, entity: 'Quotes', value: 900 + i * 300, rows: [['Orçamento', `Pedido de orçamento ${acc.name}`]] })
    nc++
    out.commercial.push({ ...common, id: `task${nc}`, module: 'commercial', code: `Follow-up ${acc.name}`, kind: 'Follow-up', status: i === 3 ? 'Concluída' : 'Por fazer', start: toZohoDate(addDays(t0, [0, 0, -1, -3, 1, 2][i]!)), allDay: true, entity: 'Tasks', rows: [['Nota', 'Confirmar datas e transporte']] })
  }
  return out
}

export const mockEvents: Record<ModuleKey, CalEvent[]> = build()
