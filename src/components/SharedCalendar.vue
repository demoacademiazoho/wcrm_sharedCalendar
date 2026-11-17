<template>
  <!-- com o painel do pedido aberto (ecrãs largos) a página cede-lhe espaço, para continuar a escolher unidades -->
  <div :class="['flex flex-col gap-3 transition-[padding] duration-200', requestOpen ? 'lg:pr-[440px]' : '']">
    <!-- 0) Separadores: sempre todos, Visão geral primeiro (a restrição por perfil fica para a MR-035) -->
    <ModuleTabs :modules="tabConfigs" :active="tab" :counts="counts" @select="selectTab" />

    <!-- Abertura em contexto (ficha de uma Reserva, Cliente ou Unidade) -->
    <ContextBar :context="contextShown" @remove="setContext(null)" />

    <!-- 1) Atalhos: cada clique filtra o calendário -->
    <KpiBar :items="kpiItems" :active="preset" @toggle="togglePreset" />

    <!-- 2) Pesquisa sempre visível + filtros recolhíveis (fechados por defeito) -->
    <FilterPanel :module="cfg" :filters="filters" :options="filterOptions" :extra="extraSummary" @change="(patch) => Object.assign(filters, patch)" @clear="clearFilters" />

    <!-- 3) Disponibilidade de unidades (só em Reservas; aparece quando a pesquisa tem 2+ letras) -->
    <div v-if="tab === 'reservations'" class="flex flex-col gap-2">
      <AvailabilityPanel :query="filters.q" :from="availFrom" :to="availTo" :selected="requestItems" @update:from="availFrom = $event" @update:to="availTo = $event" @toggle="toggleRequestItem" />
      <button v-if="requestItems.length && !requestOpen" type="button" class="w-fit cursor-pointer rounded-lg border border-eq-orange bg-eq-orange px-3.5 py-2 text-sm font-bold text-white hover:brightness-95" @click="requestOpen = true">
        Ver pedido ({{ requestItems.length }})
      </button>
    </div>

    <!-- 4) Legenda + barra de ferramentas + vistas -->
    <section class="eq-card relative p-4">
      <StatusLegend :title="legendTitle" :items="legendItems" :counts="legendCounts" :hidden="legendHidden" @toggle="toggleLegend" />

      <CalToolbar :title="title" :view="view" :groups="cfg.groups" :group="groupKey" @nav="navigate" @today="goToday" @view="setView" @group="groupKey = $event" />

      <!-- Aviso de leitura parcial (alguns módulos falharam) -->
      <div v-if="failed.length && !loadError" class="mb-3 flex flex-wrap items-center gap-3 rounded-md border-l-4 border-eq-orange bg-orange-50 px-3 py-2 text-[13px]" role="status">
        <span>Não foi possível ler: <b>{{ failed.join(', ') }}</b>. Os restantes dados estão a ser mostrados.</span>
        <button type="button" class="ml-auto cursor-pointer rounded-lg border border-eq-line bg-white px-3 py-1 font-bold hover:border-eq-blue" @click="reload()">Tentar novamente</button>
      </div>

      <!-- Erro de leitura -->
      <div v-if="loadError" class="grid place-items-center gap-3 rounded-xl border border-dashed border-eq-red/50 bg-red-50 px-4 py-10 text-center" role="alert">
        <p class="font-bold text-eq-red">Não foi possível carregar o calendário.</p>
        <p class="max-w-md text-[13px] text-eq-muted">{{ loadError }}</p>
        <button type="button" class="cursor-pointer rounded-[10px] border border-eq-navy bg-eq-navy px-4 py-2 text-sm font-bold text-white hover:bg-eq-navy-dark" @click="reload()">Tentar novamente</button>
      </div>

      <template v-else>
        <!-- A mensagem de "sem resultados" não esconde o calendário -->
        <p v-if="!loading && !visible.length" class="mb-3 rounded-md border-l-4 border-eq-blue bg-sky-50 px-3 py-2 text-[13px]" role="status">
          Sem registos neste período{{ hasActiveFilters ? ' com os filtros escolhidos' : '' }}.
          <button v-if="hasActiveFilters" type="button" class="ml-2 cursor-pointer font-bold text-eq-blue underline" @click="clearFilters">Limpar filtros</button>
        </p>

        <div :class="['relative transition-opacity', loading ? 'opacity-50' : '']" :aria-busy="loading">
          <ResourceView
            v-if="view === 'resources'"
            :events="visible"
            :start="periodStart"
            :group="group"
            :known="knownGroups"
            :today="today"
            :color-of="(e) => colorOf(e, tab)"
            :has-flag="(e) => MODULES[e.module].flags(e, new Date()).length > 0"
            :can-drag="(e) => MODULES[e.module].draggable(e)"
            @open="openById"
            @move="onResourceMove"
          />
          <div v-else class="eq-cal">
            <FullCalendar ref="fc" :key="`${tab}-${view}`" :options="calendarOptions">
              <template #eventContent="arg">
                <div class="eq-ev">
                  <b>{{ arg.timeText }} {{ arg.event.extendedProps.label }}</b>
                  <span v-if="arg.event.extendedProps.flagged" class="eq-ev-flag" title="Requer atenção">!</span>
                  <small v-if="arg.event.extendedProps.sub">{{ arg.event.extendedProps.sub }}</small>
                </div>
              </template>
            </FullCalendar>
          </div>
          <!-- A carregar -->
          <div v-if="loading" class="pointer-events-none absolute inset-0 grid place-items-center">
            <span class="flex items-center gap-2.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold shadow-lg"><i class="inline-block size-[18px] animate-spin rounded-full border-[3px] border-eq-line border-t-eq-blue" />A carregar…</span>
          </div>
        </div>
      </template>
    </section>

    <EventDrawer :event="selected" :users="session.users" :vehicles="vehicleOptions" :context="context" @close="selected = null" @open-record="openRecord" @reschedule="onDrawerReschedule" @assign="onDrawerAssign" @context="onDrawerContext" />

    <NewReservationDrawer
      :open="requestOpen"
      :items="requestItems"
      :busy="creating"
      :error="createError"
      @close="requestOpen = false"
      @remove="removeRequestItem"
      @update-item="updateRequestItem"
      @submit="submitRequest"
    />

    <ConfirmMove :change="pending" :busy="saving" @confirm="confirmPending" @cancel="cancelPending" />
  </div>
