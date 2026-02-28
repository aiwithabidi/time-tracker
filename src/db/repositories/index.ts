import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type * as schema from '../schema'
import { createProjectRepository } from './project-repository'
import { createSessionRepository } from './session-repository'
import { createPulseRepository } from './pulse-repository'
import { createNoteRepository } from './note-repository'
import { createTagRepository } from './tag-repository'
import { createUndoRepository } from './undo-repository'
import { createReviewRepository } from './review-repository'

type Db = BunSQLiteDatabase<typeof schema>

export function createRepositories(db: Db) {
  return {
    projects: createProjectRepository(db),
    sessions: createSessionRepository(db),
    pulses: createPulseRepository(db),
    notes: createNoteRepository(db),
    tags: createTagRepository(db),
    undo: createUndoRepository(db),
    reviews: createReviewRepository(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>
