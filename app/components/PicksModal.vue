<script setup lang="ts">
import type { ButtonProps, StepperItem } from '@nuxt/ui'
import { CATEGORY_LABELS } from '~/utils/picks'
import type { Category, StockOption } from '~/utils/picks'

// Kreator zapisu do sezonu: zasady → po jednym kroku na kategorię → podsumowanie i zapis.

defineProps<{ size?: ButtonProps['size'] }>()
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const { loggedIn } = useUserSession()
const route = useRoute()
const { data, refresh } = await useFetch('/api/picks', { key: 'my-picks' })

const CATEGORY_HINTS: Partial<Record<Category, string>> = {
  pl: 'Wybierz spółkę notowaną na GPW.',
  eu: 'Wybierz spółkę z jednej z głównych giełd europejskich.',
  world: 'Wybierz spółkę z głównej giełdy spoza Europy (USA, Kanada, Azja…).',
}

const CATEGORY_ICONS: Partial<Record<Category, string>> = {
  pl: 'i-lucide-landmark',
  eu: 'i-lucide-euro',
  world: 'i-lucide-globe',
}

type Step = 'intro' | Category | 'summary'

const open = ref(false)
const step = ref<Step>('intro')
// krok kategorii otwarty z podsumowania — „Dalej” wraca od razu do podsumowania
const backToSummary = ref(false)
const saving = ref(false)
const error = ref<string>()
const selected = reactive<Partial<Record<Category, StockOption | null>>>({})

const season = computed(() => data.value?.season)
const categories = computed(() => season.value?.categories ?? [])
const savedSymbol = (c: Category) => data.value?.picks.find(p => p.category === c)?.symbol
const hasPicks = computed(() => (data.value?.picks.length ?? 0) > 0)
const isComplete = computed(() => categories.value.every(c => savedSymbol(c)))

// strefa czasowa na sztywno — ten sam tekst w SSR i w przeglądarce
const closesAt = computed(() => season.value
  ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Warsaw' })
      .format(new Date(season.value.entryClosesAt))
  : '',
)
const day = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeZone: 'UTC' })
const startDate = computed(() => season.value ? day.format(new Date(season.value.startDate)) : '')
const endDate = computed(() => season.value ? day.format(new Date(season.value.endDate)) : '')

const steps = computed<Step[]>(() => ['intro', ...categories.value, 'summary'])
const stepIndex = computed(() => steps.value.indexOf(step.value))

const items = computed<StepperItem[]>(() => [
  { value: 'intro', title: 'Zasady', icon: 'i-lucide-info' },
  ...categories.value.map(c => ({ value: c, title: CATEGORY_LABELS[c], icon: CATEGORY_ICONS[c] ?? 'i-lucide-chart-line' })),
  { value: 'summary', title: 'Podsumowanie', icon: 'i-lucide-check' },
])

const currentCategory = computed(() => categories.value.find(c => c === step.value))

// każde otwarcie startuje od zapisanych wyborów — porzucone zmiany nie zostają w kreatorze;
// kto ma już komplet, ląduje od razu na podsumowaniu
watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = undefined
  backToSummary.value = false
  for (const c of categories.value) {
    const p = data.value?.picks.find(p => p.category === c)
    selected[c] = p ? { symbol: p.symbol, name: p.name, exchange: p.exchange } : null
  }
  step.value = isComplete.value ? 'summary' : 'intro'
})

// wysyłamy tylko zmienione kategorie
const changes = computed(() => categories.value.flatMap((c) => {
  const symbol = selected[c]?.symbol
  return symbol && symbol !== savedSymbol(c) ? [{ category: c, symbol }] : []
}))

const canGoNext = computed(() => !currentCategory.value || !!selected[currentCategory.value])

function next() {
  if (!canGoNext.value) return
  if (backToSummary.value) {
    backToSummary.value = false
    step.value = 'summary'
    return
  }
  step.value = steps.value[stepIndex.value + 1] ?? 'summary'
}

function prev() {
  backToSummary.value = false
  step.value = steps.value[stepIndex.value - 1] ?? 'intro'
}

function edit(category: Category) {
  backToSummary.value = true
  step.value = category
}