</template>

<script setup lang="ts">
/*
 * Calendário partilhado 2.0 (MR-024 / MR-072).
 * Fluxo:
 *  1) O widget é a fonte única do estado (separador, vista, data, agrupamento). O FullCalendar só desenha
 *     Mês, Semana e Agenda; a vista Recursos é desenhada pelo ResourceView.
 *  2) O período é calculado aqui e lido do CRM por COQL (utils/calendarData.ts). Em contexto (Reserva, Cliente,
 *     Unidade) lê-se uma janela larga e filtra-se pelo registo de origem.
 *  3) Pesquisa, filtros, atalhos e legenda aplicam-se no widget sobre os dados lidos.
 *  4) Reagendar (arrastar ou no detalhe) e reatribuir (Recursos ou detalhe) passam por um passo de confirmação.
 *     Quem valida é o CRM; se recusar, mostra-se a mensagem e o registo volta ao sítio.
 *  5) Reservas: a disponibilidade lista unidades; o pedido NÃO cria reservas: cria/atualiza a Oportunidade e um
 *     Pedido de Orçamento em Rascunho (função fn_Deals_addEquipmentFromCalendar). A reserva nasce no Blueprint.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import ptLocale from '@fullcalendar/core/locales/pt'
import type { CalendarOptions, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import KpiBar, { type KpiItem } from '@/components/calendar/KpiBar.vue'
import FilterPanel, { type FilterOption } from '@/components/calendar/FilterPanel.vue'
import StatusLegend, { type LegendItem } from '@/components/calendar/StatusLegend.vue'
import ModuleTabs from '@/components/calendar/ModuleTabs.vue'
import CalToolbar from '@/components/calendar/CalToolbar.vue'
import ContextBar from '@/components/calendar/ContextBar.vue'
import ConfirmMove, { type PendingChange } from '@/components/calendar/ConfirmMove.vue'
import ResourceView, { type MovePayload } from '@/components/calendar/ResourceView.vue'
import EventDrawer from '@/components/calendar/EventDrawer.vue'
import AvailabilityPanel from '@/components/calendar/AvailabilityPanel.vue'
import NewReservationDrawer from '@/components/calendar/NewReservationDrawer.vue'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { useParamsStore } from '@/stores/params'
import { getEvents, getTodayCounts, moveRecord, requestEquipment } from '@/utils/calendarData'
import { MODULES, MODULE_ORDER, TAB_ORDER, colorOf, day0, weekStart } from '@/config/modules'
import type { FilterKey } from '@/config/modules'
import { addDays, parseDay, toZohoDate } from '@/utils/dates'
import type { ZohoInterface } from '@/interfaces/zohoInterface'
import type { CalContext, CalEvent, ModuleKey, TabKey, ViewKey } from '@/interfaces/calendar'
import { emptyFilters } from '@/interfaces/calendar'
import type { EquipmentRequestPayload, RequestItem } from '@/interfaces/availability'

declare const ZOHO: ZohoInterface

const toast = useToast()
const session = useSessionStore()
const paramsStore = useParamsStore()

// ---------------------------------------------------------------- estado
const tabConfigs = TAB_ORDER.map((k) => MODULES[k])
const tab = ref<TabKey>('overview')
const cfg = computed(() => MODULES[tab.value])
const view = ref<ViewKey>('week')
const today = day0(new Date())
const cursor = ref<Date>(today)
const groupKey = ref<string>(MODULES.overview.groups[0]!.key)
const group = computed(() => cfg.value.groups.find((g) => g.key === groupKey.value) ?? cfg.value.groups[0]!)

const events_ = ref<CalEvent[]>([])
const failed = ref<string[]>([])
const loading = ref(false)
const loadError = ref('')
const counts = ref<Partial<Record<TabKey, number | null>>>({})
const selected = ref<CalEvent | null>(null)
const preset = ref<string | null>(null)
const hiddenStatuses = ref<string[]>([])
const hiddenModules = ref<ModuleKey[]>([])
const filters = reactive(emptyFilters())
const fc = ref<{ getApi: () => import('@fullcalendar/core').CalendarApi } | null>(null)

const defaultHidden = (k: ModuleKey) => MODULES[k].statuses.filter((s) => s.hidden).map((s) => s.name)
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'))

// ---------------------------------------------------------------- contexto
const context = ref<CalContext | null>(null)
const labelFromData = computed(() => {
  const c = context.value
  if (!c) return ''
  const e = events_.value
  if (c.entity === 'Reservations') return e.find((x) => x.module === 'reservations' && x.id === c.id)?.code ?? e.find((x) => x.reservation?.id === c.id)?.reservation?.name ?? ''
  if (c.entity === 'Accounts') return e.find((x) => x.clientId === c.id)?.client ?? ''
  if (c.entity === 'Contacts') return e.find((x) => x.contactId === c.id)?.client ?? ''
  return e.find((x) => x.unitId.split(',').includes(c.id))?.unit ?? ''
})
const KIND_TEXT: Record<CalContext['entity'], string> = { Reservations: 'a reserva', Accounts: 'o cliente', Contacts: 'o cliente', Equipment_Units: 'a unidade' }
const contextShown = computed<CalContext | null>(() => (context.value ? { ...context.value, label: context.value.label || labelFromData.value || `${KIND_TEXT[context.value.entity]} escolhid${context.value.entity === 'Equipment_Units' ? 'a' : context.value.entity === 'Reservations' ? 'a' : 'o'}` } : null))

const CTX_ENTITIES: CalContext['entity'][] = ['Reservations', 'Accounts', 'Contacts', 'Equipment_Units']
function contextFrom(entity?: string, id?: string): CalContext | null {
  return entity && id && (CTX_ENTITIES as string[]).includes(entity) ? { entity: entity as CalContext['entity'], id, label: '' } : null
}
function setContext(c: CalContext | null) {
  context.value = c
  selected.value = null
}

// ---------------------------------------------------------------- período
const periodStart = computed(() => {
  const c = cursor.value
  if (view.value === 'month') return weekStart(new Date(c.getFullYear(), c.getMonth(), 1))
  if (view.value === 'agenda') return day0(c)
  return weekStart(c)
})
const periodEnd = computed(() => addDays(periodStart.value, view.value === 'month' ? 42 : view.value === 'agenda' ? 14 : 7)) // exclusivo

const fmtDay = (d: Date, withYear = false) => d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).replace('.', '')
const title = computed(() => {
  if (view.value === 'month') return cursor.value.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  const last = addDays(periodEnd.value, -1)
  return `${fmtDay(periodStart.value)} – ${fmtDay(last, true)}`
})

function navigate(dir: number) {
  const c = cursor.value
  cursor.value = view.value === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view.value === 'agenda' ? 14 : 7))
}
const goToday = () => (cursor.value = today)
function setView(v: ViewKey) {
  view.value = v
}

// ---------------------------------------------------------------- carregamento
let counter = 0
// Em contexto lê-se uma janela larga uma única vez; sem contexto, só o período visível
const loadWindow = computed(() => (context.value ? { start: addDays(today, -90), end: addDays(today, 180) } : { start: periodStart.value, end: periodEnd.value }))
const loadKey = computed(() => `${tab.value}|${context.value?.entity}|${context.value?.id}|${loadWindow.value.start.getTime()}|${loadWindow.value.end.getTime()}`)

async function load() {
  const current = ++counter
  loading.value = true
  loadError.value = ''
  try {
    const result = await getEvents(tab.value, loadWindow.value.start, loadWindow.value.end, context.value)
    if (current !== counter) return // resposta antiga
    events_.value = result.events
    failed.value = result.failed
  } catch (error) {
    console.error(error)
    if (current !== counter) return
    events_.value = []
    failed.value = []
    loadError.value = (error as Error).message || 'Erro ao comunicar com o CRM.'
  } finally {
    if (current === counter) loading.value = false
  }
}

async function loadCounts() {
  try {
    counts.value = await getTodayCounts(context.value)
  } catch (error) {
    console.error(error)
  }
}

const reload = () => Promise.all([load(), loadCounts()])

watch(loadKey, load)
watch(() => context.value && `${context.value.entity}${context.value.id}`, loadCounts)

// ---------------------------------------------------------------- separadores, filtros e legenda
function selectTab(k: TabKey) {
  if (k === tab.value) return
  tab.value = k
  events_.value = []
  selected.value = null
  clearFilters()
  groupKey.value = MODULES[k].groups[0]!.key
  view.value = k === 'reservations' ? 'month' : view.value
}

// Filtros gerais (pesquisa e campos): servem de base para as contagens
const base = computed(() => {
  const f = filters
  const q = norm(f.q.trim())
  return events_.value.filter((e) => {
    if (f.type && e.kind !== f.type) return false
    if (f.ownerId && e.ownerId !== f.ownerId) return false
    if (f.vehicle && e.vehicle !== f.vehicle) return false
    if (f.client && e.client !== f.client) return false
    if (f.city && e.city !== f.city) return false
    if (f.category && e.category !== f.category) return false
    if (f.unit && !e.unitId.split(',').includes(f.unit)) return false
    if (f.mine && e.ownerId !== session.me?.id) return false
    if (q) {
      const text = norm([e.code, e.reservation?.name, e.client, e.city, e.address, e.unit, e.equipment, e.category, e.vehicle, e.ownerName, e.kind].filter(Boolean).join(' '))
      if (!text.includes(q)) return false
    }
    return true
  })
})

// Estados/módulos ocultos pela legenda. Na Visão geral cada módulo mantém os seus estados ocultos por defeito.
const isHidden = (e: CalEvent) =>
  tab.value === 'overview' ? hiddenModules.value.includes(e.module) || defaultHidden(e.module).includes(e.status) : hiddenStatuses.value.includes(e.status)
const shown = computed(() => base.value.filter((e) => !isHidden(e)))
const now = () => new Date()

const kpiItems = computed<KpiItem[]>(() => cfg.value.kpis.map((k) => ({ id: k.id, label: k.label, tone: k.tone, count: shown.value.filter((e) => k.fn(e, now())).length })))

const visible = computed(() => {
  const k = cfg.value.kpis.find((x) => x.id === preset.value)
  return shown.value.filter((e) => !k || k.fn(e, now()))
})

const legendTitle = computed(() => (tab.value === 'overview' ? 'Módulos' : 'Estados'))
const legendItems = computed<LegendItem[]>(() =>
  tab.value === 'overview' ? MODULE_ORDER.map((m) => ({ key: m, name: MODULES[m].tab, color: MODULES[m].color })) : cfg.value.statuses.map((s) => ({ key: s.name, name: s.name, color: s.color })),
)
const legendCounts = computed(() => {
  const out: Record<string, number> = {}
  for (const e of base.value) {
    const k = tab.value === 'overview' ? e.module : e.status
    out[k] = (out[k] ?? 0) + 1
  }
  return out
})
const legendHidden = computed<string[]>(() => (tab.value === 'overview' ? hiddenModules.value : hiddenStatuses.value))
function toggleLegend(key: string) {
  if (tab.value === 'overview') {
    const k = key as ModuleKey
    hiddenModules.value = hiddenModules.value.includes(k) ? hiddenModules.value.filter((m) => m !== k) : [...hiddenModules.value, k]
  } else hiddenStatuses.value = hiddenStatuses.value.includes(key) ? hiddenStatuses.value.filter((s) => s !== key) : [...hiddenStatuses.value, key]
}

const togglePreset = (id: string) => (preset.value = preset.value === id ? null : id)

function clearFilters() {
  Object.assign(filters, emptyFilters())
  preset.value = null
  hiddenStatuses.value = tab.value === 'overview' ? [] : defaultHidden(tab.value as ModuleKey)
  hiddenModules.value = []
}
// Ao mudar de separador, os estados ocultos voltam ao padrão desse módulo
watch(tab, (k) => (hiddenStatuses.value = k === 'overview' ? [] : defaultHidden(k as ModuleKey)), { immediate: true })

const hasActiveFilters = computed(() => !!(filters.q || filters.type || filters.ownerId || filters.vehicle || filters.client || filters.city || filters.category || filters.unit || filters.mine || preset.value))

const extraSummary = computed(() => {
  const out: string[] = []
  const k = cfg.value.kpis.find((x) => x.id === preset.value)
  if (k) out.push(`Atalho: ${k.label}`)
  if (tab.value === 'overview') {
    if (hiddenModules.value.length) out.push(`${hiddenModules.value.length} módulo(s) oculto(s)`)
  } else {
    const extra = hiddenStatuses.value.filter((s) => !defaultHidden(tab.value as ModuleKey).includes(s)).length
    if (extra) out.push(`${extra} estado(s) oculto(s)`)
  }
  return out
})

// Opções dos filtros (lidas dos dados + listas do CRM)
const vehicleOptions = computed(() => distinct([...MODULES.deliveries.vehicles, ...events_.value.map((e) => e.vehicle)]))
const filterOptions = computed<Partial<Record<FilterKey, FilterOption[]>>>(() => {
  const ev = events_.value
  const plain = (list: string[]): FilterOption[] => list.map((v) => ({ value: v, label: v }))
  const owners = new Map<string, string>()
  for (const e of ev) if (e.ownerId) owners.set(e.ownerId, e.ownerName)
  const units = new Map<string, string>()
  for (const e of ev) if (e.unitId && !e.unitId.includes(',')) units.set(e.unitId, e.unit)
  return {
    type: plain(tab.value === 'overview' ? [] : cfg.value.types),
    owner: [...owners].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt')),
    vehicle: plain(vehicleOptions.value),
    city: plain(distinct(ev.map((e) => e.city))),
    client: plain(distinct(ev.map((e) => e.client))),
    category: plain(distinct(ev.map((e) => e.category))),
    unit: [...units].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt')),
  }
})

// ---------------------------------------------------------------- vista Mês / Semana / Agenda (FullCalendar)
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const

const fcEvents = computed<EventInput[]>(() =>
  visible.value.map((e) => {
    const color = colorOf(e, tab.value)
    const m = MODULES[e.module]
    const plainLabel = e.module === 'reservations' || e.module === 'commercial'
    return {
      id: e.id,
      title: `${e.kind ? e.kind + ' · ' : ''}${e.code}`,
      start: e.start,
      // dia inteiro com duração: o FullCalendar quer o fim exclusivo (dia seguinte)
      end: e.allDay && e.end ? toZohoDate(addDays(parseDay(e.end), 1)) : undefined,
      allDay: e.allDay,
      backgroundColor: `${color}26`,
      borderColor: color,
      textColor: '#0B3A5B',
      editable: m.draggable(e),
      extendedProps: {
        label: plainLabel ? `${e.code}${e.client ? ' · ' + e.client : ''}` : `${e.kind ? e.kind + ' · ' : ''}${e.code}`,
        sub: e.module === 'inspections' || e.module === 'maintenances' ? e.equipment || e.unit : e.module === 'reservations' ? e.unit : e.client || e.reservation?.name || '',
        flagged: m.flags(e, now()).length > 0,
      },
    }
  }),
)

const FC_VIEW: Record<Exclude<ViewKey, 'resources'>, string> = { month: 'dayGridMonth', week: 'timeGridWeek', agenda: 'agenda14' }

const calendarOptions = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: FC_VIEW[view.value === 'resources' ? 'week' : view.value],
  initialDate: cursor.value,
  views: { agenda14: { type: 'list', duration: { days: 14 } } },
  locale: ptLocale,
  firstDay: 1,
  height: 'auto',
  headerToolbar: false, // a barra de ferramentas é do widget (CalToolbar)
  fixedWeekCount: true,
  allDaySlot: true,
  slotMinTime: '07:00:00',
  slotMaxTime: '20:00:00',
  scrollTime: '07:30:00',
  nowIndicator: true,
  slotEventOverlap: false,
  eventDisplay: 'block',
  dayMaxEvents: true,
  moreLinkContent: (a) => `+${a.num} mais`,
  slotLabelFormat: TIME_FORMAT,
  eventTimeFormat: TIME_FORMAT,
  events: fcEvents.value,
  editable: true, // cada registo restringe com a sua propriedade "editable"
  eventDurationEditable: false,
  eventAllow: (drop, dragged) => !!dragged && dragged.allDay === drop.allDay, // não mistura dia inteiro com horas
  eventDrop: onEventDrop,
  eventClick: (info: EventClickArg) => openById(info.event.id),
}))

// o FullCalendar segue a data do widget
watch(cursor, (c) => fc.value?.getApi().gotoDate(c))

// ---------------------------------------------------------------- reagendar e atribuir (com confirmação)
interface Pending extends PendingChange {
  e: CalEvent
  newStart: Date | null
  set: { ownerId?: string; ownerName?: string; vehicle?: string } | null
  revert: () => void
  fromDrawer: boolean
}
const pending = ref<Pending | null>(null)
const saving = ref(false)

const fmtWhen = (e: CalEvent, d: Date | null) => {
  const date = d ?? (e.allDay ? parseDay(e.start) : new Date(e.start))
  return e.allDay ? date.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : date.toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

function askMove(e: CalEvent, newStart: Date | null, set: Pending['set'], revert: () => void, fromDrawer = false) {
  const rows: [string, string][] = [['Registo', `${MODULES[e.module].tab} · ${e.code}`]]
  if (newStart) rows.push(['Data', `${fmtWhen(e, null)} → ${fmtWhen(e, newStart)}`])
  if (set?.ownerId !== undefined) rows.push([MODULES[e.module].assign.owner ?? MODULES[e.module].ownerLabel, `${e.ownerName || 'Sem atribuição'} → ${set.ownerName || 'Sem atribuição'}`])
  if (set?.vehicle !== undefined) rows.push(['Viatura', `${e.vehicle || 'Sem atribuição'} → ${set.vehicle || 'Sem atribuição'}`])
  pending.value = { rows, e, newStart, set, revert, fromDrawer }
}

async function confirmPending() {
  const p = pending.value
  if (!p) return
  saving.value = true
  const result = await moveRecord(p.e, p.newStart, p.set)
  saving.value = false
  pending.value = null
  if (result.ok) {
    toast.success('Gravado', 'A alteração foi validada e gravada no CRM.')
    if (p.fromDrawer) selected.value = null
    await reload()
  } else {
    toast.error('Alteração recusada', result.message) // a mensagem vem do CRM
    p.revert() // o registo volta ao sítio
  }
}

function cancelPending() {
  pending.value?.revert()
  pending.value = null
}

const byId = (id: string) => events_.value.find((e) => e.id === id) ?? null

function onEventDrop(info: EventDropArg) {
  const e = byId(info.event.id)
  if (!e || !info.event.start) return info.revert()
  askMove(e, info.event.start, null, () => info.revert())
}

function onResourceMove(p: MovePayload) {
  const e = byId(p.id)
  if (!e) return
  let set: Pending['set'] = null
  if (p.group) set = group.value.edit === 'vehicle' ? { vehicle: p.group.key } : { ownerId: p.group.key, ownerName: p.group.key ? p.group.label : '' }
  if (!p.date && !set) return
  askMove(e, p.date, set, () => {}) // a vista Recursos desenha-se a partir dos dados: nada a reverter
}

const onDrawerReschedule = (date: Date) => selected.value && askMove(selected.value, date, null, () => {}, true)
const onDrawerAssign = (set: { ownerId?: string; ownerName?: string; vehicle?: string }) => selected.value && askMove(selected.value, null, set, () => {}, true)

// agrupamentos conhecidos da vista Recursos (aparecem mesmo sem registos)
const knownGroups = computed(() => {
  if (group.value.key === 'module') return MODULE_ORDER.map((m) => ({ key: m, label: MODULES[m].tab }))
  if (!group.value.edit) return []
  if (group.value.edit === 'vehicle') return vehicleOptions.value.map((v) => ({ key: v, label: v }))
  return session.users.map((u) => ({ key: u.id, label: u.full_name }))
})

// ---------------------------------------------------------------- detalhe
function openById(id: string) {
  selected.value = byId(id)
}

function openRecord() {
  const e = selected.value
  if (!e) return
  if (session.mock) return toast.info('Modo demonstração', 'No CRM, abre o registo.')
  ZOHO.CRM.UI.Record.open({ Entity: e.entity, RecordID: e.id, target: '_blank' })
}

function onDrawerContext(kind: 'reservation' | 'client') {
  const e = selected.value
  if (!e) return
  if (kind === 'reservation') {
    const id = e.module === 'reservations' ? e.id : (e.reservation?.id ?? '')
    if (id) setContext({ entity: 'Reservations', id, label: e.reservation?.name ?? e.code })
  } else if (e.clientId) setContext({ entity: 'Accounts', id: e.clientId, label: e.client })
}

// ---------------------------------------------------------------- disponibilidade e pedido de equipamento
const availFrom = ref(toZohoDate(today))
const availTo = ref(toZohoDate(addDays(today, 6)))
const requestItems = ref<RequestItem[]>([])
const requestOpen = ref(false)
const creating = ref(false)
const createError = ref('')

function toggleRequestItem(item: RequestItem) {
  const has = requestItems.value.some((i) => i.unit.id === item.unit.id)
  requestItems.value = has ? requestItems.value.filter((i) => i.unit.id !== item.unit.id) : [...requestItems.value, item]
  requestOpen.value = requestItems.value.length > 0
}
// cada equipamento tem o seu período
function updateRequestItem(unitId: string, patch: { start?: string; end?: string }) {
  requestItems.value = requestItems.value.map((i) => {
    if (i.unit.id !== unitId) return i
    const next = { ...i, ...patch }
    if (next.end < next.start) next.end = next.start // o fim acompanha o início
    return next
  })
}
function removeRequestItem(unitId: string) {
  requestItems.value = requestItems.value.filter((i) => i.unit.id !== unitId)
  if (!requestItems.value.length) requestOpen.value = false
}

async function submitRequest(p: EquipmentRequestPayload) {
  creating.value = true
  createError.value = ''
  const result = await requestEquipment(p)
  creating.value = false
  if (result.ok) {
    toast.success('Pedido gravado', result.message)
    requestItems.value = []
    requestOpen.value = false
    await reload()
  } else createError.value = result.message // fica no painel para corrigir
}

// ---------------------------------------------------------------- arranque
onMounted(async () => {
  if (window.innerWidth < 640) view.value = 'agenda' // em ecrãs estreitos a Agenda lê-se melhor que a grelha
  await session.load()
  // abertura em contexto: parâmetros do CRM (Entity/EntityId); fora do CRM aceita-se ?Entity=...&EntityId=...
  const p = paramsStore.params
  const q = new URLSearchParams(window.location.search)
  context.value = contextFrom(p.module, p.id) ?? (session.mock ? contextFrom(q.get('Entity') ?? '', q.get('EntityId') ?? '') : null)
  await reload()
})
</script>
