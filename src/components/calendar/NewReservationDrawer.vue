<template>
  <Transition name="eq-drawer">
    <aside v-if="open" class="fixed inset-y-0 right-0 z-40 flex w-[430px] max-w-full flex-col overflow-y-auto border-l border-eq-line bg-white shadow-2xl" aria-label="Pedido de equipamento">
      <header class="relative border-t-[5px] border-t-eq-orange bg-eq-navy px-[18px] py-4 text-white">
        <small class="text-[11px] font-bold uppercase tracking-wider text-eq-light">Pedido a partir das unidades disponíveis</small>
        <h3 class="mt-1 pr-8 text-lg font-bold">Pedido de equipamento</h3>
        <button type="button" class="absolute right-3 top-3 cursor-pointer text-2xl leading-none text-white" aria-label="Fechar" @click="$emit('close')">&times;</button>
      </header>

      <form class="flex flex-col gap-4 px-[18px] py-4" @submit.prevent="submit">
        <section class="flex flex-col gap-2">
          <h4 class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Equipamentos <span class="ml-1 rounded-full bg-eq-navy px-1.5 text-white">{{ items.length }}</span></h4>
          <ul v-if="items.length" class="flex flex-col gap-2">
            <li v-for="it in items" :key="it.unit.id" class="flex flex-col gap-2 rounded-lg border border-eq-line px-2.5 py-2 text-[13px]">
              <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1"><b class="block truncate">{{ it.equipmentName }}</b><small class="text-eq-muted">{{ it.unit.code }}</small></div>
                <span class="flex-none font-bold">{{ it.dailyPrice ? it.dailyPrice + ' €/dia' : '—' }}</span>
                <button type="button" class="cursor-pointer text-lg leading-none text-eq-muted hover:text-eq-red" :aria-label="`Remover ${it.unit.code}`" @click="$emit('remove', it.unit.id)">&times;</button>
              </div>
              <!-- período próprio de cada equipamento -->
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1"><span class="text-[10.5px] font-extrabold uppercase tracking-wider text-eq-muted">Início</span><input :value="it.start" type="date" :min="today" required :class="INPUT" @change="$emit('update-item', it.unit.id, { start: ($event.target as HTMLInputElement).value })" /></label>
                <label class="flex flex-col gap-1"><span class="text-[10.5px] font-extrabold uppercase tracking-wider text-eq-muted">Fim</span><input :value="it.end" type="date" :min="it.start" required :class="INPUT" @change="$emit('update-item', it.unit.id, { end: ($event.target as HTMLInputElement).value })" /></label>
              </div>
              <div class="flex justify-between text-xs text-eq-muted"><span>{{ daysOf(it) }} dia(s)</span><span>Subtotal <b class="text-eq-navy">{{ it.dailyPrice * daysOf(it) }} €</b></span></div>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-dashed border-eq-line px-3 py-3 text-[12.5px] text-eq-muted">Escolha uma unidade disponível na lista e clique em <b>Adicionar ao pedido</b>. Cada equipamento tem o seu período.</p>
          <div v-if="items.length" class="flex justify-between rounded-lg bg-eq-bg px-3 py-2 text-[13px]"><span>{{ items.length }} equipamento(s)</span><span>Total estimado <b>{{ total }} €</b></span></div>
        </section>

        <section class="flex flex-col gap-2.5">
          <h4 class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Empresa e Cliente</h4>
          <LookupField v-model="account" label="Empresa" kind="account" required />
          <LookupField v-model="contact" label="Cliente (opcional)" kind="contact" :account-id="account?.id" />
        </section>

        <!-- A Oportunidade é decidida pela Empresa (decisão Q7): só se cria se não houver nenhuma em aberto -->
        <section class="flex flex-col gap-2 rounded-lg border border-eq-line p-3" aria-live="polite">
          <h4 class="text-[11px] font-extrabold uppercase tracking-wider text-eq-muted">Oportunidade</h4>
          <p v-if="!account" class="text-[13px] text-eq-muted">Escolha a Empresa para ver as oportunidades em aberto.</p>
          <p v-else-if="loadingDeals" class="text-[13px] text-eq-muted">A procurar oportunidades em aberto…</p>
          <p v-else-if="!deals.length" class="rounded-md border-l-4 border-eq-orange bg-orange-50 px-2.5 py-1.5 text-[12.5px]">Esta Empresa não tem oportunidades em aberto. Será criada uma nova com o equipamento.</p>
          <template v-else>
            <p class="text-[12.5px] text-eq-muted">{{ deals.length === 1 ? 'O equipamento será adicionado à oportunidade em aberto:' : 'Há várias oportunidades em aberto. Escolha a que recebe o equipamento:' }}</p>
            <label v-for="d in deals" :key="d.id" class="flex cursor-pointer items-center gap-2 rounded-md border border-eq-line px-2.5 py-1.5 text-sm has-[:checked]:border-eq-blue has-[:checked]:bg-sky-50">
              <input v-model="dealId" type="radio" name="deal" :value="d.id" />
              <span class="font-semibold">{{ d.name }}</span>
              <small class="ml-auto text-eq-muted">{{ d.stage }}</small>
            </label>
          </template>
        </section>

        <p v-if="localError || error" class="rounded-md border-l-4 border-eq-red bg-red-50 px-2.5 py-1.5 text-[12.5px]" role="alert">{{ localError || error }}</p>

        <div class="flex gap-2.5">
          <button type="button" class="cursor-pointer rounded-[10px] border border-eq-line bg-white px-3.5 py-2.5 text-sm font-bold hover:border-eq-blue" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="flex-1 cursor-pointer rounded-[10px] border border-eq-orange bg-eq-orange px-3.5 py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50" :disabled="busy || loadingDeals">
            {{ busy ? 'A gravar…' : deals.length ? 'Adicionar à oportunidade' : 'Criar oportunidade' }}
          </button>
        </div>
        <p class="text-xs text-eq-muted">A reserva não é criada aqui: o equipamento fica num Pedido de Orçamento em Rascunho ligado à Oportunidade e a reserva nasce depois, pelo Blueprint.</p>
      </form>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
