import type { Repositories } from '../../db/repositories/index'
import type { Project, Review } from '../../db/types'
import { withTransaction } from '../../db/client'
import { readGitLog } from './git-reader'
import { DateTime } from 'luxon'
import type {
  GatheredData,
  EnrichedSession,
  GitCommitInfo,
  SpreadResult,
  SpreadDay,
} from './types'

interface ReviewServiceDeps {
  readonly repos: Repositories
}

function computeSessionDuration(session: { startTime: number; endTime: number | null; idleDeductedMs: number }): number {
  const end = session.endTime ?? Date.now()
  return Math.max(0, end - session.startTime - session.idleDeductedMs)
}

export function createReviewService(deps: ReviewServiceDeps) {
  const { repos } = deps

  function resolveProjectId(projectSlug?: string): { projectId?: string; project?: Project } {
    if (!projectSlug) return {}
    const project = repos.projects.findBySlug(projectSlug)
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`)
    }
    return { projectId: project.id, project }
  }

  function gatherSessions(from: number, to: number, projectId?: string): readonly EnrichedSession[] {
    const sessions = repos.sessions.findByDateRange(from, to, projectId)
    const projectMap = new Map<string, Project>()
    const allProjects = repos.projects.findAll()
    for (const p of allProjects) {
      projectMap.set(p.id, p)
    }

    const enriched: EnrichedSession[] = []
    for (const session of sessions) {
      const project = projectMap.get(session.projectId)
      if (!project) continue

      const notes = repos.notes.findBySessionId(session.id)
      const tags = repos.tags.findBySessionId(session.id)
      const durationMs = computeSessionDuration(session)

      enriched.push({ session, project, durationMs, notes, tags })
    }

    return enriched
  }

  function gatherGitCommits(
    from: number,
    to: number,
    projectId?: string,
  ): readonly GitCommitInfo[] {
    const projects = projectId
      ? [repos.projects.findAll().find(p => p.id === projectId)].filter(Boolean) as Project[]
      : repos.projects.findAll()

    const allCommits: GitCommitInfo[] = []

    for (const project of projects) {
      if (!project.directoryPath) continue

      const commits = readGitLog({
        repositoryPath: project.directoryPath,
        afterEpochSec: Math.floor(from / 1000),
        beforeEpochSec: Math.floor(to / 1000),
        includeStats: true,
      })

      allCommits.push(...commits)
    }

    return allCommits.sort((a, b) => a.date - b.date)
  }

  function spreadAcrossDays(data: GatheredData, numberOfDays: number): SpreadResult {
    const totalHours = data.totalMs / 3_600_000
    const hoursPerDay = totalHours / numberOfDays

    const startDt = DateTime.fromMillis(data.periodStart)
    const days: SpreadDay[] = []
    let currentDt = startDt.startOf('day')
    let daysAdded = 0

    while (daysAdded < numberOfDays) {
      const dayOfWeek = currentDt.weekday
      if (dayOfWeek <= 5) {
        days.push({
          date: currentDt.toISODate()!,
          dayOfWeek: currentDt.toFormat('cccc'),
          hoursAllocated: Math.round(hoursPerDay * 100) / 100,
          commits: [],
        })
        daysAdded++
      }
      currentDt = currentDt.plus({ days: 1 })
    }

    if (days.length > 0 && data.gitCommits.length > 0) {
      const commitsPerDay = Math.ceil(data.gitCommits.length / days.length)
      let commitIndex = 0

      for (let i = 0; i < days.length; i++) {
        const dayCommits: GitCommitInfo[] = []
        const end = Math.min(commitIndex + commitsPerDay, data.gitCommits.length)
        for (let j = commitIndex; j < end; j++) {
          dayCommits.push(data.gitCommits[j]!)
        }
        commitIndex = end
        days[i] = { ...days[i]!, commits: dayCommits }
      }
    }

    return { days, totalHours, spreadDays: numberOfDays }
  }

  return {
    gather(options: {
      readonly from: number
      readonly to: number
      readonly projectSlug?: string
      readonly spread?: number
    }): GatheredData & { spread?: SpreadResult } {
      const { projectId } = resolveProjectId(options.projectSlug)

      const sessions = gatherSessions(options.from, options.to, projectId)
      const gitCommits = gatherGitCommits(options.from, options.to, projectId)
      const totalMs = sessions.reduce((sum, s) => sum + s.durationMs, 0)

      const gathered: GatheredData = {
        sessions,
        gitCommits,
        periodStart: options.from,
        periodEnd: options.to,
        totalMs,
        projectSlug: options.projectSlug,
      }

      if (options.spread && options.spread > 0) {
        const spread = spreadAcrossDays(gathered, options.spread)
        return { ...gathered, spread }
      }

      return gathered
    },

    save(data: {
      readonly title: string
      readonly audience: string
      readonly content: string
      readonly gathered: GatheredData
      readonly spreadDays?: number
    }): Review {
      return withTransaction(() => {
        return repos.reviews.create({
          title: data.title,
          audience: data.audience,
          content: data.content,
          rawDataJson: JSON.stringify(data.gathered),
          periodStart: data.gathered.periodStart,
          periodEnd: data.gathered.periodEnd,
          totalMs: data.gathered.totalMs,
          spreadDays: data.spreadDays,
          projectId: data.gathered.projectSlug
            ? resolveProjectId(data.gathered.projectSlug).project?.id
            : undefined,
          sessionIds: data.gathered.sessions.map(s => s.session.id),
          gitCommits: data.gathered.gitCommits.map(c => ({
            hash: c.hash,
            shortHash: c.shortHash,
            author: c.author,
            date: c.date,
            message: c.message,
            repositoryPath: c.repositoryPath,
            filesChanged: c.filesChanged,
            insertions: c.insertions,
            deletions: c.deletions,
          })),
        })
      })
    },

    list(options?: { projectSlug?: string; limit?: number }): Review[] {
      const { projectId } = resolveProjectId(options?.projectSlug)
      return repos.reviews.findAll({ projectId, limit: options?.limit })
    },

    show(id: string): {
      review: Review
      sessionCount: number
      commitCount: number
    } | undefined {
      const review = repos.reviews.findById(id)
      if (!review) return undefined

      const sessions = repos.reviews.findSessionsByReviewId(id)
      const commits = repos.reviews.findGitCommitsByReviewId(id)

      return {
        review,
        sessionCount: sessions.length,
        commitCount: commits.length,
      }
    },

    delete(id: string): boolean {
      const review = repos.reviews.findById(id)
      if (!review) return false
      repos.reviews.softDelete(id)
      return true
    },
  }
}

export type ReviewService = ReturnType<typeof createReviewService>
