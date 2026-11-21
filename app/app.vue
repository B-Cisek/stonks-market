<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <div class="min-h-screen flex flex-col">
      <AppHeader />
      <!-- min-h-0 nadpisuje domyślne min-h UMain (100vh - header), żeby stopka mieściła się na ekranie -->
      <UMain class="min-h-0 flex-1 flex flex-col">
        <NuxtPage />
      </UMain>
      <AppFooter />
    </div>
  </UApp>
</template>
