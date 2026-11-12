<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { zohoInit } from './utils/zohoFunctions'
import ToastContainer from '@/components/main/ToastContainer.vue'
import Loader from '@/components/main/Loader.vue'
import Version from '@/components/main/Version.vue'
import SharedCalendar from '@/components/SharedCalendar.vue'

// true enquanto o SDK da Zoho não estiver pronto; mostra o ecrã de espera (Loader)
const loading = ref(true)

// Ao montar o componente, liga o widget ao CRM (evento PageLoad do SDK)
onMounted(async () => {
  await zohoInit()
  loading.value = false
})
</script>

<template>
  <!-- Ecrã de espera enquanto o SDK arranca -->
  <Loader :visible="loading" />
  <!-- Avisos (sucesso/erro) mostrados no canto do ecrã -->
  <ToastContainer />
  <Version />

  <main class="flex h-screen flex-col overflow-y-auto bg-[#F4F6F8] p-6">
    <h1 class="text-lg font-semibold text-[#0B3A5B]">Calendário partilhado</h1>
    <p class="mb-4 text-sm text-zinc-500">Entregas e Recolhas</p>
    <!-- v-if: só desenha o calendário depois do SDK estar pronto, senão a 1.ª leitura ao CRM falha -->
    <SharedCalendar v-if="!loading" />
  </main>
</template>

<style scoped></style>