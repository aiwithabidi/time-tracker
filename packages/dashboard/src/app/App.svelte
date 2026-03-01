<script lang="ts">
  import Overview from './components/Overview.svelte'
  import Heatmap from './components/Heatmap.svelte'
  import WeeklyChart from './components/WeeklyChart.svelte'
  import SessionTimeline from './components/SessionTimeline.svelte'
  import ProjectBreakdown from './components/ProjectBreakdown.svelte'
  import StreakCard from './components/StreakCard.svelte'

  const TABS = ['Overview', 'Heatmap', 'Weekly', 'Sessions', 'Projects'] as const
  type Tab = (typeof TABS)[number]

  let activeTab = $state<Tab>(getInitialTab())

  function getInitialTab(): Tab {
    const hash = window.location.hash.slice(1).toLowerCase()
    const match = TABS.find((t) => t.toLowerCase() === hash)
    return match ?? 'Overview'
  }

  function setTab(tab: Tab) {
    activeTab = tab
    window.location.hash = tab.toLowerCase()
  }

  // Listen for hash changes (browser back/forward)
  $effect(() => {
    function onHashChange() {
      const hash = window.location.hash.slice(1).toLowerCase()
      const match = TABS.find((t) => t.toLowerCase() === hash)
      if (match) activeTab = match
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  })
</script>

<div class="min-h-screen bg-[#0d1117] text-[#e6edf3]">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6">
    <!-- Header -->
    <header class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-3">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <h1 class="text-xl font-semibold tracking-tight">tt dashboard</h1>
      </div>
      <span class="text-xs text-[#8b949e]">Local analytics</span>
    </header>

    <!-- Tab navigation -->
    <nav class="flex gap-1 border-b border-border mb-6">
      {#each TABS as tab}
        <button
          onclick={() => setTab(tab)}
          class="px-4 py-2.5 text-sm font-medium transition-colors duration-200 relative
            {activeTab === tab
              ? 'text-[#e6edf3]'
              : 'text-[#8b949e] hover:text-[#e6edf3]'}"
        >
          {tab}
          {#if activeTab === tab}
            <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t"></span>
          {/if}
        </button>
      {/each}
    </nav>

    <!-- Tab content -->
    <main>
      {#if activeTab === 'Overview'}
        <Overview />
      {:else if activeTab === 'Heatmap'}
        <Heatmap />
      {:else if activeTab === 'Weekly'}
        <div class="space-y-4">
          <WeeklyChart />
        </div>
      {:else if activeTab === 'Sessions'}
        <SessionTimeline />
      {:else if activeTab === 'Projects'}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="lg:col-span-2">
            <ProjectBreakdown />
          </div>
          <div>
            <StreakCard />
          </div>
        </div>
      {/if}
    </main>
  </div>
</div>
