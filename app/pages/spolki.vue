<script setup lang="ts">
import { getPaginationRowModel } from '@tanstack/vue-table'
import type { FilterFn, PaginationState, SortingState } from '@tanstack/vue-table'
import type { TableColumn, TabsItem } from '@nuxt/ui'
import { formatPrice, longDate, matchesText, percent, trendClass } from '~/utils/format'
import { CATEGORY_LABELS } from '~/utils/picks'
import type { Category } from '~/utils/picks'
import { sortHeader, width } from '~/utils/table'

definePageMeta({ auth: 'user' })
useSeoMeta({ title: 'Spółki — Stonks Market' })

const route = useRoute()
const router = useRouter()
const { data: ranking, status, error } = await useFetch('/api/instruments/ranking')

type Instrument = NonNullable<typeof ranking.value>['instruments'][number]
type Row = Instrument & { rank: number | null }

const categories = computed(() => ranking.value?.season?.categories ?? [])

// --- przełącznik kategorii, trzymany w ?kategoria=, żeby dało się podlinkować np. same polskie spółki ---

type Filter = Category | 'all'

const category = computed<Filter>({
  get: () => {
    const q = route.query.kategoria
    return typeof q === 'string' && categories.value.includes(q as Category) ? q as Category : 'all'
  },
  set: value => router.replace({ query: { ...route.query, kategoria: value === 'all' ? undefined : value } }),
})

const tabs = computed<TabsItem[]>(() => [
  { label: 'Wszystkie', value: 'all' },
  ...categories.value.map(c => ({ label: CATEGORY_LABELS[c], value: c })),
])

// miejsce liczone w obrębie wybranej kategorii (API zwraca od najlepszego); bez cen — bez miejsca
const rows = computed<Row[]>(() => {
  const list = (ranking.value?.instruments ?? []).filter(i => category.value === 'all' || i.category === category.value)
  return list.map((i, index) => ({ ...i, rank: i.return === null ? null : index + 1 }))
})

// --- tabela ---

const table = useTemplateRef('table')

const sorting = ref<SortingState>([])
const globalFilter = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const columns = computed<TableColumn<Row>[]>(() => [
  // undefined zamiast null, bo tylko undefined trafia na koniec przez `sortUndefined` (null sortuje się jak 0)
  {
    id: 'rank',
    accessorFn: r => r.rank ?? undefined,
    header: sortHeader<Row>('#'),
    enableSorting: true,
    sortDescFirst: false,
    sortUndefined: 'last',
    meta: width('w-20'),
  },
  {
    accessorKey: 'name',
    header: sortHeader<Row>('Spółka'),
    enableSorting: true,
    sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'pl'),
  },
  // przy wybranej kategorii kolumna byłaby taka sama w każdym wierszu
  ...(category.value === 'all' ? [{ accessorKey: 'category', header: 'Kategoria', meta: width('w-28') }] : []),
  { accessorKey: 'pickers', header: sortHeader<Row>('Graczy'), enableSorting: true, meta: width('w-28') },
  { id: 'start', header: 'Cena startowa', meta: width('w-40') },
  { id: 'last', header: 'Ostatnia cena', meta: width('w-40') },
  {
    id: 'return',
    accessorFn: r => r.return ?? undefined,
    header: sortHeader<Row>('Wynik'),
    enableSorting: true,
    sortUndefined: 'last',
    meta: width('w-32'),
  },
])

const matchesQuery = (i: Instrument, query: string) => matchesText([i.name, i.symbol, i.exchange], query)
const matchesInstrument: FilterFn<Row> = (row, _columnId, query: string) => matchesQuery(row.original, query)

// liczone z danych, nie z tableApi — ref tabeli jest pusty przy SSR
const filteredCount = computed(() => rows.value.filter(i => matchesQuery(i, globalFilter.value)).length)
const pageRange = computed(() => {
  const { pageIndex, pageSize } = pagination.value
  return { from: pageIndex * pageSize + 1, to: Math.min((pageIndex + 1) * pageSize, filteredCount.value) }
})

const emptyText = computed(() => {
  if (globalFilter.value) return `Brak wyników dla „${globalFilter.value}”`
  return category.value === 'all' ? 'Nikt nie wybrał jeszcze żadnej spółki' : 'Nikt nie wybrał jeszcze spółki z tej kategorii'
})
</script>

<template>
  <UContainer class="py-8 space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">
          Ranking spółek{{ ranking?.season ? ` sezonu ${ranking.season.year}` : '' }}
        </h1>
        <p
          v-if="ranking?.asOf"
          class="text-sm text-muted"
        >
          Wynik od startu sezonu, stan na zamknięcie {{ longDate.format(new Date(ranking.asOf)) }}
        </p>
      </div>

      <div
        v-if="ranking?.benchmark"
        class="text-right"
      >
        <p class="text-sm text-muted">
          Benchmark S&P 500
        </p>
        <p
          class="text-lg font-semibold"
          :class="trendClass(ranking.benchmark.return)"
        >
          {{ percent.format(ranking.benchmark.return) }}
        </p>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Nie udało się wczytać rankingu spółek"
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
          Ranking spółek pojawi się po starcie sezonu.
        </p>
      </div>
    </UCard>

    <UCard
      v-else
      :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4', footer: 'p-3 sm:px-4' }"
    >
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UTabs
            v-model="category"
            :items="tabs"
            :content="false"
            size="sm"
            class="w-full sm:w-auto"
          />

          <UInput
            v-model="globalFilter"
            icon="i-lucide-search"
            placeholder="Szukaj spółki lub tickera…"
            class="w-full sm:max-w-xs"
            :ui="{ trailing: 'pe-1' }"
          >
            <template
              v-if="globalFilter"
              #trailing
            >
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                aria-label="Wyczyść wyszukiwanie"
                @click="globalFilter = ''"
              />
            </template>
          </UInput>
        </div>
      </template>

      <UTable
        ref="table"
        v-model:sorting="sorting"
        v-model:global-filter="globalFilter"
        v-model:pagination="pagination"
        :ui="{ base: 'table-fixed w-full min-w-[60rem]' }"
        :data="rows"
        :columns="columns"
        :loading="status === 'pending'"
        :empty="emptyText"
        :global-filter-options="{ globalFilterFn: matchesInstrument }"
        :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
        :get-row-id="(row: Row) => `${row.category}:${row.symbol}`"
      >
        <template #rank-cell="{ row }">
          <span class="font-medium tabular-nums">{{ row.original.rank ?? '—' }}</span>
        </template>

        <template #name-cell="{ row }">
          <div class="leading-tight min-w-0">
            <p
              class="font-medium text-highlighted truncate"
              :title="row.original.name"
            >
              {{ row.original.name }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ row.original.symbol }}<template v-if="row.original.exchange">
                · {{ row.original.exchange }}
              </template>
            </p>
          </div>
        </template>

        <template #category-cell="{ row }">
          <span class="text-muted">{{ CATEGORY_LABELS[row.original.category] }}</span>
        </template>

        <template #pickers-cell="{ row }">
          <span class="tabular-nums">{{ row.original.pickers }}</span>
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

      <template
        v-if="filteredCount > 0"
        #footer
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted tabular-nums">
            {{ pageRange.from }}–{{ pageRange.to }} z {{ filteredCount }}
          </p>
          <UPagination
            v-if="filteredCount > pagination.pageSize"
            :page="pagination.pageIndex + 1"
            :items-per-page="pagination.pageSize"
            :total="filteredCount"
            @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
          />
        </div>
      </template>
    </UCard>
  </UContainer>
</template>
