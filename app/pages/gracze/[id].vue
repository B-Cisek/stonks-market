<script setup lang="ts">
import type { ChartCategory, TableColumn } from '@nuxt/ui'
import { CATEGORY_LABELS } from '~/utils/picks'

definePageMeta({ auth: 'user' })

const route = useRoute()
const { user } = useUserSession()
const id = computed(() => String(route.params.id))
const { data, error } = await useFetch(() => `/api/players/${id.value}`)

useSeoMeta({ title: () => data.value ? `${data.value.player.name} — Stonks Market` : 'Gracz — Stonks Market' })

type Pick = NonNullable<typeof data.value>['picks'][number]

const isMe = computed(() => user.value?.id === id.value)

const percent = new Intl.NumberFormat('pl-PL', {
  style: 'percent',
  signDisplay: 'exceptZero',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const points = new Intl.NumberFormat('pl-PL', { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const longDate = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-muted'
  return value > 0 ? 'text-success' : 'text-error'
}

// wynik gracza: z rankingu, a gdy nie ma kompletu — ostatni punkt historii (może być null)
const playerReturn = computed(() => data.value?.rank?.return ?? data.value?.history.at(-1)?.player ?? null)
const benchmarkReturn = computed(() => data.value?.benchmark?.return ?? null)
// przewaga nad S&P 500 w punktach procentowych
const edge = computed(() => playerReturn.value !== null && benchmarkReturn.value !== null
  ? (playerReturn.value - benchmarkReturn.value) * 100
  : null,
)

// --- wykres ---

const showPicks = ref(true)

type Row = Record<string, string | number | null>

const chartData = computed<Row[]>(() => (data.value?.history ?? []).map(point => ({
  // etykieta osi X; daty w sezonie (jeden rok) są unikalne
  day: shortDate.format(new Date(point.date)),
  player: point.player,
  benchmark: point.benchmark,
  ...Object.fromEntries(point.picks.map((r, i) => [`pick${i}`, r])),
})))

const chartCategories = computed<ChartCategory<Row>[]>(() => [
  { key: 'player', label: isMe.value ? 'Twój wynik' : 'Wynik gracza', color: 'primary' },
  // benchmark jako przygaszone tło — 'neutral' w UChart to prawie czarny/biały
  { key: 'benchmark', label: 'S&P 500', color: 'var(--ui-text-dimmed)' },
  ...(showPicks.value
    ? (data.value?.picks ?? []).map((p, i) => ({ key: `pick${i}`, label: p.name }))
    : []),
])

// --- tabela spółek ---

const columns: TableColumn<Pick>[] = [
  { accessorKey: 'category', header: 'Kategoria' },
  { accessorKey: 'name', header: 'Spółka' },
  { id: 'start', header: 'Cena startowa' },
  { id: 'last', header: 'Ostatnia cena' },
  { accessorKey: 'return', header: 'Wynik' },
]

// waluta jako kod z Yahoo (np. GBp = pensy), bez Intl.currency, które nie zna jednostek typu GBp
const formatPrice = (close: number, currency: string) => `${price.format(close)} ${currency}`
</script>

<template>
  <UContainer class="py-8 space-y-6">
    <UButton
      to="/"
      label="Ranking"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="link"
      class="px-0"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.statusMessage ?? 'Nie udało się wczytać gracza'"
    />

    <template v-else-if="data">
      <div class="flex flex-wrap items-center gap-4">
        <UAvatar
          :src="data.player.image ?? undefined"
          :alt="data.player.name"
          size="3xl"
        />
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold truncate">
            {{ data.player.name }}
          </h1>
          <p class="text-sm text-muted">
            Sezon {{ data.season.year }}<template v-if="data.asOf">
              · stan na zamknięcie {{ longDate.format(new Date(data.asOf)) }}
            </template>
          </p>
        </div>

        <UButton
          v-if="data.rank"
          :to="{ path: '/porownanie', query: { gracze: isMe ? id : [user?.id, id].filter(Boolean).join(',') } }"
          :label="isMe ? 'Porównaj z innymi' : 'Porównaj ze mną'"
          icon="i-lucide-chart-spline"
          color="neutral"
          variant="outline"
          class="ms-auto"
        />
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <p class="text-sm text-muted">
            Wynik
          </p>
          <p
            class="text-2xl font-semibold tabular-nums"
            :class="data.rank && benchmarkReturn !== null
              ? (data.rank.beatsBenchmark ? 'text-success' : 'text-error')
              : trendClass(playerReturn)"
          >
            {{ playerReturn === null ? '—' : percent.format(playerReturn) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Miejsce
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            <template v-if="data.rank">
              {{ data.rank.position }}<span class="text-base text-muted"> / {{ data.rank.of }}</span>
            </template>
            <template v-else>
              —
            </template>
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            S&P 500
          </p>
          <p
            class="text-2xl font-semibold tabular-nums"
            :class="trendClass(benchmarkReturn)"
          >
            {{ benchmarkReturn === null ? '—' : percent.format(benchmarkReturn) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">
            Względem S&P 500
          </p>
          <p
            class="text-2xl font-semibold tabular-nums"
            :class="trendClass(edge)"
          >
            {{ edge === null ? '—' : `${points.format(edge)} pp` }}
          </p>
        </UCard>
      </div>

      <UAlert
        v-if="!data.rank"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="data.picks.length
          ? 'Gracz nie jest w rankingu — brakuje wyborów albo cen części spółek.'
          : 'Gracz nie wybrał spółek w tym sezonie.'"
      />

      <UCard v-if="data.picks.length">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">
              Wynik od startu sezonu
            </h2>
            <USwitch
              v-model="showPicks"
              label="Pokaż spółki"
              size="sm"
            />
          </div>
        </template>

        <UChart
          v-if="chartData.length > 1"
          :data="chartData"
          index="day"
          :categories="chartCategories"
          :format="value => percent.format(value)"
          :height="320"
          :aria-label="`Wynik ${data.player.name} na tle S&P 500 od ${longDate.format(new Date(data.season.startDate))}`"
        />
        <p
          v-else
          class="text-sm text-muted text-center py-12"
        >
          Wykres pojawi się po pierwszej sesji sezonu.
        </p>
      </UCard>

      <UCard
        v-if="data.picks.length"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <UTable
          :data="data.picks"
          :columns="columns"
          :get-row-id="(row: Pick) => row.symbol"
        >
          <template #category-cell="{ row }">
            <span class="text-muted">{{ CATEGORY_LABELS[row.original.category] }}</span>
          </template>

          <template #name-cell="{ row }">
            <div class="leading-tight">
              <p class="font-medium text-highlighted">
                {{ row.original.name }}
              </p>
              <p class="text-xs text-muted">
                {{ row.original.symbol }}<template v-if="row.original.exchange">
                  · {{ row.original.exchange }}
                </template>
              </p>
            </div>
          </template>

          <template #start-cell="{ row }">
            <div
              v-if="row.original.start"
              class="leading-tight tabular-nums"
            >
              <p>{{ formatPrice(row.original.start.close, row.original.currency) }}</p>
              <p class="text-xs text-muted">
                {{ longDate.format(new Date(row.original.start.date)) }}
              </p>
            </div>
            <span
              v-else
              class="text-muted"
            >—</span>
          </template>

          <template #last-cell="{ row }">
            <div
              v-if="row.original.last"
              class="leading-tight tabular-nums"
            >
              <p>{{ formatPrice(row.original.last.close, row.original.currency) }}</p>
              <p class="text-xs text-muted">
                {{ longDate.format(new Date(row.original.last.date)) }}
              </p>
            </div>
            <span
              v-else
              class="text-muted"
            >—</span>
          </template>

          <template #return-cell="{ row }">
            <span
              class="font-semibold tabular-nums"
              :class="trendClass(row.original.return)"
            >
              {{ row.original.return === null ? '—' : percent.format(row.original.return) }}
            </span>
          </template>
        </UTable>
      </UCard>
    </template>
  </UContainer>
</template>
