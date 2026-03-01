<script lang="ts">
  import { api, type HeatmapDay } from '../lib/api'
  import { formatHours } from '../lib/format'

  let days = $state<readonly HeatmapDay[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let tooltip = $state<{ x: number; y: number; date: string; hours: string } | null>(null)

  const CELL_SIZE = 13
  const GAP = 3
  const TOTAL = CELL_SIZE + GAP
  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  $effect(() => {
    fetchData()
  })

  async function fetchData() {
    try {
      days = await api.heatmap()
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load heatmap'
    } finally {
      loading = false
    }
  }

  function intensityLevel(minutes: number): number {
    if (minutes === 0) return 0
    if (minutes < 30) return 1
    if (minutes < 60) return 2
    if (minutes < 120) return 3
    return 4
  }

  const COLORS = [
    'var(--color-heatmap-0)',
    'var(--color-heatmap-1)',
    'var(--color-heatmap-2)',
    'var(--color-heatmap-3)',
    'var(--color-heatmap-4)',
  ]

  interface CellInfo {
    readonly week: number
    readonly day: number
    readonly date: string
    readonly minutes: number
    readonly level: number
  }

  let grid = $derived<readonly CellInfo[]>(() => {
    if (days.length === 0) return []
    const cells: CellInfo[] = []

    // Build a map from date string to minutes
    const minuteMap = new Map<string, number>()
    for (const d of days) {
      minuteMap.set(d.date, d.minutes)
    }

    // Start from 52 weeks ago
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 52 * 7 - startDate.getDay())

    for (let week = 0; week < 53; week++) {
      for (let day = 0; day < 7; day++) {
        const d = new Date(startDate)
        d.setDate(d.getDate() + week * 7 + day)
        if (d > now) continue
        const dateStr = d.toISOString().split('T')[0]
        const minutes = minuteMap.get(dateStr) ?? 0
        cells.push({
          week,
          day,
          date: dateStr,
          minutes,
          level: intensityLevel(minutes),
        })
      }
    }
    return cells
  })

  let monthLabels = $derived<readonly { label: string; x: number }[]>(() => {
    if (days.length === 0) return []
    const labels: { label: string; x: number }[] = []
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 52 * 7 - startDate.getDay())

    let lastMonth = -1
    for (let week = 0; week < 53; week++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + week * 7)
      const month = d.getMonth()
      if (month !== lastMonth) {
        labels.push({ label: MONTH_NAMES[month], x: week * TOTAL + 30 })
        lastMonth = month
      }
    }
    return labels
  })

  function handleMouseEnter(cell: CellInfo, event: MouseEvent) {
    const rect = (event.target as SVGElement).getBoundingClientRect()
    const parent = (event.target as SVGElement).closest('svg')!.getBoundingClientRect()
    tooltip = {
      x: rect.left - parent.left + CELL_SIZE / 2,
      y: rect.top - parent.top - 8,
      date: new Date(cell.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      hours: formatHours(cell.minutes * 60_000),
    }
  }

  function handleMouseLeave() {
    tooltip = null
  }
</script>

{#if loading}
  <div class="rounded-lg bg-surface p-6 border border-border animate-pulse">
    <div class="h-5 w-24 bg-surface-raised rounded mb-4"></div>
    <div class="h-[120px] w-full bg-surface-raised rounded"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <p class="text-warning text-sm">{error}</p>
    <button onclick={fetchData} class="text-accent text-sm mt-2 hover:underline">Retry</button>
  </div>
{:else}
  <div class="rounded-lg bg-surface p-6 border border-border overflow-x-auto">
    <div class="relative">
      <svg
        width={53 * TOTAL + 30}
        height={7 * TOTAL + 24}
        class="block"
      >
        <!-- Month labels -->
        {#each monthLabels() as ml}
          <text
            x={ml.x}
            y={12}
            class="fill-[#8b949e] text-[10px]"
            font-size="10"
          >{ml.label}</text>
        {/each}

        <!-- Day labels -->
        {#each DAY_LABELS as label, i}
          {#if label}
            <text
              x={0}
              y={20 + i * TOTAL + CELL_SIZE - 2}
              class="fill-[#8b949e] text-[10px]"
              font-size="10"
            >{label}</text>
          {/if}
        {/each}

        <!-- Cells -->
        {#each grid() as cell}
          <rect
            x={cell.week * TOTAL + 30}
            y={cell.day * TOTAL + 20}
            width={CELL_SIZE}
            height={CELL_SIZE}
            rx="2"
            fill={COLORS[cell.level]}
            class="transition-all duration-200 hover:stroke-[#e6edf3] hover:stroke-1 cursor-pointer"
            onmouseenter={(e) => handleMouseEnter(cell, e)}
            onmouseleave={handleMouseLeave}
          />
        {/each}
      </svg>

      <!-- Tooltip -->
      {#if tooltip}
        <div
          class="absolute pointer-events-none bg-[#1c2128] border border-border rounded-md px-3 py-1.5 text-xs text-[#e6edf3] shadow-lg -translate-x-1/2 -translate-y-full whitespace-nowrap z-10"
          style:left="{tooltip.x}px"
          style:top="{tooltip.y}px"
        >
          <div class="font-medium">{tooltip.date}</div>
          <div class="text-[#8b949e]">{tooltip.hours} tracked</div>
        </div>
      {/if}
    </div>

    <!-- Legend -->
    <div class="flex items-center justify-end gap-1.5 mt-3 text-xs text-[#8b949e]">
      <span>Less</span>
      {#each COLORS as color}
        <div
          class="w-[13px] h-[13px] rounded-sm"
          style:background-color={color}
        ></div>
      {/each}
      <span>More</span>
    </div>
  </div>
{/if}
