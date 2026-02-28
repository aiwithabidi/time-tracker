import type { Session, Project, SessionNote, SessionTag } from '../../db/types'

export interface GitCommitInfo {
  readonly hash: string
  readonly shortHash: string
  readonly author: string
  readonly date: number
  readonly message: string
  readonly repositoryPath: string
  readonly filesChanged?: number
  readonly insertions?: number
  readonly deletions?: number
}

export interface EnrichedSession {
  readonly session: Session
  readonly project: Project
  readonly durationMs: number
  readonly notes: readonly SessionNote[]
  readonly tags: readonly SessionTag[]
}

export interface GatheredData {
  readonly sessions: readonly EnrichedSession[]
  readonly gitCommits: readonly GitCommitInfo[]
  readonly periodStart: number
  readonly periodEnd: number
  readonly totalMs: number
  readonly projectSlug?: string
}

export interface SpreadDay {
  readonly date: string
  readonly dayOfWeek: string
  readonly hoursAllocated: number
  readonly commits: readonly GitCommitInfo[]
}

export interface SpreadResult {
  readonly days: readonly SpreadDay[]
  readonly totalHours: number
  readonly spreadDays: number
}

export type ReviewAudience = 'client' | 'developer' | 'email' | 'custom'
