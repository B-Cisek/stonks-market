<script setup lang="ts">
import type { ChartCategory, InputMenuItem, TableColumn } from '@nuxt/ui'
import { longDate, percent, points, shortDate, trendClass } from '~/utils/format'
import { width } from '~/utils/table'

definePageMeta({ auth: 'user' })
useSeoMeta({ title: 'Porównanie graczy — Stonks Market' })

// tyle, ile kolorów ma domyślna paleta UChart (--ui-chart-1…6); to samo w server/api/players/compare.get.ts
const MAX_COMPARED = 6

const route = useRoute()
const router = useRouter()
const { user } = useUserSession()

// lista do wyboru — tylko gracze z rankingu, bo tylko oni mają pełny wynik
const { data: ranking } = await useFetch('/api/ranking')
const rankedIds = computed(() => new Set((ranking.value?.players ?? []).map(p => p.userId)))

// --- wybrani gracze, trzymani w ?gracze=<id>,<id>, żeby porównanie dało się wysłać linkiem ---

const selected = computed<string[]>({
  get: () => {
    const q = route.query.gracze
    // bez parametru: zaczynamy od siebie (o ile jestem w rankingu)
    const ids = typeof q === 'string' ? q.split(',') : [user.value?.id ?? '']
    return [...new Set(ids)].filter(id => rankedIds.value.has(id)).slice(0, MAX_COMPARED)
  },
  // pusty string zamiast usunięcia parametru — inaczej po odznaczeniu wszystkich wróciłby domyślny wybór
  set: ids => router.replace({ query: { ...route.query, gracze: ids.slice(0, MAX_COMPARED).join(',') } }),
})

const full = computed(() => selected.value.length >= MAX_COMPARED)

const items = computed<InputMenuItem[]>(() => (ranking.value?.players ?? []).map(p => ({
  label: p.name,
  value: p.userId,
  avatar: { src: p.image ?? undefined, alt: p.name },
  description: `#${p.rank} · ${percent.format(p.return)}`,
  // po osiągnięciu limitu można już tylko usuwać
  disabled: full.value && !selected.value.includes(p.userId),
})))

const { data, status, error } = await useFetch('/api/players/compare', {
  query: { ids: computed(() => selected.value.join(',')) },
})

// --- wykres ---

type ChartRow = Record<string, string | number | null>

const chartData = computed<ChartRow[]>(() => (data.value?.history ?? []).map(point => ({
  // etykieta osi X; daty w sezonie (jeden rok) są unikalne
  day: shortDate.format(new Date(point.date)),
  benchmark: point.benchmark,
  ...Object.fromEntries(point.players.map((r, i) => [`p${i}`, r])),
})))

// gracze pierwsi, żeby dostali kolory palety w kolejności tagów; benchmark jako przygaszone tło
const chartCategories = computed<ChartCategory<ChartRow>[]>(() => [
  ...(data.value?.players ?? []).map((p, i) => ({ key: `p${i}`, label: p.userId === user.value?.id ? `${p.name} (Ty)` : p.name })),
  { key: 'benchmark', label: 'S&P 500', color: 'var(--ui-text-dimmed)' },
])

// --- tabela ---

type Player = NonNullable<typeof data.value>['players'][number]

// w tabeli kolejność wg rankingu — łatwiej porównać miejsca
const tableRows = computed(() => [...(data.value?.players ?? [])].sort((a, b) => a.rank - b.rank))

const benchmarkReturn = computed(() => data.value?.benchmark?.return ?? null)

const columns: TableColumn<Player>[] = [
  { accessorKey: 'rank', header: 'Miejsce', meta: width('w-28') },
  { accessorKey: 'name', header: 'Gracz', meta: width('w-56') },
  { id: 'picks', header: 'Spółki' },
  { accessorKey: 'return', header: 'Wynik', meta: width('w-28') },
  { id: 'edge', header: 'Względem S&P 500', meta: width('w-44') },
]

// przewaga nad S&P 500 w punktach procentowych
const edgeOf = (p: Player) => benchmarkReturn.value === null ? null : (p.return - benchmarkReturn.value) * 100
</script>

