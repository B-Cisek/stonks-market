<script setup lang="ts">
import { getPaginationRowModel } from '@tanstack/vue-table'
import type { FilterFn, PaginationState, SortingState } from '@tanstack/vue-table'
import type { TableColumn } from '@nuxt/ui'
import { longDate as dateFormat, matchesText, percent, trendClass } from '~/utils/format'
import { CATEGORY_LABELS } from '~/utils/picks'
import type { Category } from '~/utils/picks'
import { sortHeader, width } from '~/utils/table'

const { user } = useUserSession()
const { data: ranking, status, error, refresh: refreshRanking } = await useFetch('/api/ranking')

type Player = NonNullable<typeof ranking.value>['players'][number]

const categories = computed(() => ranking.value?.season?.categories ?? [])

// --- tabela: sortowanie, wyszukiwanie, paginacja (wszystko po stronie klienta — ranking i tak przychodzi w całości) ---

const table = useTemplateRef('table')

// pusty = kolejność z API, czyli wg miejsca w rankingu; kolumna "#" zawsze pokazuje miejsce globalne
const sorting = ref<SortingState>([])
const globalFilter = ref('')
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const columns = computed<TableColumn<Player>[]>(() => [
  { accessorKey: 'rank', header: sortHeader<Player>('#'), enableSorting: true, sortDescFirst: false, meta: width('w-20') },
  {
    accessorKey: 'name',
    header: sortHeader<Player>('Gracz'),
    enableSorting: true,
    sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, 'pl'),
  },
  // kolumny kategorii sortują się po wyniku wybranej spółki
  ...categories.value.map(c => ({
    id: c,
    accessorFn: (p: Player) => pickFor(p, c)?.return ?? null,
    header: sortHeader<Player>(CATEGORY_LABELS[c]),
    enableSorting: true,
    meta: width('w-32'),
  })),
  { accessorKey: 'return', header: sortHeader<Player>('Wynik'), enableSorting: true, meta: width('w-32') },
])

// szukamy po nicku gracza oraz tickerze i nazwie każdej z jego spółek, niezależnie od kolumny
const matchesQuery = (p: Player, query: string) =>
  matchesText([p.name, ...p.picks.flatMap(pick => [pick.symbol, pick.name])], query)
const matchesPlayer: FilterFn<Player> = (row, _columnId, query: string) => matchesQuery(row.original, query)

// liczone z danych, nie z tableApi — ref tabeli jest pusty przy SSR
const filteredCount = computed(() => (ranking.value?.players ?? []).filter(p => matchesQuery(p, globalFilter.value)).length)
const pageRange = computed(() => {
  const { pageIndex, pageSize } = pagination.value
  return { from: pageIndex * pageSize + 1, to: Math.min((pageIndex + 1) * pageSize, filteredCount.value) }
})

function pickFor(player: Player, category: Category) {
  return player.picks.find(p => p.category === category)
}

// sezon z otwartymi zapisami i moje wybory — ten sam klucz co w PicksModal, więc jedno zapytanie
const { data: entry } = await useFetch('/api/picks', { key: 'my-picks' })
const entrySeason = computed(() => entry.value?.season)
const myPicks = computed(() => entry.value?.picks ?? [])
</script>

<template>
  <UContainer
    v-if="!ranking?.season && !error"
    class="flex-1 flex items-center justify-center py-8"
  >
    <!-- żaden sezon jeszcze nie wystartował: zamiast rankingu tylko zaproszenie do zapisów -->
    <UCard class="w-full max-w-lg text-center">
      <div
        v-if="entrySeason"
        class="space-y-4"
      >
        <UIcon
          name="i-lucide-rocket"
          class="size-10 text-primary"
        />
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold">
            Sezon {{ entrySeason.year }} startuje {{ dateFormat.format(new Date(entrySeason.startDate)) }}
          </h1>
          <p class="text-muted">
            {{ myPicks.length
              ? 'Twoje wybory są zapisane. Do zamknięcia zapisów możesz jeszcze zmienić swoje spółki.'
              : 'Wybierz po jednej spółce z każdej kategorii i sprawdź, czy pokonasz S&P 500.' }}
          </p>
        </div>

        <div
          v-if="myPicks.length"
          class="flex flex-wrap justify-center gap-2"
        >
          <UBadge
            v-for="p in myPicks"
            :key="p.category"
            color="neutral"
            variant="subtle"
            :label="`${CATEGORY_LABELS[p.category]}: ${p.name}`"
          />
        </div>

        <PicksModal size="xl" />
      </div>

      <div
        v-else
        class="space-y-2"
      >
        <UIcon
          name="i-lucide-calendar-clock"
          class="size-10 text-muted"
        />
        <h1 class="text-xl font-semibold">
          Sezon jeszcze nie wystartował
        </h1>
        <p class="text-muted">
          Zapisy do kolejnego sezonu jeszcze się nie otworzyły. Zajrzyj tu wkrótce.
        </p>
      </div>
    </UCard>
  </UContainer>

  <UContainer
    v-else
    class="py-8 space-y-6"
  >
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">
          Ranking{{ ranking?.season ? ` sezonu ${ranking.season.year}` : '' }}
        </h1>
        <p
          v-if="ranking?.asOf"
          class="text-sm text-muted"
        >
          Stan na zamknięcie {{ dateFormat.format(new Date(ranking.asOf)) }}
        </p>
      </div>

      <div class="flex items-end gap-6">
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

        <!-- widoczny tylko w trakcie zapisów do sezonu -->
        <PicksModal @saved="refreshRanking()" />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Nie udało się wczytać rankingu"
      :description="error.statusMessage ?? error.message"
    />

    <UCard :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4', footer: 'p-3 sm:px-4' }">
      <template #header>
        <UInput
          v-model="globalFilter"
          icon="i-lucide-search"
          placeholder="Szukaj gracza lub spółki…"
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
      </template>

      <UTable
        ref="table"
        v-model:sorting="sorting"
        v-model:global-filter="globalFilter"
        v-model:pagination="pagination"
        :ui="{ base: 'table-fixed w-full min-w-[52rem]' }"
        :data="ranking?.players ?? []"
        :columns="columns"
        :loading="status === 'pending'"
        :empty="globalFilter ? `Brak wyników dla „${globalFilter}”` : 'Nikt nie ma jeszcze kompletu wyborów'"
        :global-filter-options="{ globalFilterFn: matchesPlayer }"
        :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
        :get-row-id="(row: Player) => row.userId"
        :meta="{ class: { tr: (row) => row.original.userId === user?.id ? 'bg-elevated/50' : '' } }"
      >
        <template #rank-cell="{ row }">
          <span class="font-medium tabular-nums">{{ row.original.rank }}</span>
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

        <template
          v-for="category in categories"
          :key="category"
          #[`${category}-cell`]="{ row }"
        >
          <div
            v-if="pickFor(row.original, category)"
            class="leading-tight"
          >
            <p
              class="font-medium"
              :title="pickFor(row.original, category)!.name"
            >
              {{ pickFor(row.original, category)!.symbol }}
            </p>
            <p
              class="text-xs tabular-nums"
              :class="trendClass(pickFor(row.original, category)!.return)"
            >
              {{ percent.format(pickFor(row.original, category)!.return) }}
            </p>
          </div>
        </template>

        <template #return-cell="{ row }">
          <span
            class="font-semibold tabular-nums"
            :class="ranking?.benchmark ? (row.original.beatsBenchmark ? 'text-success' : 'text-error') : trendClass(row.original.return)"
          >
            {{ percent.format(row.original.return) }}
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
