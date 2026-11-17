<template>
  <section class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
    <button
      v-for="k in items"
      :key="k.id"
      type="button"
      :class="[
        'flex cursor-pointer items-center justify-between rounded-xl border border-l-[5px] px-3.5 py-2.5 text-left text-[13px] font-bold transition-shadow hover:shadow-md',
        active === k.id ? 'border-eq-navy bg-eq-navy text-white' : 'border-eq-line bg-white text-eq-navy',
        active === k.id ? '' : TONE[k.tone],
      ]"
      :aria-pressed="active === k.id"
      @click="$emit('toggle', k.id)"
    >
      <span>{{ k.label }}</span>
      <b
        :class="[
          'text-2xl font-extrabold',
          active === k.id ? 'text-white' : k.tone === 'red' ? 'text-eq-red' : k.tone === 'orange' ? 'text-eq-orange' : 'text-eq-navy',
        ]"
      >
        {{ k.count }}
      </b>
    </button>
  </section>
</template>

<script setup lang="ts">
export interface KpiItem {
  id: string
  label: string
  tone: 'blue' | 'orange' | 'red'
  count: number
}

defineProps<{ items: KpiItem[]; active: string | null }>()
defineEmits<{ toggle: [id: string] }>()

// Cor da barra lateral de cada atalho
const TONE = {
  blue: 'border-l-eq-blue',
  orange: 'border-l-eq-orange',
  red: 'border-l-eq-red',
} as const
</script>
