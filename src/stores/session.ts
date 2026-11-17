import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CrmUser } from '@/interfaces/delivery'
import { MOCK_ME, MOCK_USERS } from '@/utils/mock'
import { getAllUsers, getCurrentUser } from '@/utils/zohoFunctions'

// Utilizador atual e modo demonstração (fora do CRM)
export const useSessionStore = defineStore('session', () => {
  const mock = ref(false)
  const me = ref<(CrmUser & { role?: string }) | null>(null)
  const users = ref<CrmUser[]>([])

  async function load() {
    if (mock.value) {
      me.value = MOCK_ME
      users.value = MOCK_USERS
      return
    }
    try {
      const u = await getCurrentUser()
      me.value = { id: u.id, full_name: u.full_name, role: u.role?.name ?? u.profile?.name }
    } catch (error) {
      console.error(error)
    }
    try {
      users.value = (await getAllUsers('ActiveUsers')).map((u: any) => ({ id: u.id, full_name: u.full_name }))
    } catch (error) {
      console.error(error)
    }
  }

  return { mock, me, users, load }
})
