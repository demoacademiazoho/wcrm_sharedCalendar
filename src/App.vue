<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { zohoInit } from './utils/zohoFunctions'
import ToastContainer from '@/components/main/ToastContainer.vue'
import Loader from '@/components/main/Loader.vue'
import Version from '@/components/main/Version.vue'
import SharedCalendar from '@/components/SharedCalendar.vue'
import logo from '@/assets/equiply-logo.png'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

// true enquanto o SDK da Zoho não estiver pronto; mostra o ecrã de espera (Loader)
const loading = ref(true)

// Ao montar o componente, liga o widget ao CRM (evento PageLoad do SDK).
// Fora do CRM (npm run dev) o PageLoad nunca dispara: após 2 s passamos a dados fictícios.
onMounted(async () => {
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 2000))
  // se o SDK nem sequer carregou (ZOHO indefinido), tratamos como se tivesse esgotado o tempo
  const result = await Promise.race([zohoInit().catch(() => 'timeout' as const), timeout])
  if (result === 'timeout' && import.meta.env.DEV) session.mock = true
  loading.value = false
})

const initials = computed(() =>
  (session.me?.full_name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join(''),
)
</script>

<template>
  <!-- Ecrã de espera enquanto o SDK arranca -->
  <Loader :visible="loading" />
  <!-- Avisos (sucesso/erro) mostrados no canto do ecrã -->
  <ToastContainer />
  <Version />

  <main class="min-h-screen bg-eq-bg p-5 text-eq-navy">
    <div class="mx-auto flex max-w-[1440px] flex-col gap-3">
      <header class="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div class="flex items-center gap-4">
          <img :src="logo" alt="Equiply" class="h-9 w-auto" />
          <div class="h-[30px] w-px bg-eq-line" />
          <div>
            <!--<h1 class="text-[22px] font-bold leading-tight">Vista geral</h1>-->
            <p class="text-[12.5px] text-eq-muted">
              Entregas, inspeções, reservas, manutenções e comercial
              <span v-if="session.mock" class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Dados fictícios (fora do CRM)</span>
            </p>
          </div>
        </div>
        <div v-if="session.me" class="flex items-center gap-2.5">
          <div class="grid size-9 place-items-center rounded-full bg-eq-orange text-sm font-bold text-white">{{ initials }}</div>
          <div class="leading-tight">
            <b class="block text-sm">{{ session.me.full_name }}</b>
            <small v-if="session.me.role" class="text-xs text-eq-muted">{{ session.me.role }}</small>
          </div>
        </div>
      </header>

      <!-- v-if: só desenha o calendário depois do SDK estar pronto, senão a 1.ª leitura ao CRM falha -->
      <SharedCalendar v-if="!loading" />
    </div>
  </main>
</template>
