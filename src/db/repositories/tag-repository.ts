import { eq, and } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { sessionTags } from '../schema'
import type * as schema from '../schema'
import type { SessionTag } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateTag(tag: string): void {
  if (!KEBAB_CASE_PATTERN.test(tag)) {
    throw new Error(
      `Invalid tag "${tag}": tags must be single-word kebab-case (e.g. "bug-fix", "feature")`,
    )
  }
}

export function createTagRepository(db: Db) {
  return {
    addTag(sessionId: string, tag: string): SessionTag {
      validateTag(tag)

      const existing = db
        .select()
        .from(sessionTags)
        .where(and(eq(sessionTags.sessionId, sessionId), eq(sessionTags.tag, tag)))
        .get()

      if (existing) {
        return existing
      }

      const now = Date.now()
      const row = {
        id: crypto.randomUUID(),
        sessionId,
        tag,
        createdAt: now,
      }
      db.insert(sessionTags).values(row).run()
      const result = db
        .select()
        .from(sessionTags)
        .where(eq(sessionTags.id, row.id))
        .get()
      if (!result) {
        throw new Error(`Failed to create tag with id ${row.id}`)
      }
      return result
    },

    removeTag(sessionId: string, tag: string): void {
      db.delete(sessionTags)
        .where(and(eq(sessionTags.sessionId, sessionId), eq(sessionTags.tag, tag)))
        .run()
    },

    findBySession(sessionId: string): SessionTag[] {
      return db
        .select()
        .from(sessionTags)
        .where(eq(sessionTags.sessionId, sessionId))
        .all()
    },
  }
}
