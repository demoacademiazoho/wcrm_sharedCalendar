<template>
  <div class="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
    <div class="flex items-center gap-2">
      <div class="inline-flex overflow-hidden rounded-lg">
        <button type="button" class="cursor-pointer bg-eq-navy px-3 py-1.5 text-lg font-bold leading-none text-white hover:bg-eq-navy-dark" aria-label="Anterior" @click="$emit('nav', -1)">&#8249;</button>
        <button type="button" class="cursor-pointer border-l border-white/20 bg-eq-navy px-3 py-1.5 text-lg font-bold leading-none text-white hover:bg-eq-navy-dark" aria-label="Seguinte" @click="$emit('nav', 1)">&#8250;</button>
      </div>
      <button type="button" class="cursor-pointer rounded-lg bg-eq-muted px-3 py-1.5 text-[13px] font-bold text-white hover:brightness-90" @click="$emit('today')">Hoje</button>
    </div>
    <h2 class="order-last w-full text-center text-lg font-bold text-eq-navy sm:order-none sm:w-auto">{{ title }}</h2>
    <div class="flex flex-wrap items-center gap-2.5">
      <label v-if="view === 'resources'" class="flex items-center gap-1.5 text-xs font-semibold text-eq-muted">
        Agrupar por
        <select class="rounded-lg border border-eq-line bg-white px-2 py-1.5 text-sm text-eq-navy outline-none focus:border-eq-blue" :value="group" @change="$emit('group', ($event.target as HTMLSelectElement).value)">
          <option v-for="g in groups" :key="g.key" :value="g.key">{{ g.label }}</option>
        </select>
      </label>
      <div class="inline-flex overflow-hidden rounded-lg" role="group" aria-label="Vista">
        <button
          v-for="v in VIEWS"
          :key="v.key"
          type="button"
          :class="['cursor-pointer px-3 py-1.5 text-[13px] font-bold text-white', v.key === view ? 'bg-eq-navy-dark' : 'bg-eq-navy hover:bg-eq-navy-dark']"
          :aria-pressed="v.key === view"
          @click="$emit('view', v.key)"
        >
          {{ v.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ViewKey } from '@/interfaces/calendar'
import type { GroupConfig } from '@/config/modules'

defineProps<{ title: string; view: ViewKey; groups: GroupConfig[]; group: string }>()
defineEmits<{ nav: [dir: number]; today: []; view: [v: ViewKey]; group: [key: string] }>()

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'month', label: 'Mês' },
  { key: 'week', label: 'Semana' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'resources', label: 'Recursos' },
]
</script>
