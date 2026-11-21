<script setup lang="ts">
import type { Category, StockOption } from '~/utils/picks'

const props = defineProps<{ category: Category }>()
const model = defineModel<StockOption | null>()

const MIN_QUERY = 2
const DEBOUNCE_MS = 300

const searchTerm = ref('')
const results = ref<StockOption[]>([])
const loading = ref(false)
const error = ref<string>()

let timer: ReturnType<typeof setTimeout> | undefined
// odrzuca odpowiedzi na nieaktualne zapytania (wolniejsza wcześniejsza odpowiedź nie nadpisze nowszej)
let requestId = 0

watch(searchTerm, (term) => {
  clearTimeout(timer)
  const q = term.trim()
  // po wyborze pole pokazuje nazwę spółki — nie szukamy jej ponownie
  if (q.length < MIN_QUERY || q === model.value?.name) {
    requestId++
    loading.value = false
    return
  }

  loading.value = true
  timer = setTimeout(async () => {
    const id = ++requestId
    try {
      const found = await $fetch('/api/instruments/search', { query: { q, category: props.category } })
      if (id !== requestId) return
      results.value = found.map(c => ({ symbol: c.symbol, name: c.name, exchange: c.exchangeName }))
      error.value = undefined
    }
    catch (e) {
      if (id !== requestId) return
      results.value = []
      error.value = (e as { statusMessage?: string }).statusMessage ?? 'Wyszukiwarka chwilowo nie działa'
    }
    finally {
      if (id === requestId) loading.value = false
    }
  }, DEBOUNCE_MS)
})

onBeforeUnmount(() => clearTimeout(timer))

// zaznaczona spółka zawsze na liście, żeby była widoczna jako wybrana
const items = computed(() => {
  const selected = model.value
  return selected && !results.value.some(r => r.symbol === selected.symbol)
    ? [selected, ...results.value]
    : results.value
})

const emptyText = computed(() => {
  if (error.value) return error.value
  if (searchTerm.value.trim().length < MIN_QUERY) return `Wpisz co najmniej ${MIN_QUERY} znaki`
  if (loading.value) return 'Szukam…'
  return 'Brak spółek z tej kategorii'
})
</script>

<template>
  <UInputMenu
    v-model="model"
    v-model:search-term="searchTerm"
    :items="items"
    label-key="name"
    by="symbol"
    ignore-filter
    :loading="loading"
    icon="i-lucide-search"
    placeholder="Nazwa spółki lub ticker"
    class="w-full"
  >
    <template #item-label="{ item }">
      {{ item.name }}
      <span class="text-muted">
        {{ item.symbol }}<template v-if="item.exchange"> · {{ item.exchange }}</template>
      </span>
    </template>

    <template #empty>
      {{ emptyText }}
    </template>
  </UInputMenu>
</template>
