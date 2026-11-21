<script setup lang="ts">
definePageMeta({ auth: 'user' })

const { user, signOut } = useUserSession()
</script>

<template>
  <div class="flex-1 flex items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <div class="flex items-center gap-3">
        <UAvatar
          :src="user?.image ?? undefined"
          :alt="user?.name"
          size="lg"
        />
        <div class="min-w-0">
          <p class="font-semibold truncate">
            {{ user?.name }}
          </p>
          <p class="text-sm text-muted truncate">
            {{ user?.email }}
          </p>
        </div>
      </div>

      <template #footer>
        <UButton
          block
          color="neutral"
          variant="outline"
          @click="signOut()"
        >
          Wyloguj
        </UButton>
      </template>
    </UCard>
  </div>
</template>
