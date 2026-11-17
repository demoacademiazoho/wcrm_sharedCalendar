<template>
  <div v-if="context" class="flex items-center gap-3 rounded-[10px] border border-eq-light bg-sky-100 px-3.5 py-2 text-[13px] text-eq-navy">
    <span>A mostrar apenas os registos relacionados com <b>{{ context.label }}</b>.</span>
    <button type="button" class="ml-auto cursor-pointer rounded-lg border border-eq-blue bg-white px-2.5 py-1 font-bold text-eq-blue hover:bg-sky-50" @click="$emit('remove')">Remover contexto</button>
  </div>
</template>

<script setup lang="ts">
import type { CalContext } from '@/interfaces/calendar'

defineProps<{ context: CalContext | null }>()
defineEmits<{ remove: [] }>()
</script>