/* Painel lateral "Pedido de equipamento": fica aberto enquanto se escolhem unidades na disponibilidade. */
import { computed, ref, watch } from 'vue'
import type { DealRef, EquipmentRequestPayload, Party, RequestItem } from '@/interfaces/availability'
import LookupField from '@/components/calendar/LookupField.vue'
import { getOpenDealsOf } from '@/utils/calendarData'
import { toZohoDate } from '@/utils/dates'

const props = defineProps<{ open: boolean; items: RequestItem[]; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; remove: [unitId: string]; 'update-item': [unitId: string, patch: { start?: string; end?: string }]; submit: [payload: EquipmentRequestPayload] }>()

const INPUT = 'w-full rounded-lg border border-eq-line px-2.5 py-2 text-sm outline-none focus:border-eq-blue focus:ring-2 focus:ring-eq-blue/20'

const today = toZohoDate(new Date())
const account = ref<Party | null>(null)
const contact = ref<Party | null>(null)
const dealId = ref('') // '' = o CRM cria a oportunidade
const deals = ref<DealRef[]>([])
const loadingDeals = ref(false)
const localError = ref('')
let counter = 0

const daysOf = (i: RequestItem) => Math.max(1, Math.round((+new Date(`${i.end}T00:00:00`) - +new Date(`${i.start}T00:00:00`)) / 864e5) + 1)
const total = computed(() => props.items.reduce((t, i) => t + i.dailyPrice * daysOf(i), 0))

// ao fechar, o pedido volta ao início
watch(
  () => props.open,
  (o) => {
    if (o) return
    account.value = contact.value = null
    dealId.value = ''
    deals.value = []
    localError.value = ''
  },
)

// Se o Cliente escolhido é de outra Empresa, deixa de valer
watch(account, async (a) => {
  dealId.value = ''
  deals.value = []
  if (contact.value && a) contact.value = null
  if (!a) return
  const current = ++counter
  loadingDeals.value = true
  try {
    const found = await getOpenDealsOf(a.id)
    if (current !== counter) return
    deals.value = found
    if (found.length === 1) dealId.value = found[0]!.id // só uma: fica escolhida
  } catch (error) {
    console.error(error)
    if (current === counter) localError.value = 'Não foi possível ler as oportunidades da Empresa.'
  } finally {
    if (current === counter) loadingDeals.value = false
  }
})

function submit() {
  localError.value = ''
  if (!props.items.length) return fail('Adicione pelo menos uma unidade.')
  if (!account.value) return fail('Indique a Empresa.')
  const bad = props.items.find((i) => !i.start || !i.end || i.end < i.start || i.start < today)
  if (bad) return fail(`Verifique o período de ${bad.unit.code}: o início não pode estar no passado e o fim tem de ser igual ou posterior ao início.`)
  if (deals.value.length > 1 && !dealId.value) return fail('Escolha a oportunidade que recebe o equipamento.')
  emit('submit', {
    items: props.items.map((i) => ({ unitId: i.unit.id, start: i.start, end: i.end })),
    accountId: account.value.id,
    contactId: contact.value?.id ?? '',
    dealId: dealId.value,
  })
}

const fail = (message: string) => {
  localError.value = message
}
</script>
