<template>
  <div class="flex flex-col gap-4">
    <!-- Filtros -->
    <div class="flex flex-wrap items-end gap-4 rounded-xl border border-[#E3E8EE] bg-white p-4">
      <div class="w-56">
        <Select v-model="filters.responsibleId" label="Responsável" :options="responsibleOptions" />
      </div>
      <div class="w-56">
        <Select v-model="filters.vehicle" label="Viatura" :options="vehicleOptions" />
      </div>
      <button
        class="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
        @click="clearFilters"
      >
        Limpar filtros
      </button>
      <div class="ml-auto flex flex-wrap gap-3 text-xs text-zinc-600">
        <span v-for="(color, status) in STATUS_COLORS" :key="status" class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: color }" />{{ status }}
        </span>
      </div>
    </div>

    <!-- Calendário -->
    <div class="rounded-xl border border-[#E3E8EE] bg-white p-4">
      <FullCalendar :options="calendarOptions" />
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 * Calendário partilhado de Entregas e Recolhas (MR-024).
 * Fluxo:
 *  1) O FullCalendar avisa (datesSet) qual o período visível.
 *  2) Lemos do CRM só esse período (COQL em utils/deliveries.ts).
 *  3) Os filtros (Responsável, Viatura) são aplicados no widget sobre os dados lidos.
 *  4) Ao arrastar um evento, pedimos ao CRM para gravar a nova data. Quem valida é o CRM
 *     (função fn_reagendar_entrega_recolha); se recusar, o evento volta ao sítio e mostramos a mensagem.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import ptLocale from '@fullcalendar/core/locales/pt'
import type {
  CalendarOptions,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import Select from '@/components/form/Select.vue'
import { useToast } from '@/composables/useToast'
import { getAllUsers } from '@/utils/zohoFunctions'
import { getDeliveries, rescheduleDelivery } from '@/utils/deliveries'
import type { ZohoInterface } from '@/interfaces/zohoInterface'
import type { CalendarFilters, Delivery, LogisticsStatus, Vehicle } from '@/interfaces/delivery'

declare const ZOHO: ZohoInterface

// Cores por estado (paleta Equiply)
const STATUS_COLORS: Record<LogisticsStatus, string> = {
  Agendada: '#1F6FA8',
  'Em curso': '#F2541B',
  Concluída: '#2E9E6B',
  Falhada: '#C8372D',
  Reagendada: '#6B7F94',
}
// Só estes estados podem ser arrastados
const DRAGGABLE: LogisticsStatus[] = ['Agendada', 'Reagendada']
const VEHICLES: Vehicle[] = ['Carrinha 1', 'Carrinha 2', 'Camião grua']

const toast = useToast() // avisos no canto do ecrã
const deliveries = ref<Delivery[]>([]) // dados lidos do CRM para o período visível
const filters = reactive<CalendarFilters>({ responsibleId: '', vehicle: '' })
const users = ref<{ id: string; full_name: string }[]>([])
let lastRange: { start: Date; end: Date } | null = null // último período visível (para recarregar)
let requestCounter = 0 // identifica o pedido mais recente (evita respostas antigas)

const vehicleOptions = [
  { value: '', label: 'Todas' },
  ...VEHICLES.map((v) => ({ value: v, label: v })),
]
const responsibleOptions = computed(() => [
  { value: '', label: 'Todos' },
  ...users.value.map((u) => ({ value: u.id, label: u.full_name })),
])

function clearFilters() {
  filters.responsibleId = ''
  filters.vehicle = ''
}

// Eventos = entregas filtradas, convertidas para o formato do FullCalendar
const events = computed<EventInput[]>(() =>
  deliveries.value
    .filter((d) => !filters.responsibleId || d.Responsible?.id === filters.responsibleId)
    .filter((d) => !filters.vehicle || d.Vehicle === filters.vehicle)
    .map((d) => ({
      id: d.id,
      title: `${d.Logistics_Type} · ${d.Name}`,
      start: d.Scheduled_DateTime,
      backgroundColor: STATUS_COLORS[d.Logistics_Status],
      borderColor: STATUS_COLORS[d.Logistics_Status],
      editable: DRAGGABLE.includes(d.Logistics_Status),
      extendedProps: { status: d.Logistics_Status },
    })),
)

async function loadRange(start: Date, end: Date) {
  const current = ++requestCounter
  try {
    const data = await getDeliveries(start, end)
    if (current === requestCounter) deliveries.value = data // ignora respostas antigas
  } catch (error) {
    console.error(error)
    toast.error('Não foi possível carregar o calendário', 'Tente novamente.')
  }
}

function onDatesSet(arg: DatesSetArg) {
  lastRange = { start: arg.start, end: arg.end }
  loadRange(arg.start, arg.end)
}

// Arrastar: o CRM decide. Se recusar, o evento volta ao sítio e mostramos a mensagem.
async function onEventDrop(info: EventDropArg) {
  if (!info.event.start) return info.revert()
  const result = await rescheduleDelivery(info.event.id, info.event.start)
  if (result.ok) {
    toast.success('Reagendado', 'A nova data foi gravada no CRM.')
    if (lastRange) loadRange(lastRange.start, lastRange.end)
  } else {
    info.revert()
    toast.error('Reagendamento recusado', result.message)
  }
}

function onEventClick(info: EventClickArg) {
  ZOHO.CRM.UI.Record.open({ Entity: 'Deliveries_Pickups', RecordID: info.event.id, target: '_blank' })
}

const calendarOptions = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  locale: ptLocale,
  firstDay: 1,
  height: 'auto',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,listWeek',
  },
  events: events.value,
  editable: true, // cada evento restringe com a sua propriedade "editable"
  datesSet: onDatesSet,
  eventDrop: onEventDrop,
  eventClick: onEventClick,
}))

onMounted(async () => {
  try {
    users.value = await getAllUsers('ActiveUsers')
  } catch (error) {
    console.error(error)
  }
})
</script>
