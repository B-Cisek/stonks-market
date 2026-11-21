<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { user, loggedIn, signOut } = useUserSession()

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: user.value?.name ?? '',
      avatar: { src: user.value?.image ?? undefined, alt: user.value?.name },
      type: 'label',
    },
  ],
  [
    {
      label: 'Moje wyniki',
      icon: 'i-lucide-chart-line',
      to: `/gracze/${user.value?.id}`,
    },
  ],
  [
    {
      label: 'Wyloguj',
      icon: 'i-lucide-log-out',
      color: 'error',
      onSelect: () => signOut(),
    },
  ],
])
</script>

<template>
  <UHeader
    title="Stonks Market"
    :toggle="false"
  >
    <template #right>
      <UColorModeButton />

      <UDropdownMenu
        v-if="loggedIn"
        :items="userMenu"
        :content="{ align: 'end' }"
        :ui="{ content: 'w-48' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          :avatar="{ src: user?.image ?? undefined, alt: user?.name, size: 'sm' }"
          :aria-label="`Menu użytkownika ${user?.name ?? ''}`"
        />
      </UDropdownMenu>
    </template>
  </UHeader>
</template>
