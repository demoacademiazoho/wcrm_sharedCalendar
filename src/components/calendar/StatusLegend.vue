<template>
  <div class="mb-3 flex flex-wrap items-center gap-1.5 border-b border-eq-line pb-3">
    <span class="mr-1.5 text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">{{ title }}</span>
    <button
      v-for="s in items"
      :key="s.key"
      type="button"
      :class="[
        'flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs text-eq-muted hover:bg-slate-50',
        hidden.includes(s.key) ? 'line-through opacity-45' : '',
      ]"
      :title="hidden.includes(s.key) ? 'Mostrar' : 'Ocultar'"
      :aria-pressed="!hidden.includes(s.key)"
      @click="$emit('toggle', s.key)"
    >
      <i class="block size-2.5 rounded-full" :style="{ backgroundColor: s.color }" />
      {{ s.name }}
      <b class="font-bold text-eq-navy">{{ counts[s.key] ?? 0 }}</b>
    </button>
  </div>
</template>

<script setup lang="ts">
// Legenda clicável: nos módulos mostra os estados (com contagens); na Visão geral mostra os módulos (liga/desliga)
export interface LegendItem {
  key: string
  name: string
  color: string
}

defineProps<{ title: string; items: LegendItem[]; counts: Record<string, number>; hidden: string[] }>()
defineEmits<{ toggle: [key: string] }>()
</script>
