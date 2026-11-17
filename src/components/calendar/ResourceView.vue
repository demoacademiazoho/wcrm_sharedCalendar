<template>
  <div class="overflow-x-auto">
    <div class="min-w-[860px]">
      <!-- cabeçalho dos dias -->
      <div class="grid border-b border-eq-line" :style="{ gridTemplateColumns: COLS }">
        <div class="px-2 py-2 text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">{{ group.label }}</div>
        <div v-for="d in days" :key="+d" :class="['px-2 py-2 text-center text-xs font-bold', sameDay(d, today) ? 'text-eq-orange' : 'text-eq-navy']">
          {{ WEEKDAY[d.getDay()] }} <b class="block text-base">{{ d.getDate() }}</b>
        </div>
      </div>

      <div v-if="!rows.length" class="px-5 py-12 text-center text-eq-muted">Sem registos neste período para os filtros ativos.</div>

      <!-- uma linha por recurso; a última é sempre "Sem atribuição" -->
      <div v-for="r in rows" :key="r.key" class="grid border-b border-eq-line last:border-b-0" :style="{ gridTemplateColumns: COLS }">
        <div :class="['flex items-center justify-between gap-2 border-r border-eq-line px-2.5 py-2 text-[13px] font-bold', r.key === '' ? 'bg-orange-50 text-eq-orange' : 'text-eq-navy']">
          <span class="truncate">{{ r.key === '' ? 'Sem atribuição' : r.label }}</span>
          <small class="rounded-full bg-slate-200/70 px-1.5 text-[11px] text-eq-navy">{{ countOf(r.key) }}</small>
        </div>
        <div
          v-for="d in days"
          :key="+d"
          :class="['flex min-h-[64px] flex-col gap-1 border-r border-eq-line p-1 last:border-r-0', sameDay(d, today) ? 'bg-orange-50/60' : [0, 6].includes(d.getDay()) ? 'bg-slate-50' : '', over === `${r.key}|${+d}` ? 'outline-2 -outline-offset-2 outline-dashed outline-eq-blue' : '']"
          @dragover="onOver($event, r.key, d)"
          @dragleave="over = ''"
          @drop="onDrop($event, r, d)"
        >
          <button
            v-for="e in cell(r.key, d)"
            :key="e.id"
            type="button"
            :draggable="canDrag(e)"
            :class="['w-full overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11.5px] leading-tight', canDrag(e) ? 'cursor-grab' : 'cursor-pointer']"
            :style="{ backgroundColor: `${color(e)}26`, borderLeftColor: color(e) }"
            :title="`${e.code} · ${e.status}`"
            @click="$emit('open', e.id)"
            @dragstart="onStart($event, e, d)"
            @dragend="dragging = null"
          >
            <b>{{ e.allDay ? '' : hm(e.start) + ' ' }}{{ label(e) }}</b>
            <span v-if="hasFlag(e)" class="ml-1 inline-grid size-3.5 place-items-center rounded-full bg-eq-red align-middle text-[10px] font-extrabold text-white" title="Requer atenção">!</span>
            <small class="block truncate text-eq-muted">{{ e.client || e.unit || e.status }}</small>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CalEvent } from '@/interfaces/calendar'
import { MODULES, overlapsDay, type GroupConfig } from '@/config/modules'
import { addDays, parseDay } from '@/utils/dates'

export interface MovePayload {
  id: string
  /** nova data de início (null = o dia não mudou) */
  date: Date | null
  /** novo valor do recurso (só em agrupamentos editáveis e se mudou) */
  group: { key: string; label: string } | null
}

const props = defineProps<{
  events: CalEvent[]
  start: Date
  group: GroupConfig
  /** valores conhecidos do agrupamento (utilizadores, viaturas...) mesmo sem registos */
  known: { key: string; label: string }[]
  today: Date
  colorOf: (e: CalEvent) => string
  hasFlag: (e: CalEvent) => boolean
  canDrag: (e: CalEvent) => boolean
}>()
const emit = defineEmits<{ open: [id: string]; move: [p: MovePayload] }>()

const COLS = '170px repeat(7, minmax(120px, 1fr))'
const WEEKDAY = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(props.start, i)))
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false })
const color = (e: CalEvent) => props.colorOf(e)
const label = (e: CalEvent) => (e.module === 'reservations' || e.module === 'commercial' ? e.code : `${e.kind ? e.kind + ' · ' : ''}${e.code}`)

// Valor do agrupamento de cada registo ('' = sem atribuição)
function keyOf(e: CalEvent): string {
  switch (props.group.key) {
    case 'module': return e.module
    case 'owner': return e.ownerId
    case 'vehicle': return e.vehicle
    case 'category': return e.category
    case 'equipment': return e.equipment
    default: return e.kind
  }
}
function labelOf(e: CalEvent): string {
  switch (props.group.key) {
    case 'module': return MODULES[e.module].tab
    case 'owner': return e.ownerName
    default: return keyOf(e)
  }
}

const visible = computed(() => props.events.filter((e) => days.value.some((d) => overlapsDay(e, d))))

const rows = computed(() => {
  const map = new Map<string, string>()
  for (const k of props.known) map.set(k.key, k.label)
  for (const e of visible.value) if (keyOf(e)) map.set(keyOf(e), labelOf(e) || keyOf(e))
  const list = [...map].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt'))
  // a linha "Sem atribuição" existe sempre; fica no fim
  return visible.value.length || props.known.length ? [...list, { key: '', label: 'Sem atribuição' }] : []
})

const countOf = (key: string) => visible.value.filter((e) => keyOf(e) === key).length
const cell = (key: string, d: Date) => visible.value.filter((e) => keyOf(e) === key && overlapsDay(e, d)).sort((a, b) => a.start.localeCompare(b.start))

// --- arrastar entre células ---------------------------------------------------------------------
const dragging = ref<{ e: CalEvent; from: Date } | null>(null)
const over = ref('')

function onStart(ev: DragEvent, e: CalEvent, from: Date) {
  if (!props.canDrag(e)) return ev.preventDefault()
  dragging.value = { e, from }
  ev.dataTransfer?.setData('text/plain', e.id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}
function onOver(ev: DragEvent, key: string, d: Date) {
  if (!dragging.value) return
  ev.preventDefault()
  over.value = `${key}|${+d}`
}
function onDrop(ev: DragEvent, row: { key: string; label: string }, d: Date) {
  const cur = dragging.value
  over.value = ''
  dragging.value = null
  if (!cur) return
  ev.preventDefault()
  const delta = Math.round((+d - +cur.from) / 864e5)
  let date: Date | null = null
  if (delta !== 0) {
    const base = cur.e.allDay ? parseDay(cur.e.start) : new Date(cur.e.start)
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta, base.getHours(), base.getMinutes())
  }
  const editable = !!props.group.edit
  const group = editable && row.key !== keyOf(cur.e) ? { key: row.key, label: row.key === '' ? '' : row.label } : null
  if (!date && !group) return
  emit('move', { id: cur.e.id, date, group })
}
</script>