async function save() {
  saving.value = true
  error.value = undefined
  try {
    await $fetch('/api/picks', { method: 'PUT', body: { picks: changes.value } })
    await refresh()
    open.value = false
    toast.add({ title: 'Wybory zapisane', color: 'success', icon: 'i-lucide-check' })
    emit('saved')
  }
  catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Nie udało się zapisać wyborów'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- gość: zamiast kreatora logowanie z powrotem na tę samą stronę -->
  <UButton
    v-if="season && !loggedIn"
    label="Zaloguj się, aby dołączyć"
    icon="i-lucide-log-in"
    :size="size"
    :to="{ path: '/login', query: { redirect: route.fullPath } }"
  />
  <UModal
    v-else-if="season"
    v-model:open="open"
    :title="`Zapisy do sezonu ${season.year}`"
    :description="`Zapisy trwają do ${closesAt}.`"
    :ui="{ content: 'sm:max-w-2xl', footer: 'justify-between' }"
  >
    <UButton
      :label="hasPicks ? 'Zmień wybory' : 'Dołącz do sezonu'"
      :icon="hasPicks ? 'i-lucide-pencil' : 'i-lucide-rocket'"
      :size="size"
    />

    <template #body>
      <div class="space-y-6">
        <!-- nawigacja tylko przyciskami, żeby nie przeskoczyć kroku bez wyboru -->
        <UStepper
          v-model="step"
          :items="items"
          size="sm"
          disabled
          class="w-full"
          :ui="{ title: 'max-sm:hidden' }"
        />

        <div
          v-if="step === 'intro'"
          class="space-y-3 text-sm"
        >
          <p class="text-base font-medium text-highlighted">
            O co chodzi?
          </p>
          <ul class="space-y-2 list-disc ps-5">
            <li>
              Wybierasz po jednej spółce z każdej kategorii:
              {{ categories.map(c => CATEGORY_LABELS[c]).join(', ') }}.
            </li>
            <li>
              Liczy się zmiana ceny od zamknięcia z {{ startDate }} do końca sezonu ({{ endDate }}).
              Wszyscy startują z tej samej ceny, więc moment zapisu nie daje przewagi.
            </li>
            <li>
              Twój wynik to średnia zmiana cen Twoich spółek (w walucie notowania, bez dywidend).
            </li>
            <li>
              Porównujemy go z S&P 500 — jeśli jesteś wyżej, w rankingu świecisz na zielono.
            </li>
            <li>
              Do {{ closesAt }} możesz dowolnie zmieniać wybory.
            </li>
          </ul>
          <p class="text-muted">
            To tylko zabawa — bez prawdziwych pieniędzy.
          </p>
        </div>

        <div
          v-else-if="currentCategory"
          class="space-y-3"
        >
          <div>
            <p class="text-base font-medium text-highlighted">
              {{ CATEGORY_LABELS[currentCategory] }}
            </p>
            <p class="text-sm text-muted">
              {{ CATEGORY_HINTS[currentCategory] }}
            </p>
          </div>
          <StockSearch
            :key="currentCategory"
            v-model="selected[currentCategory]"
            :category="currentCategory"
            autofocus
          />
        </div>

        <div
          v-else-if="step === 'summary'"
          class="space-y-3"
        >
          <p class="text-base font-medium text-highlighted">
            Twoje wybory
          </p>
          <ul class="divide-y divide-default rounded-md border border-default">
            <li
              v-for="category in categories"
              :key="category"
              class="flex items-center justify-between gap-3 p-3"
            >
              <div class="min-w-0">
                <p class="text-xs text-muted">
                  {{ CATEGORY_LABELS[category] }}
                </p>
                <p class="font-medium truncate">
                  {{ selected[category]?.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ selected[category]?.symbol }}<template v-if="selected[category]?.exchange">
                    · {{ selected[category]?.exchange }}
                  </template>
                </p>
              </div>
              <UButton
                label="Zmień"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="edit(category)"
              />
            </li>
          </ul>

          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            :title="error"
          />
        </div>
      </div>
    </template>

    <template #footer="{ close }">
      <UButton
        v-if="step === 'intro'"
        label="Anuluj"
        color="neutral"
        variant="ghost"
        @click="close"
      />
      <UButton
        v-else
        label="Wstecz"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        @click="prev"
      />

      <UButton
        v-if="step === 'summary'"
        :label="changes.length ? 'Zapisz wybory' : 'Bez zmian'"
        icon="i-lucide-check"
        :loading="saving"
        :disabled="changes.length === 0"
        @click="save"
      />
      <UButton
        v-else
        :label="step === 'intro' ? 'Zaczynamy' : 'Dalej'"
        trailing-icon="i-lucide-arrow-right"
        :disabled="!canGoNext"
        @click="next"
      />
    </template>
  </UModal>
</template>
