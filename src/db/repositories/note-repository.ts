import { eq, asc } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { sessionNotes } from '../schema'
import type * as schema from '../schema'
import type { SessionNote } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

export function createNoteRepository(db: Db) {
  return {
    create(sessionId: string, content: string): SessionNote {
      const now = Date.now()
      const row = {
        id: crypto.randomUUID(),
        sessionId,
        content,
        createdAt: now,
      }
      db.insert(sessionNotes).values(row).run()
      const result = db
        .select()
        .from(sessionNotes)
        .where(eq(sessionNotes.id, row.id))
        .get()
      if (!result) {
        throw new Error(`Failed to create note with id ${row.id}`)
      }
      return result
    },

    findBySession(sessionId: string): SessionNote[] {
      return db
        .select()
        .from(sessionNotes)
        .where(eq(sessionNotes.sessionId, sessionId))
        .orderBy(asc(sessionNotes.createdAt))
        .all()
    },
  }
}
