<script setup lang="ts">
definePageMeta({ auth: 'guest' })

const route = useRoute()
const { execute, status, error } = useSignIn('social')

const callbackURL = computed(() => {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/')
    ? redirect
    : '/'
})

function loginWithKick() {
  execute({ provider: 'kick', callbackURL: callbackURL.value })
}
</script>

<template>
  <div class="flex-1 flex items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-semibold">
          Zaloguj się
        </h1>
        <p class="text-sm text-muted">
          Do Stonks Market logujesz się kontem Kick.
        </p>
      </template>

      <UButton
        block
        size="lg"
        color="success"
        :loading="status === 'pending'"
        @click="loginWithKick"
      >
        Zaloguj przez Kick
      </UButton>

      <UAlert
        v-if="error"
        class="mt-4"
        color="error"
        variant="subtle"
        title="Nie udało się zalogować"
        :description="error.message"
      />
    </UCard>
  </div>
</template>
