<template>
  <section v-if="visible" class="eq-card flex flex-col gap-3 border-l-[5px] border-l-eq-green p-4" aria-live="polite">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 class="text-sm font-extrabold text-eq-navy">Disponibilidade de unidades</h3>
        <small class="text-xs text-eq-muted">Equipamentos do catálogo que correspondem à pesquisa «{{ query.trim() }}»</small>
      </div>
      <div class="flex gap-2.5">
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Início</span>
          <input :value="from" type="date" :class="DATE" @change="onFrom(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Fim</span>
          <input :value="to" type="date" :min="from" :class="DATE" @change="onTo(($event.target as HTMLInputElement).value)" />
        </label>
      </div>
    </div>

    <p v-if="loading" class="text-[13px] text-eq-muted">A verificar disponibilidade…</p>
    <p v-else-if="error" class="rounded-md border-l-4 border-eq-red bg-red-50 px-2.5 py-1.5 text-[12.5px]">{{ error }}</p>

    <template v-else>
      <div v-for="g in groups" :key="g.equipment.id" class="overflow-x-auto rounded-xl border border-eq-line">
        <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
          <div>
            <b class="text-[13.5px] text-eq-navy">{{ g.equipment.name }}</b>
            <small class="block text-xs text-eq-muted">Catálogo{{ g.equipment.category ? ' · ' + g.equipment.category : '' }}{{ g.equipment.dailyPrice ? ' · ' + g.equipment.dailyPrice + ' €/dia' : '' }}</small>
          </div>
          <span :class="['rounded-full px-2.5 py-0.5 text-xs font-bold', freeOf(g) ? 'bg-green-100 text-eq-green' : 'bg-red-100 text-eq-red']">
            {{ freeOf(g) }} de {{ g.units.length }} unidades disponíveis
          </span>
        </div>
        <p v-if="g.warning" class="border-b border-eq-line bg-orange-50 px-3 py-1.5 text-[12.5px]" role="status">{{ g.warning }}</p>
        <p v-if="!g.units.length" class="px-3 py-3 text-[13px] text-eq-muted">Este equipamento ainda não tem unidades registadas.</p>
        <table v-else class="w-full text-left text-[13px]">
          <thead>
            <tr class="border-b border-eq-line text-[11px] uppercase tracking-wider text-eq-muted">
              <th class="px-3 py-1.5">Unidade</th>
              <th class="px-3 py-1.5">No período</th>
              <th class="px-3 py-1.5">Detalhe</th>
              <th class="px-3 py-1.5">Livre a partir de</th>
              <th class="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in g.units" :key="a.unit.id" class="border-b border-eq-line last:border-b-0">
              <td class="px-3 py-1.5 font-bold">{{ a.unit.code }}</td>
              <td class="px-3 py-1.5"><span :class="['rounded-full px-2 py-0.5 text-[11px] font-bold', BADGE[a.state]]">{{ a.state }}</span></td>
              <td class="px-3 py-1.5 text-eq-muted">{{ a.detail || '—' }}</td>
              <td class="px-3 py-1.5">{{ a.freeFrom ? fmt(a.freeFrom) : (a.freeFromNote || 'Sem data nos próximos 90 dias') }}</td>
              <td class="px-3 py-1.5 text-right">
                <button
                  v-if="a.free"
                  type="button"
                  :class="['cursor-pointer rounded-lg border px-3 py-1 text-xs font-bold', has(a.unit.id) ? 'border-eq-green bg-white text-eq-green' : 'border-eq-orange bg-eq-orange text-white hover:brightness-95']"
                  @click="$emit('toggle', { unit: a.unit, equipmentName: g.equipment.name, dailyPrice: g.equipment.dailyPrice, start: from, end: to })"
                >
                  {{ has(a.unit.id) ? 'Adicionada ✓' : 'Adicionar ao pedido' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="extra > 0" class="text-xs text-eq-muted">Existem {{ total }} equipamentos com este nome. A mostrar os primeiros {{ groups.length }}; refine a pesquisa.</p>
      <p class="text-xs text-eq-muted">
        Calculado sobre as Reservas (exceto canceladas e devolvidas) e as Manutenções por concluir. A validação final de sobreposição de unidades é feita pelo CRM ao gravar.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
/*
 * Disponibilidade de unidades (separador Reservas). Aparece quando a pesquisa tem 2 ou mais caracteres e
 * corresponde a equipamentos do catálogo (no máximo 3). Usa o período Início/Fim e mostra, por unidade,
 * Disponível / Reservada / Pré-reservada / Em manutenção, o detalhe da ocupação e "Livre a partir de".
 */
import { computed, ref, watch } from 'vue'
import type { EquipmentAvailability, RequestItem, UnitAvailability } from '@/interfaces/availability'
import { getAvailability, searchEquipment } from '@/utils/calendarData'

const props = defineProps<{ query: string; from: string; to: string; selected: RequestItem[] }>()
const emit = defineEmits<{ 'update:from': [v: string]; 'update:to': [v: string]; toggle: [item: RequestItem] }>()

const DATE = 'rounded-lg border border-eq-line px-2.5 py-2 text-sm outline-none focus:border-eq-blue'
const BADGE: Record<UnitAvailability['state'], string> = {
  Disponível: 'bg-green-100 text-eq-green',
  Reservada: 'bg-red-100 text-eq-red',
  'Pré-reservada': 'bg-orange-100 text-eq-orange',
  'Em manutenção': 'bg-slate-200 text-eq-muted',
}
const MAX = 3 // no máximo 3 equipamentos

const groups = ref<EquipmentAvailability[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const found = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let counter = 0
let stage = ''

const visible = computed(() => props.query.trim().length >= 2 && (found.value || loading.value))
const extra = computed(() => total.value - groups.value.length)
const freeOf = (g: EquipmentAvailability) => g.units.filter((u) => u.free).length
const has = (unitId: string) => props.selected.some((s) => s.unit.id === unitId)
const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })

// Se o início passa o fim, o fim acompanha o início (evita um período inválido)
function onFrom(v: string) {
  emit('update:from', v)
  if (v && props.to && v > props.to) emit('update:to', v)
}
function onTo(v: string) {
  emit('update:to', v)
  if (v && props.from && v < props.from) emit('update:from', v)
}

async function run() {
  const current = ++counter
  const q = props.query.trim()
  if (q.length < 2) {
    found.value = false
    groups.value = []
    return
  }
  // Datas em falta ou fim antes do início: o painel (e os campos de data) mantêm-se visíveis, com aviso
  if (!props.from || !props.to || props.to < props.from) {
    found.value = true
    groups.value = []
    error.value = 'A data de fim tem de ser igual ou posterior à data de início.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    stage = 'pesquisa de equipamentos'
    const eqs = await searchEquipment(q)
    if (current !== counter) return
    total.value = eqs.length
    found.value = eqs.length > 0
    stage = 'leitura das unidades'
    groups.value = eqs.length ? await getAvailability(eqs.slice(0, MAX), props.from, props.to) : []
  } catch (e) {
    console.error(e)
    if (current === counter) {
      found.value = true
      const err = e as { message?: string; code?: string } | undefined
      error.value = `Não foi possível verificar a disponibilidade (${stage}: ${err?.message || err?.code || 'recusado pelo CRM'}).`
    }
  } finally {
    if (current === counter) loading.value = false
  }
}

// pesquisa com pequena espera, para não chamar o CRM a cada tecla
watch(
  () => [props.query, props.from, props.to],
  () => {
    clearTimeout(timer)
    timer = setTimeout(run, 300)
  },
  { immediate: true },
)
</script>
