<template>
  <Transition name="eq-scrim">
    <div v-if="event" class="fixed inset-0 z-50 bg-eq-navy/35" @click="$emit('close')" />
  </Transition>
  <Transition name="eq-drawer">
    <aside v-if="event" class="fixed inset-y-0 right-0 z-[60] flex w-[400px] max-w-full flex-col overflow-y-auto bg-white shadow-2xl" aria-label="Detalhe do registo">
      <header class="relative border-t-[5px] bg-eq-navy px-[18px] py-4 text-white" :style="{ borderTopColor: color }">
        <small class="text-[11px] font-bold uppercase tracking-wider text-eq-light">{{ cfg.tab }}{{ event.kind ? ' · ' + event.kind : '' }} · {{ event.code }}</small>
        <h3 class="mt-1 pr-8 text-lg font-bold">{{ title }}</h3>
        <button type="button" class="absolute right-3 top-3 cursor-pointer text-2xl leading-none text-white" aria-label="Fechar" @click="$emit('close')">&times;</button>
      </header>

      <div class="flex flex-col gap-3 px-[18px] py-3.5">
        <span class="w-fit rounded-full px-3 py-0.5 text-xs font-bold text-white" :style="{ backgroundColor: color }">{{ event.status }}</span>

        <!-- alertas do registo -->
        <div v-for="f in flags" :key="f.key + f.text" :class="['rounded-md border-l-4 px-2.5 py-1.5 text-[12.5px]', f.key === 'late' ? 'border-eq-red bg-red-50' : 'border-eq-orange bg-orange-50']">
          {{ f.text }}
        </div>

        <dl class="text-[13.5px]">
          <div v-for="[label, value] in rows" :key="label" class="flex justify-between gap-3.5 border-b border-eq-line py-2">
            <dt class="flex-none text-eq-muted">{{ label }}</dt>
            <dd class="text-right font-semibold">{{ value }}</dd>
          </div>
        </dl>

        <button type="button" class="cursor-pointer rounded-[10px] border border-eq-navy bg-eq-navy px-3.5 py-2.5 text-sm font-bold text-white hover:bg-eq-navy-dark" @click="$emit('open-record')">
          Abrir registo no CRM
        </button>

        <template v-if="canMove">
          <!-- reagendar por data (dia inteiro) ou por data e hora -->
          <div class="mt-1 grid grid-cols-[1fr_auto] items-end gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">{{ event.allDay ? 'Nova data' : 'Nova data e hora' }}</span>
              <input v-model="newDate" :type="event.allDay ? 'date' : 'datetime-local'" class="w-full rounded-lg border border-eq-line px-2.5 py-2 text-sm outline-none focus:border-eq-blue" />
            </label>
            <button type="button" class="cursor-pointer rounded-[10px] border border-eq-line bg-white px-3.5 py-2 text-sm font-bold hover:border-eq-blue" @click="submit">Reagendar</button>
          </div>
          <!-- atribuição: Responsável e Viatura, Inspetor ou Técnico -->
          <label v-if="cfg.assign.owner" class="flex flex-col gap-1">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">{{ cfg.assign.owner }}</span>
            <select class="rounded-lg border border-eq-line bg-white px-2.5 py-2 text-sm outline-none focus:border-eq-blue" :value="event.ownerId" @change="onOwner(($event.target as HTMLSelectElement).value)">
              <option value="">Sem atribuição</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
            </select>
          </label>
          <label v-if="cfg.assign.vehicle" class="flex flex-col gap-1">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Viatura</span>
            <select class="rounded-lg border border-eq-line bg-white px-2.5 py-2 text-sm outline-none focus:border-eq-blue" :value="event.vehicle" @change="$emit('assign', { vehicle: ($event.target as HTMLSelectElement).value })">
              <option value="">Sem atribuição</option>
              <option v-for="v in vehicles" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>
          <p class="text-xs text-eq-muted">Antes de gravar pede-se confirmação. A validação é feita pelo CRM; se recusar, a mensagem aparece e nada muda.</p>
        </template>
        <p v-else class="rounded-md border-l-4 border-eq-orange bg-orange-50 px-2.5 py-1.5 text-[12.5px]">O estado deste registo não permite reagendar nem atribuir.</p>

        <!-- ver tudo (abre o calendário em contexto) -->
        <button v-if="event.reservation && !(context?.entity === 'Reservations')" type="button" class="cursor-pointer rounded-[10px] border border-eq-line bg-white px-3.5 py-2.5 text-sm font-bold hover:border-eq-blue" @click="$emit('context', 'reservation')">
          Ver tudo desta reserva{{ event.reservation.name ? ' (' + event.reservation.name + ')' : '' }}
        </button>
        <button v-if="event.clientId && !(context?.entity === 'Accounts')" type="button" class="cursor-pointer rounded-[10px] border border-eq-line bg-white px-3.5 py-2.5 text-sm font-bold hover:border-eq-blue" @click="$emit('context', 'client')">
          Ver tudo deste cliente
        </button>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CalContext, CalEvent, CrmUser } from '@/interfaces/calendar'
