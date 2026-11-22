import { h } from 'vue'
import type { HeaderContext } from '@tanstack/vue-table'
import { UButton } from '#components'

// Nagłówek kolumny z przyciskiem sortowania: kolejne kliknięcia → pierwszy kierunek → drugi → bez sortowania.
// Kolumna potrzebuje też `enableSorting: true` (aria-sort na <th>).
export function sortHeader<T>(label: string) {
  return ({ column }: HeaderContext<T, unknown>) => {
    const sorted = column.getIsSorted()
    return h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label,
      icon: sorted === 'asc'
        ? 'i-lucide-arrow-up-narrow-wide'
        : sorted === 'desc' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(),
    })
  }
}

// Stała szerokość kolumny (klasa Tailwind na <th>). Działa z `table-fixed` na tabeli, dzięki czemu kolumny
// nie skaczą po sortowaniu i zmianie strony; kolumna bez szerokości bierze resztę miejsca.
export const width = (cls: string) => ({ class: { th: cls } })
