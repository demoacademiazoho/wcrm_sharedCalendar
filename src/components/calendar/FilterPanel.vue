<template>
  <section class="rounded-xl border border-eq-line bg-white px-4 py-3">
    <!-- Linha sempre visível: pesquisa + botão que abre/fecha os restantes filtros -->
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex flex-col gap-1">
        <label for="eq-q" class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Pesquisar</label>
        <input
          id="eq-q"
          type="search"
          :value="filters.q"
          :placeholder="module.searchHint"
          class="w-[min(340px,70vw)] rounded-lg border border-eq-line px-3 py-2 text-sm outline-none focus:border-eq-blue focus:ring-2 focus:ring-eq-blue/20"
          @input="emit('change', { q: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <button
        type="button"
        class="flex h-9 min-w-[180px] flex-1 cursor-pointer items-center gap-2.5 text-left"
        :aria-expanded="open"
        aria-controls="eq-filters-body"
        @click="open = !open"
      >
        <h3 class="text-[13px] font-extrabold uppercase tracking-wider text-eq-navy">Filtros</h3>
        <span :class="['rounded-full px-2 text-[11px] font-extrabold', parts.length ? 'bg-eq-orange text-white' : 'bg-slate-300/70 text-eq-navy']">
          {{ parts.length }}
        </span>
        <span v-if="!open" class="flex-1 truncate text-xs text-eq-muted">
          {{ parts.length ? parts.join(' · ') : 'Sem filtros ativos' }}
        </span>
        <span class="ml-auto grid size-[30px] flex-none place-items-center rounded-lg border border-eq-line bg-white text-eq-navy hover:border-eq-blue hover:text-eq-blue" aria-hidden="true">
          <svg :class="['size-4 transition-transform duration-200', open ? '' : '-rotate-90']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
    </div>

    <!-- Painel recolhível (fechado por defeito); os filtros mudam com o módulo -->
    <div id="eq-filters-body" :class="['grid transition-[grid-template-rows] duration-200', open ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]']">
      <div class="overflow-hidden">
        <div class="flex flex-wrap items-end gap-x-3.5 gap-y-3">
          <label v-for="f in module.filters" :key="f" class="flex flex-col gap-1">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">{{ labelOf(f) }}</span>
            <select :class="SELECT" :value="valueOf(f)" @change="emit('change', patchOf(f, ($event.target as HTMLSelectElement).value))">
              <option value="">Todos</option>
              <option v-for="o in options[f] ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button
            type="button"
            :class="['cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-bold', filters.mine ? 'border-eq-navy bg-eq-navy text-white' : 'border-eq-line bg-white text-eq-muted']"
            title="Mostrar apenas registos em que o responsável sou eu"
            :aria-pressed="filters.mine"
            @click="emit('change', { mine: !filters.mine })"
          >
            Só os meus
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-lg border border-eq-line bg-white px-3.5 py-2 text-sm font-semibold text-eq-muted hover:border-eq-blue hover:text-eq-blue"
            @click="emit('clear')"
          >
            Limpar filtros
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CalFilters } from '@/interfaces/calendar'
import type { FilterKey, ModuleConfig } from '@/config/modules'

export interface FilterOption {
  value: string
  label: string
}

const props = defineProps<{
  module: ModuleConfig
  filters: CalFilters
  options: Partial<Record<FilterKey, FilterOption[]>>
  /** atalho e estados ocultos ativos fora deste painel, só para o resumo */
  extra: string[]
}>()

const emit = defineEmits<{
  change: [patch: Partial<CalFilters>]
  clear: []
}>()

const SELECT = 'min-w-[150px] rounded-lg border border-eq-line bg-white px-2.5 py-2 text-sm outline-none focus:border-eq-blue focus:ring-2 focus:ring-eq-blue/20'

const open = ref(false) // fechado por defeito

const FIELD: Record<FilterKey, keyof CalFilters> = { type: 'type', owner: 'ownerId', vehicle: 'vehicle', city: 'city', client: 'client', category: 'category', unit: 'unit' }
const STATIC_LABEL: Record<Exclude<FilterKey, 'type' | 'owner'>, string> = { vehicle: 'Viatura', city: 'Localidade', client: 'Cliente', category: 'Categoria', unit: 'Unidade' }

const labelOf = (f: FilterKey) => (f === 'type' ? props.module.typeLabel || 'Tipo' : f === 'owner' ? props.module.ownerLabel : STATIC_LABEL[f])
const valueOf = (f: FilterKey) => props.filters[FIELD[f]] as string
const patchOf = (f: FilterKey, value: string): Partial<CalFilters> => ({ [FIELD[f]]: value })

// Resumo dos filtros ativos (aparece quando o painel está fechado)
const parts = computed(() => {
  const out: string[] = []
  if (props.filters.q) out.push(`"${props.filters.q}"`)
  for (const f of props.module.filters) {
    const v = valueOf(f)
    if (!v) continue
    out.push(`${labelOf(f)}: ${props.options[f]?.find((o) => o.value === v)?.label ?? v}`)
  }
  if (props.filters.mine) out.push('Só os meus')
  return [...out, ...props.extra]
})
</script>
