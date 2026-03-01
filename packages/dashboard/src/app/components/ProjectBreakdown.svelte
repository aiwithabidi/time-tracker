<script lang="ts">
  import { api, type ProjectData } from '../lib/api'
  import { formatDuration } from '../lib/format'

  let projects = $state<readonly ProjectData[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let sortKey = $state<'weekTotalMs' | 'sessionCount' | 'displayName'>('weekTotalMs')
  let sortAsc = $state(false)

  let maxWeekMs = $derived(
    projects.length > 0
      ? Math.max(...projects.map((p) => p.weekTotalMs))
      : 0
  )

  let sorted = $derived(() => {
    const list = [...projects]
    list.sort((a, b) => {
      let cmp: number
      if (sortKey === 'displayName') {
        cmp = a.displayName.localeCompare(b.displayName)
      } else {
        cmp = a[sortKey] - b[sortKey]
      }
      return sortAsc ? cmp : -cmp
    })
    return list
  })

  $effect(() => {
    fetchData()
  })

  async function fetchData() {
    try {
      projects = await api.projects()
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load projects'
    } finally {
      loading = false
    }
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      sortAsc = !sortAsc
    } else {
      sortKey = key
      sortAsc = false
    }
  }

  function sortIndicator(key: typeof sortKey): string {
    if (sortKey !== key) return ''
    return sortAsc ? ' ↑' : ' ↓'
  }

  function avgSessionMs(project: ProjectData): number {
    if (project.sessionCount === 0) return 0
    return project.weekTotalMs / project.sessionCount
  }
</script>

{#if loading}
  <div class="rounded-lg bg-surface border border-border p-6 animate-pulse">
    <div class="h-5 w-40 bg-surface-raised rounded mb-4"></div>
    {#each Array(4) as _}
      <div class="h-10 w-full bg-surface-raised rounded mb-2"></div>
    {/each}
  </div>
{:else if error}
  <div class="rounded-lg bg-surface border border-border p-6">
    <p class="text-warning text-sm">{error}</p>
    <button onclick={fetchData} class="text-accent text-sm mt-2 hover:underline">Retry</button>
  </div>
{:else}
  <div class="rounded-lg bg-surface border border-border overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-[#8b949e] text-xs uppercase tracking-wide">
          <th class="text-left px-4 py-3 font-medium cursor-pointer hover:text-[#e6edf3] transition-colors duration-200" onclick={() => toggleSort('displayName')}>
            Project{sortIndicator('displayName')}
          </th>
          <th class="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#e6edf3] transition-colors duration-200" onclick={() => toggleSort('weekTotalMs')}>
            This Week{sortIndicator('weekTotalMs')}
          </th>
          <th class="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#e6edf3] transition-colors duration-200" onclick={() => toggleSort('sessionCount')}>
            Sessions{sortIndicator('sessionCount')}
          </th>
          <th class="text-right px-4 py-3 font-medium hidden sm:table-cell">Avg Session</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted() as project, i}
          <tr class="border-b border-border last:border-0 transition-colors duration-200 hover:bg-surface-raised relative group">
            <!-- Background bar showing proportion -->
            {#if maxWeekMs > 0}
              <td colspan="4" class="absolute inset-0 pointer-events-none p-0">
                <div
                  class="h-full bg-accent/[0.06] transition-all duration-300"
                  style:width="{(project.weekTotalMs / maxWeekMs) * 100}%"
                ></div>
              </td>
            {/if}
            <td class="px-4 py-3 font-medium text-[#e6edf3] relative">{project.displayName}</td>
            <td class="px-4 py-3 text-right text-[#e6edf3] relative">{formatDuration(project.weekTotalMs)}</td>
            <td class="px-4 py-3 text-right text-[#8b949e] relative">{project.sessionCount}</td>
            <td class="px-4 py-3 text-right text-[#8b949e] relative hidden sm:table-cell">{formatDuration(avgSessionMs(project))}</td>
          </tr>
        {/each}
        {#if projects.length === 0}
          <tr>
            <td colspan="4" class="px-4 py-8 text-center text-[#8b949e]">No projects tracked yet</td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
{/if}
