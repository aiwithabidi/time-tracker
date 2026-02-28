import { eq, and, desc, gte, lte } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { reviews, reviewSessions, reviewGitCommits } from '../schema'
import type * as schema from '../schema'
import type { Review, ReviewSession, ReviewGitCommit } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

export interface CreateReviewData {
  readonly title: string
  readonly audience: string
  readonly content: string
  readonly rawDataJson: string
  readonly periodStart: number
  readonly periodEnd: number
  readonly totalMs: number
  readonly spreadDays?: number
  readonly projectId?: string
  readonly sessionIds: readonly string[]
  readonly gitCommits: readonly {
    readonly hash: string
    readonly shortHash: string
    readonly author: string
    readonly date: number
    readonly message: string
    readonly repositoryPath: string
    readonly filesChanged?: number
    readonly insertions?: number
    readonly deletions?: number
  }[]
}

export function createReviewRepository(db: Db) {
  return {
    create(data: CreateReviewData): Review {
      const now = Date.now()
      const id = crypto.randomUUID()

      db.insert(reviews).values({
        id,
        title: data.title,
        audience: data.audience,
        content: data.content,
        rawDataJson: data.rawDataJson,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        totalMs: data.totalMs,
        spreadDays: data.spreadDays ?? null,
        projectId: data.projectId ?? null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      }).run()

      for (const sessionId of data.sessionIds) {
        db.insert(reviewSessions).values({
          id: crypto.randomUUID(),
          reviewId: id,
          sessionId,
        }).run()
      }

      for (const commit of data.gitCommits) {
        db.insert(reviewGitCommits).values({
          id: crypto.randomUUID(),
          reviewId: id,
          hash: commit.hash,
          shortHash: commit.shortHash,
          author: commit.author,
          date: commit.date,
          message: commit.message,
          repositoryPath: commit.repositoryPath,
          filesChanged: commit.filesChanged ?? null,
          insertions: commit.insertions ?? null,
          deletions: commit.deletions ?? null,
        }).run()
      }

      const result = db
        .select()
        .from(reviews)
        .where(eq(reviews.id, id))
        .get()
      if (!result) {
        throw new Error(`Failed to create review with id ${id}`)
      }
      return result
    },

    findById(id: string): Review | undefined {
      return db
        .select()
        .from(reviews)
        .where(and(eq(reviews.id, id), eq(reviews.isDeleted, false)))
        .get()
    },

    findAll(options?: { projectId?: string; limit?: number }): Review[] {
      const conditions = [eq(reviews.isDeleted, false)]
      if (options?.projectId) {
        conditions.push(eq(reviews.projectId, options.projectId))
      }
      const query = db
        .select()
        .from(reviews)
        .where(and(...conditions))
        .orderBy(desc(reviews.createdAt))
      if (options?.limit) {
        return query.limit(options.limit).all()
      }
      return query.all()
    },

    findByDateRange(from: number, to: number, projectId?: string): Review[] {
      const conditions = [
        gte(reviews.periodStart, from),
        lte(reviews.periodEnd, to),
        eq(reviews.isDeleted, false),
      ]
      if (projectId) {
        conditions.push(eq(reviews.projectId, projectId))
      }
      return db
        .select()
        .from(reviews)
        .where(and(...conditions))
        .orderBy(desc(reviews.createdAt))
        .all()
    },

    findSessionsByReviewId(reviewId: string): ReviewSession[] {
      return db
        .select()
        .from(reviewSessions)
        .where(eq(reviewSessions.reviewId, reviewId))
        .all()
    },

    findGitCommitsByReviewId(reviewId: string): ReviewGitCommit[] {
      return db
        .select()
        .from(reviewGitCommits)
        .where(eq(reviewGitCommits.reviewId, reviewId))
        .all()
    },

    softDelete(id: string): void {
      db.update(reviews)
        .set({ isDeleted: true, updatedAt: Date.now() })
        .where(eq(reviews.id, id))
        .run()
    },
  }
}