import { MODULES, statusColor } from '@/config/modules'

const props = defineProps<{ event: CalEvent | null; users: CrmUser[]; vehicles: string[]; context: CalContext | null }>()
const emit = defineEmits<{
  close: []
  'open-record': []
  reschedule: [date: Date]
  assign: [set: { ownerId?: string; ownerName?: string; vehicle?: string }]
  context: [kind: 'reservation' | 'client']
}>()

const newDate = ref('')
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
watch(
  () => props.event,
  (e) => {
    if (!e) return
    newDate.value = e.allDay ? e.start.slice(0, 10) : `${ymd(new Date(e.start))}T${pad(new Date(e.start).getHours())}:${pad(new Date(e.start).getMinutes())}`
  },
  { immediate: true },
)

const cfg = computed(() => MODULES[props.event?.module ?? 'deliveries'])
const color = computed(() => (props.event ? statusColor(props.event) : '#6B7A90'))
const flags = computed(() => (props.event ? cfg.value.flags(props.event, new Date()) : []))
const canMove = computed(() => !!props.event && cfg.value.draggable(props.event))
const title = computed(() => {
  const e = props.event
  if (!e) return ''
  return e.module === 'inspections' || e.module === 'maintenances' ? e.equipment || e.unit || e.code : e.client || e.reservation?.name || e.code
})

const fmtDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Campos de cada módulo (a confirmar no Dicionário de Dados v6)
const rows = computed<[string, string][]>(() => {
  const e = props.event
  if (!e) return []
  const out: [string, string][] = []
  const c = cfg.value
  if (e.kind) out.push([c.typeLabel || 'Tipo', e.kind])
  const multiDay = e.allDay && e.end && e.end !== e.start
  out.push(e.allDay ? [multiDay ? 'Período' : 'Data', multiDay ? `${fmtDay(e.start)} a ${fmtDay(e.end!)}` : fmtDay(e.start)] : ['Data e hora', fmtDT(e.start)])
  if (e.module === 'deliveries' || e.module === 'inspections') out.push(['Reserva', e.reservation?.name || '—'])
  if (e.module !== 'maintenances') out.push(['Cliente', e.client || '—'])
  if (e.module === 'deliveries' || e.module === 'reservations') out.push(['Localidade', e.city || '—'])
  if (e.address) out.push(['Morada', e.address])
  if (e.module !== 'commercial') out.push(['Equipamento', e.equipment ? `${e.equipment}${e.unit ? ' (' + e.unit + ')' : ''}` : e.unit || '—'])
  out.push([c.ownerLabel, e.ownerName || '—'])
  if (c.assign.vehicle) out.push(['Viatura', e.vehicle || '—'])
  if (e.module === 'reservations' && e.validUntil) out.push(['Pré-reserva válida até', fmtDT(e.validUntil)])
  if (e.module === 'commercial' && e.value != null) out.push(['Valor', `${e.value} €`])
  return [...out, ...e.rows]
})

function submit() {
  if (!newDate.value) return
  emit('reschedule', props.event?.allDay ? new Date(`${newDate.value}T00:00:00`) : new Date(newDate.value))
}

function onOwner(id: string) {
  emit('assign', { ownerId: id, ownerName: props.users.find((u) => u.id === id)?.full_name ?? '' })
}
</script>

<style>
.eq-scrim-enter-active,
.eq-scrim-leave-active { transition: opacity 0.2s; }
.eq-scrim-enter-from,
.eq-scrim-leave-to { opacity: 0; }
.eq-drawer-enter-active,
.eq-drawer-leave-active { transition: transform 0.22s; }
.eq-drawer-enter-from,
.eq-drawer-leave-to { transform: translateX(105%); }
</style>
