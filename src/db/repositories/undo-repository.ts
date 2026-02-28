import { eq, sql, desc } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { undoLog } from '../schema'
import type * as schema from '../schema'
import type { Session, SessionNote, SessionTag } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

export interface UndoSnapshot {
  readonly sessions: Session[]
  readonly notes: SessionNote[]
  readonly tags: SessionTag[]
  readonly deletedSessionIds?: string[]
}

export function createUndoRepository(db: Db) {
  return {
    push(operation: string, snapshot: UndoSnapshot): void {
      const now = Date.now()
      db.insert(undoLog)
        .values({ operation, snapshot: JSON.stringify(snapshot), createdAt: now })
        .run()

      // Trim log to last 20 entries to prevent unbounded growth
      db.run(sql`
        DELETE FROM undo_log
        WHERE id NOT IN (SELECT id FROM undo_log ORDER BY id DESC LIMIT 20)
      `)
    },

    pop(): { operation: string; snapshot: UndoSnapshot } | undefined {
      const row = db.select().from(undoLog).orderBy(desc(undoLog.id)).limit(1).get()
      if (!row) return undefined
      db.delete(undoLog).where(eq(undoLog.id, row.id)).run()
      return { operation: row.operation, snapshot: JSON.parse(row.snapshot) as UndoSnapshot }
    },
  }
}
