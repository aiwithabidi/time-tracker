<script lang="ts">
  import { api, type WeekData } from '../lib/api'
  import { formatDuration } from '../lib/format'

  let data = $state<WeekData | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const PROJECT_COLORS = [
    '#58a6ff', '#3fb950', '#d2a8ff', '#f0883e',
    '#f778ba', '#79c0ff', '#56d364', '#e2c541',
  ]

  $effect(() => {
    fetchData()
  })

  async function fetchData() {
    try {
      data = await api.week()
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load weekly data'
    } finally {
      loading = false
    }
  }

  let allProjects = $derived<string[]>(() => {
    if (!data) return []
    const set = new Set<string>()
    for (const day of data.days) {
      for (const p of Object.keys(day.projects)) set.add(p)
    }
    return [...set]
  })

  let maxMs = $derived(() => {
    if (!data) return 1
    return Math.max(1, ...data.days.map((d) => d.totalMs))
  })

  function projectColor(project: string): string {
    const idx = allProjects().indexOf(project)
    return PROJECT_COLORS[idx % PROJECT_COLORS.length]
  }
</script>

{#if loading}
  <div class="rounded-lg bg-surface p-6 border border-border animate-pulse">
    <div class="h-5 w-32 bg-surface-raised rounded mb-4"></div>
    <div class="h-48 w-full bg-surface-raised rounded"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <p class="text-warning text-sm">{error}</p>
    <button onclick={fetchData} class="text-accent text-sm mt-2 hover:underline">Retry</button>
  </div>
{:else if data}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <div class="flex items-baseline justify-between mb-4">
      <h3 class="text-sm font-medium text-[#8b949e] uppercase tracking-wide">This Week</h3>
      <span class="text-sm text-[#e6edf3]">{formatDuration(data.grandTotalMs)} total</span>
    </div>

    <!-- Bar chart -->
    <div class="flex items-end gap-2 h-48">
      {#each data.days as day, i}
        {@const heightPct = (day.totalMs / maxMs()) * 100}
        {@const projects = allProjects()}
        <div class="flex-1 flex flex-col items-center gap-1 h-full">
          <!-- Stacked bar -->
          <div class="flex-1 w-full flex flex-col justify-end relative group">
            <div class="w-full rounded-t-md overflow-hidden flex flex-col-reverse" style:height="{heightPct}%">
              {#each projects as project}
                {@const ms = day.projects[project] ?? 0}
                {#if ms > 0}
                  {@const segPct = (ms / day.totalMs) * 100}
                  <div
                    class="w-full transition-all duration-200"
                    style:height="{segPct}%"
                    style:background-color={projectColor(project)}
                    style:opacity="0.8"
                  ></div>
                {/if}
              {/each}
            </div>
            <!-- Tooltip -->
            {#if day.totalMs > 0}
              <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div class="bg-[#1c2128] border border-border rounded-md px-3 py-1.5 text-xs text-[#e6edf3] shadow-lg whitespace-nowrap">
                  {formatDuration(day.totalMs)}
                </div>
              </div>
            {/if}
          </div>
          <!-- Day label -->
          <span class="text-[10px] text-[#8b949e]">{DAY_LABELS[i]}</span>
        </div>
      {/each}
    </div>

    <!-- Legend -->
    {#if allProjects().length > 0}
      <div class="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
        {#each allProjects() as project}
          <div class="flex items-center gap-1.5 text-xs text-[#8b949e]">
            <div class="w-2.5 h-2.5 rounded-sm" style:background-color={projectColor(project)} style:opacity="0.8"></div>
            <span>{project}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
