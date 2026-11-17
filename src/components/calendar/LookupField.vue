<template>
  <div class="relative flex flex-col gap-1">
    <span class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">{{ label }}<span v-if="required" class="text-eq-red"> *</span></span>
    <div v-if="modelValue" class="flex items-center justify-between rounded-lg border border-eq-blue bg-sky-50 px-2.5 py-2 text-sm font-semibold">
      {{ modelValue.name }}
      <button type="button" class="cursor-pointer text-lg leading-none text-eq-muted hover:text-eq-red" :aria-label="`Remover ${label}`" @click="$emit('update:modelValue', null)">&times;</button>
    </div>
    <template v-else>
      <input
        v-model="text"
        type="search"
        :placeholder="`Pesquisar ${label.toLowerCase()}…`"
        class="w-full rounded-lg border border-eq-line px-2.5 py-2 text-sm outline-none focus:border-eq-blue focus:ring-2 focus:ring-eq-blue/20"
        @input="onInput"
      />
      <ul v-if="results.length || canCreate" class="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-eq-line bg-white shadow-lg">
        <li v-for="p in results" :key="p.id">
          <button type="button" class="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-sky-50" @click="pick(p)">{{ p.name }}</button>
        </li>
        <!-- criar a Empresa/Cliente quando não existe -->
        <li v-if="canCreate">
          <button type="button" class="w-full cursor-pointer px-3 py-2 text-left text-sm font-bold text-eq-blue hover:bg-sky-50 disabled:opacity-50" :disabled="creating" @click="create">
            {{ creating ? 'A criar…' : `+ Criar ${kind === 'account' ? 'empresa' : 'cliente'} «${text.trim()}»` }}
          </button>
        </li>
      </ul>
      <small v-else-if="searched && text.trim().length >= 2" class="text-xs text-eq-muted">Sem resultados.</small>
      <small v-if="createError" class="text-xs text-eq-red">{{ createError }}</small>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Party } from '@/interfaces/availability'
import { createParty, searchParties } from '@/utils/calendarData'

const props = defineProps<{ label: string; kind: 'account' | 'contact'; modelValue: Party | null; required?: boolean; accountId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Party | null] }>()

const text = ref('')
const results = ref<Party[]>([])
const searched = ref(false)
const creating = ref(false)
const createError = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let counter = 0

// Só oferece "Criar" depois de pesquisar e não haver um resultado com o mesmo nome
const canCreate = computed(
  () => searched.value && text.value.trim().length >= 2 && !results.value.some((r) => r.name.toLowerCase() === text.value.trim().toLowerCase()),
)

// Pesquisa com pequena espera, para não chamar o CRM a cada tecla
function onInput() {
  createError.value = ''
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const current = ++counter
    try {
      const found = await searchParties(props.kind, text.value, props.accountId)
      if (current === counter) {
        results.value = found
        searched.value = true
      }
    } catch (error) {
      console.error(error)
    }
  }, 250)
}

function pick(p: Party) {
  emit('update:modelValue', p)
  text.value = ''
  results.value = []
  searched.value = false
}

async function create() {
  creating.value = true
  createError.value = ''
  try {
    pick(await createParty(props.kind, text.value, props.accountId))
  } catch (error) {
    console.error(error)
    createError.value = (error as Error).message || 'Não foi possível criar.'
  } finally {
    creating.value = false
  }
}
</script>
