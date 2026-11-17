<template>
  <nav class="flex gap-1 overflow-x-auto overflow-y-hidden border-b-2 border-eq-line" style="scrollbar-width: none" aria-label="Módulos do calendário">
    <button
      v-for="m in modules"
      :key="m.key"
      type="button"
      :class="[
        '-mb-0.5 flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-sm font-bold',
        m.key === active ? 'border-eq-orange text-eq-navy' : 'border-transparent text-eq-muted hover:text-eq-blue',
      ]"
      :aria-current="m.key === active ? 'page' : undefined"
      @click="$emit('select', m.key)"
    >
      <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="ICONS[m.key]" />
      {{ m.tab }}
      <!-- nº de registos de hoje (— se a leitura falhou) -->
      <b
        :class="['min-w-5 rounded-full px-1.5 text-center text-[11px]', m.key === active ? 'bg-eq-navy text-white' : 'bg-slate-300/70 text-eq-navy']"
        title="Registos de hoje"
      >
        {{ counts[m.key] ?? '—' }}
      </b>
    </button>
  </nav>
</template>

<script setup lang="ts">
import type { TabKey } from '@/interfaces/calendar'
import type { ModuleConfig } from '@/config/modules'

defineProps<{ modules: ModuleConfig[]; active: TabKey; counts: Partial<Record<TabKey, number | null>> }>()
defineEmits<{ select: [key: TabKey] }>()

// Ícones (traços SVG) de cada separador
const ICONS: Record<TabKey, string> = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  deliveries: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  inspections: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 14l2 2 4-5"/>',
  reservations: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  maintenances: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  commercial: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
}
</script>