<template>
  <UContainer class="py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        Porównanie graczy{{ data?.season ? ` — sezon ${data.season.year}` : '' }}
      </h1>
      <p
        v-if="data?.asOf"
        class="text-sm text-muted"
      >
        Stan na zamknięcie {{ longDate.format(new Date(data.asOf)) }}
      </p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Nie udało się wczytać porównania"
      :description="error.statusMessage ?? error.message"
    />

    <UCard
      v-else-if="!ranking?.season"
      class="text-center"
    >
      <div class="space-y-2 py-6">
        <UIcon
          name="i-lucide-calendar-clock"
          class="size-10 text-muted"
        />
        <p class="text-muted">
          Porównanie będzie dostępne po starcie sezonu.
        </p>
      </div>
    </UCard>

    <template v-else>
      <UFormField
        label="Gracze do porównania"
        :hint="`${selected.length} / ${MAX_COMPARED}`"
        :help="full ? `Można porównać najwyżej ${MAX_COMPARED} graczy — usuń kogoś, żeby dodać innego.` : 'Na liście są tylko gracze z kompletem wyborów.'"
      >
        <UInputMenu
          v-model="selected"
          :items="items"
          value-key="value"
          multiple
          open-on-focus
          placeholder="Wpisz nick gracza…"
          class="w-full"
          size="xl"
        />
      </UFormField>

      <UCard
        v-if="!selected.length"
        class="text-center"
      >
        <div class="space-y-2 py-6">
          <UIcon
            name="i-lucide-chart-spline"
            class="size-10 text-muted"
          />
          <p class="text-muted">
            Dodaj graczy, żeby zobaczyć ich wyniki na jednym wykresie.
          </p>
        </div>
      </UCard>

      <template v-else-if="data?.players.length">
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              Wynik od startu sezonu
            </h2>
          </template>

          <UChart
            v-if="chartData.length > 1"
            :data="chartData"
            index="day"
            :categories="chartCategories"
            :format="value => percent.format(value)"
            :height="360"
            :aria-label="`Wyniki graczy ${data.players.map(p => p.name).join(', ')} na tle S&P 500 od ${longDate.format(new Date(data.season!.startDate))}`"
          />
          <p
            v-else
            class="text-sm text-muted text-center py-12"
          >
            Wykres pojawi się po pierwszej sesji sezonu.
          </p>
        </UCard>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <UTable
            :ui="{ base: 'table-fixed w-full min-w-[56rem]' }"
            :data="tableRows"
            :columns="columns"
            :loading="status === 'pending'"
            :get-row-id="(row: Player) => row.userId"
            :meta="{ class: { tr: (row) => row.original.userId === user?.id ? 'bg-elevated/50' : '' } }"
          >
            <template #rank-cell="{ row }">
              <span class="font-medium tabular-nums">
                {{ row.original.rank }}<span class="text-muted"> / {{ data.total }}</span>
              </span>
            </template>

            <template #name-cell="{ row }">
              <div class="flex items-center gap-2 min-w-0">
                <UAvatar
                  :src="row.original.image ?? undefined"
                  :alt="row.original.name"
                  size="xs"
                />
                <NuxtLink
                  :to="`/gracze/${row.original.userId}`"
                  class="min-w-0 truncate font-medium text-highlighted hover:underline"
                >
                  {{ row.original.name }}
                </NuxtLink>
              </div>
            </template>

            <template #picks-cell="{ row }">
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <div
                  v-for="pick in row.original.picks"
                  :key="pick.symbol"
                  class="leading-tight"
                >
                  <p
                    class="font-medium"
                    :title="pick.name"
                  >
                    {{ pick.symbol }}
                  </p>
                  <p
                    class="text-xs tabular-nums"
                    :class="trendClass(pick.return)"
                  >
                    {{ percent.format(pick.return) }}
                  </p>
                </div>
              </div>
            </template>

            <template #return-cell="{ row }">
              <span
                class="font-semibold tabular-nums"
                :class="benchmarkReturn !== null ? (row.original.beatsBenchmark ? 'text-success' : 'text-error') : trendClass(row.original.return)"
              >
                {{ percent.format(row.original.return) }}
              </span>
            </template>

            <template #edge-cell="{ row }">
              <span
                class="tabular-nums"
                :class="trendClass(edgeOf(row.original))"
              >
                {{ edgeOf(row.original) === null ? '—' : `${points.format(edgeOf(row.original)!)} pp` }}
              </span>
            </template>
          </UTable>
        </UCard>
      </template>
    </template>
  </UContainer>
</template>
