<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { user, loggedIn, signOut } = useUserSession()

const nav: NavigationMenuItem[] = [
  { label: 'Gracze', icon: 'i-lucide-trophy', to: '/' },
  { label: 'Spółki', icon: 'i-lucide-chart-candlestick', to: '/spolki' },
  { label: 'Porównanie', icon: 'i-lucide-chart-spline', to: '/porownanie' },
]

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
    :toggle="loggedIn"
  >
    <UNavigationMenu
      v-if="loggedIn"
      :items="nav"
    />

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
      <UButton
        v-else
        label="Zaloguj"
        icon="i-lucide-log-in"
        color="neutral"
        variant="ghost"
        to="/login"
      />
    </template>

    <template #body>
      <UNavigationMenu
        :items="nav"
        orientation="vertical"
        class="-mx-2.5"
      />
    </template>
  </UHeader>
</template>
