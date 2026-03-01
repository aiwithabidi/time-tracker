const BASE_URL = window.location.origin

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export interface NowData {
  readonly active: boolean
  readonly project: string | null
  readonly durationMs: number
  readonly todayTotalMs: number
  readonly idleState: string | null
  readonly goalMinutes?: number
  readonly goalPercent?: number
}

export interface TodayProject {
  readonly slug: string
  readonly displayName: string
  readonly totalMs: number
  readonly sessionCount: number
}

export interface TodayData {
  readonly projects: readonly TodayProject[]
  readonly grandTotalMs: number
  readonly activeSession: {
    readonly project: string
    readonly durationMs: number
  } | null
}

export interface WeekDay {
  readonly date: string
  readonly projects: Record<string, number>
  readonly totalMs: number
}

export interface WeekData {
  readonly days: readonly WeekDay[]
  readonly grandTotalMs: number
}

export interface SessionData {
  readonly id: string
  readonly project: string
  readonly startTime: number
  readonly endTime: number | null
  readonly durationMs: number
}

export interface ProjectData {
  readonly slug: string
  readonly displayName: string
  readonly weekTotalMs: number
  readonly allTimeTotalMs: number
  readonly sessionCount: number
}

export interface StreakData {
  readonly current: number
  readonly best: number
  readonly avgDailyMinutes: number
  readonly goalMinutes?: number
}

export interface HeatmapDay {
  readonly date: string
  readonly minutes: number
  readonly metGoal: boolean
}

export const api = {
  now: () => fetchJson<NowData>('/api/now'),
  today: () => fetchJson<TodayData>('/api/today'),
  week: (project?: string) =>
    fetchJson<WeekData>(`/api/week${project ? `?project=${project}` : ''}`),
  sessions: (from?: string, to?: string, project?: string) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (project) params.set('project', project)
    const qs = params.toString()
    return fetchJson<readonly SessionData[]>(`/api/sessions${qs ? `?${qs}` : ''}`)
  },
  projects: () => fetchJson<readonly ProjectData[]>('/api/projects'),
  streak: () => fetchJson<StreakData>('/api/streak'),
  heatmap: (year?: number) =>
    fetchJson<readonly HeatmapDay[]>(`/api/heatmap${year ? `?year=${year}` : ''}`),
}
