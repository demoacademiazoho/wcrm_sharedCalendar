<template>
  <Transition name="eq-scrim">
    <div v-if="change" class="fixed inset-0 z-[70] grid place-items-center bg-eq-navy/45 p-4" @click.self="!busy && $emit('cancel')">
      <div class="w-full max-w-[460px] overflow-hidden rounded-[14px] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="eq-confirm-t">
        <h3 id="eq-confirm-t" class="px-5 pb-1 pt-4 text-[17px] font-bold">Confirmar alteração?</h3>
        <div class="px-5 pb-3 text-[13.5px]">
          A alteração só é gravada no CRM depois de confirmar e de ser validada pelo CRM.
          <dl class="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[10px] bg-eq-bg px-3 py-2.5 text-[13px]">
            <template v-for="[k, v] in change.rows" :key="k">
              <dt class="text-eq-muted">{{ k }}</dt>
              <dd class="font-bold">{{ v }}</dd>
            </template>
          </dl>
        </div>
        <div class="flex justify-end gap-2.5 px-5 pb-4 pt-1">
          <template v-if="busy">
            <span class="flex items-center gap-2.5 py-1.5 text-[13px] text-eq-muted"><i class="inline-block size-[18px] animate-spin rounded-full border-[3px] border-eq-line border-t-eq-blue" />A validar e gravar no CRM…</span>
          </template>
          <template v-else>
            <button type="button" class="cursor-pointer rounded-[10px] border border-eq-line bg-white px-3.5 py-2 text-sm font-bold hover:border-eq-blue" @click="$emit('cancel')">Cancelar</button>
            <button type="button" class="cursor-pointer rounded-[10px] border border-eq-navy bg-eq-navy px-3.5 py-2 text-sm font-bold text-white hover:bg-eq-navy-dark" @click="$emit('confirm')">Confirmar</button>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
export interface PendingChange {
  /** pares "campo → antes → depois" mostrados no diálogo */
  rows: [string, string][]
}

defineProps<{ change: PendingChange | null; busy: boolean }>()
defineEmits<{ confirm: []; cancel: [] }>()
</script>
