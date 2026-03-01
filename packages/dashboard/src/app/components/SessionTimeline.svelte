<script lang="ts">
  import { api, type SessionData } from '../lib/api'
  import { formatTime, formatDuration } from '../lib/format'

  let sessions = $state<readonly SessionData[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let hoveredSession = $state<string | null>(null)

  const PROJECT_COLORS = [
    '#58a6ff',
    '#3fb950',
    '#d2a8ff',
    '#f0883e',
    '#f778ba',
    '#79c0ff',
    '#56d364',
    '#e2c541',
  ]

  $effect(() => {
    fetchData()
  })

  async function fetchData() {
    try {
      const today = new Date().toISOString().split('T')[0]
      sessions = await api.sessions(today, today)
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load sessions'
    } finally {
      loading = false
    }
  }

  // Build time axis bounds
  let timeRange = $derived(() => {
    if (sessions.length === 0) {
      const now = new Date()
      const sixAm = new Date(now)
      sixAm.setHours(6, 0, 0, 0)
      return { start: sixAm.getTime(), end: now.getTime() }
    }
    const starts = sessions.map((s) => s.startTime)
    const ends = sessions.map((s) => s.endTime ?? Date.now())
    const earliest = Math.min(...starts)
    const latest = Math.max(...ends)
    // Round down to nearest hour for start, up for end
    const startHour = new Date(earliest)
    startHour.setMinutes(0, 0, 0)
    const endHour = new Date(latest)
    endHour.setHours(endHour.getHours() + 1, 0, 0, 0)
    return { start: startHour.getTime(), end: endHour.getTime() }
  })

  // Build hour markers
  let hourMarkers = $derived(() => {
    const { start, end } = timeRange()
    const markers: { time: number; label: string }[] = []
    let t = start
    while (t <= end) {
      markers.push({ time: t, label: formatTime(t) })
      t += 3_600_000
    }
    return markers
  })

  // Map projects to colors
  let projectColorMap = $derived(() => {
    const map = new Map<string, string>()
    const uniqueProjects = [...new Set(sessions.map((s) => s.project))]
    uniqueProjects.forEach((p, i) => {
      map.set(p, PROJECT_COLORS[i % PROJECT_COLORS.length])
    })
    return map
  })

  function getPosition(timestamp: number): number {
    const { start, end } = timeRange()
    const range = end - start
    if (range === 0) return 0
    return ((timestamp - start) / range) * 100
  }

  function getWidth(session: SessionData): number {
    const endTime = session.endTime ?? Date.now()
    return getPosition(endTime) - getPosition(session.startTime)
  }
</script>

{#if loading}
  <div class="rounded-lg bg-surface p-6 border border-border animate-pulse">
    <div class="h-5 w-40 bg-surface-raised rounded mb-4"></div>
    <div class="h-16 w-full bg-surface-raised rounded"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <p class="text-warning text-sm">{error}</p>
    <button onclick={fetchData} class="text-accent text-sm mt-2 hover:underline">Retry</button>
  </div>
{:else}
  <div class="rounded-lg bg-surface p-6 border border-border">
    <h3 class="text-sm font-medium text-[#8b949e] uppercase tracking-wide mb-4">Today's Sessions</h3>

    {#if sessions.length === 0}
      <div class="text-[#8b949e] text-sm py-4 text-center">No sessions today</div>
    {:else}
      <!-- Time axis -->
      <div class="relative mb-2">
        <div class="flex justify-between text-[10px] text-[#8b949e]">
          {#each hourMarkers() as marker}
            <span style:position="absolute" style:left="{getPosition(marker.time)}%" class="-translate-x-1/2">
              {marker.label}
            </span>
          {/each}
        </div>
      </div>

      <!-- Timeline bar -->
      <div class="relative h-10 mt-6 bg-surface-raised rounded-md overflow-hidden">
        {#each sessions as session}
          {@const left = getPosition(session.startTime)}
          {@const width = getWidth(session)}
          {@const color = projectColorMap().get(session.project) ?? '#58a6ff'}
          <div
            class="absolute top-0 h-full rounded-sm transition-all duration-200 cursor-pointer flex items-center overflow-hidden group"
            style:left="{left}%"
            style:width="{width}%"
            style:background-color={color}
            style:opacity={hoveredSession === null || hoveredSession === session.id ? '0.85' : '0.35'}
            onmouseenter={() => { hoveredSession = session.id }}
            onmouseleave={() => { hoveredSession = null }}
          >
            {#if width > 8}
              <span class="text-[10px] text-white font-medium px-1.5 truncate drop-shadow-sm">
                {session.project}
              </span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Hover detail -->
      {#if hoveredSession}
        {@const session = sessions.find((s) => s.id === hoveredSession)}
        {#if session}
          <div class="mt-3 text-xs text-[#8b949e] flex gap-4">
            <span class="text-[#e6edf3] font-medium">{session.project}</span>
            <span>{formatTime(session.startTime)} - {session.endTime ? formatTime(session.endTime) : 'now'}</span>
            <span>{formatDuration(session.durationMs)}</span>
          </div>
        {/if}
      {/if}

      <!-- Legend -->
      <div class="flex flex-wrap gap-3 mt-4">
        {#each [...projectColorMap().entries()] as [project, color]}
          <div class="flex items-center gap-1.5 text-xs text-[#8b949e]">
            <div class="w-2.5 h-2.5 rounded-sm" style:background-color={color}></div>
            <span>{project}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
