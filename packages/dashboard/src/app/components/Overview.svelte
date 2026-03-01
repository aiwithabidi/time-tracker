<script lang="ts">
  import { api, type NowData, type TodayData, type StreakData } from '../lib/api'
  import { formatDuration } from '../lib/format'

  let now = $state<NowData | null>(null)
  let today = $state<TodayData | null>(null)
  let streak = $state<StreakData | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let elapsed = $state(0)

  let isTracking = $derived(now?.active ?? false)
  let goalPercent = $derived(now?.goalPercent ?? 0)
  let goalSet = $derived(now?.goalMinutes != null && now.goalMinutes > 0)

  let sessionCount = $derived(today?.projects.reduce((sum, p) => sum + p.sessionCount, 0) ?? 0)
  let avgSessionMs = $derived(() => {
    if (!today || sessionCount === 0) return 0
    return today.grandTotalMs / sessionCount
  })

  $effect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  })

  // Tick elapsed timer every second when tracking
  $effect(() => {
    if (!isTracking) return
    const tick = setInterval(() => { elapsed += 1000 }, 1000)
    return () => clearInterval(tick)
  })

  async function fetchAll() {
    try {
      const [nowRes, todayRes, streakRes] = await Promise.all([
        api.now(),
        api.today(),
        api.streak(),
      ])
      now = nowRes
      today = todayRes
      streak = streakRes
      elapsed = nowRes.durationMs
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data'
    } finally {
      loading = false
    }
  }

  // SVG circle progress
  const CIRCLE_R = 40
  const CIRCLE_C = 2 * Math.PI * CIRCLE_R
  let strokeDashoffset = $derived(CIRCLE_C - (Math.min(goalPercent, 100) / 100) * CIRCLE_C)
</script>

{#if loading}
  <div class="space-y-4">
    <div class="rounded-lg bg-surface p-6 border border-border animate-pulse">
      <div class="h-6 w-48 bg-surface-raised rounded mb-3"></div>
      <div class="h-10 w-32 bg-surface-raised rounded"></div>
    </div>
    <div class="grid grid-cols-3 gap-4">
      {#each Array(3) as _}
        <div class="rounded-lg bg-surface p-5 border border-border animate-pulse">
          <div class="h-4 w-20 bg-surface-raised rounded mb-2"></div>
          <div class="h-8 w-16 bg-surface-raised rounded"></div>
        </div>
      {/each}
    </div>
  </div>
{:else if error}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <p class="text-warning text-sm">{error}</p>
    <button onclick={fetchAll} class="text-accent text-sm mt-2 hover:underline">Retry</button>
  </div>
{:else}
  <div class="space-y-4">
    <!-- Status card -->
    <div class="rounded-lg bg-surface p-6 border border-border flex items-center justify-between">
      <div>
        {#if isTracking && now}
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <span class="text-sm text-[#8b949e]">Tracking</span>
          </div>
          <div class="text-2xl font-bold text-[#e6edf3]">{now.project}</div>
          <div class="text-3xl font-bold text-accent mt-1">{formatDuration(elapsed)}</div>
        {:else}
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-[#8b949e]"></span>
            <span class="text-sm text-[#8b949e]">Not tracking</span>
          </div>
          <div class="text-lg text-[#8b949e] mt-1">Start a session with <code class="text-accent bg-surface-raised px-1.5 py-0.5 rounded text-sm">tt start</code></div>
        {/if}
      </div>

      <!-- Goal progress ring -->
      {#if goalSet}
        <div class="flex flex-col items-center">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <!-- Background circle -->
            <circle
              cx="50" cy="50" r={CIRCLE_R}
              fill="none"
              stroke="var(--color-surface-raised)"
              stroke-width="6"
            />
            <!-- Progress arc -->
            <circle
              cx="50" cy="50" r={CIRCLE_R}
              fill="none"
              stroke={goalPercent >= 100 ? 'var(--color-success)' : 'var(--color-accent)'}
              stroke-width="6"
              stroke-linecap="round"
              stroke-dasharray={CIRCLE_C}
              stroke-dashoffset={strokeDashoffset}
              transform="rotate(-90 50 50)"
              class="transition-all duration-500"
            />
            <!-- Percentage text -->
            <text x="50" y="46" text-anchor="middle" class="fill-[#e6edf3] text-lg font-bold" font-size="16" font-weight="bold">
              {Math.round(goalPercent)}%
            </text>
            <text x="50" y="60" text-anchor="middle" class="fill-[#8b949e]" font-size="9">
              of goal
            </text>
          </svg>
        </div>
      {/if}
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-3 gap-4">
      <div class="rounded-lg bg-surface p-5 border border-border">
        <div class="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Today</div>
        <div class="text-2xl font-bold text-[#e6edf3]">{formatDuration(now?.todayTotalMs ?? 0)}</div>
      </div>
      <div class="rounded-lg bg-surface p-5 border border-border">
        <div class="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Sessions</div>
        <div class="text-2xl font-bold text-[#e6edf3]">{sessionCount}</div>
      </div>
      <div class="rounded-lg bg-surface p-5 border border-border">
        <div class="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Avg Session</div>
        <div class="text-2xl font-bold text-[#e6edf3]">{formatDuration(avgSessionMs())}</div>
      </div>
    </div>

    <!-- Streak summary -->
    {#if streak}
      <div class="rounded-lg bg-surface p-5 border border-border flex items-center gap-6">
        <div>
          <div class="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Current Streak</div>
          <div class="text-2xl font-bold text-[#e6edf3]">{streak.current} <span class="text-sm font-normal text-[#8b949e]">day{streak.current !== 1 ? 's' : ''}</span></div>
        </div>
        <div class="w-px h-8 bg-border"></div>
        <div>
          <div class="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Best Streak</div>
          <div class="text-lg font-semibold text-[#e6edf3]">{streak.best} <span class="text-sm font-normal text-[#8b949e]">days</span></div>
        </div>
        <div class="w-px h-8 bg-border"></div>
        <div>
          <div class="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Avg Daily</div>
          <div class="text-lg font-semibold text-[#e6edf3]">{(streak.avgDailyMinutes / 60).toFixed(1)} <span class="text-sm font-normal text-[#8b949e]">hrs</span></div>
        </div>
      </div>
    {/if}
  </div>
{/if}
