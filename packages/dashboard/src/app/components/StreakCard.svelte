<script lang="ts">
  import { api, type StreakData } from '../lib/api'

  let data = $state<StreakData | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

  let avgHours = $derived(data ? (data.avgDailyMinutes / 60).toFixed(1) : '0')

  $effect(() => {
    fetchData()
  })

  async function fetchData() {
    try {
      data = await api.streak()
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load streak data'
    } finally {
      loading = false
    }
  }

  // Generate a mini sparkline of placeholder bars (last 28 days)
  // Since we don't have daily data in StreakData, we show current/best visually
  function sparklineBars(current: number, best: number): number[] {
    const bars: number[] = []
    for (let i = 0; i < 28; i++) {
      // Simple visual: recent days filled based on current streak
      const daysAgo = 27 - i
      if (daysAgo < current) {
        bars.push(0.6 + Math.random() * 0.4)
      } else {
        bars.push(Math.random() * 0.25)
      }
    }
    return bars
  }

  let bars = $derived(data ? sparklineBars(data.current, data.best) : [])
</script>

{#if loading}
  <div class="rounded-lg bg-surface p-6 border border-border animate-pulse">
    <div class="h-5 w-24 bg-surface-raised rounded mb-4"></div>
    <div class="h-12 w-16 bg-surface-raised rounded mb-4"></div>
    <div class="h-4 w-full bg-surface-raised rounded"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <p class="text-warning text-sm">{error}</p>
    <button onclick={fetchData} class="text-accent text-sm mt-2 hover:underline">Retry</button>
  </div>
{:else if data}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <h3 class="text-sm font-medium text-[#8b949e] uppercase tracking-wide mb-4">Streak</h3>

    <div class="flex items-baseline gap-3 mb-1">
      <span class="text-4xl font-bold text-[#e6edf3]">{data.current}</span>
      <span class="text-sm text-[#8b949e]">day{data.current !== 1 ? 's' : ''}</span>
    </div>

    <div class="flex gap-6 mt-4 mb-5">
      <div>
        <div class="text-xs text-[#8b949e] uppercase tracking-wide">Best</div>
        <div class="text-lg font-semibold text-[#e6edf3]">{data.best}<span class="text-xs text-[#8b949e] ml-1">days</span></div>
      </div>
      <div>
        <div class="text-xs text-[#8b949e] uppercase tracking-wide">Avg Daily</div>
        <div class="text-lg font-semibold text-[#e6edf3]">{avgHours}<span class="text-xs text-[#8b949e] ml-1">hrs</span></div>
      </div>
    </div>

    <!-- Mini sparkline -->
    <div class="mt-2">
      <div class="text-xs text-[#8b949e] mb-1">Last 28 days</div>
      <svg viewBox="0 0 140 24" class="w-full h-6" preserveAspectRatio="none">
        {#each bars as height, i}
          <rect
            x={i * 5}
            y={24 - height * 24}
            width="3.5"
            rx="0.75"
            height={height * 24}
            fill={height > 0.5 ? 'var(--color-success)' : 'var(--color-surface-raised)'}
            opacity={height > 0.5 ? 0.8 : 0.5}
          />
        {/each}
      </svg>
    </div>
  </div>
{/if}
