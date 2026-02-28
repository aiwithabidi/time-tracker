import { eq, desc, and, sql } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { activityPulses } from '../schema'
import type * as schema from '../schema'
import type { ActivityPulse, NewActivityPulse } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

export function createPulseRepository(db: Db) {
  return {
    create(data: NewActivityPulse): ActivityPulse {
      const row = {
        ...data,
        id: data.id ?? crypto.randomUUID(),
      }
      db.insert(activityPulses).values(row).run()
      const result = db
        .select()
        .from(activityPulses)
        .where(eq(activityPulses.id, row.id))
        .get()
      if (!result) {
        throw new Error(`Failed to create pulse with id ${row.id}`)
      }
      return result
    },

    getLatestForSession(sessionId: string): ActivityPulse | undefined {
      return db
        .select()
        .from(activityPulses)
        .where(eq(activityPulses.sessionId, sessionId))
        .orderBy(desc(activityPulses.timestamp))
        .limit(1)
        .get()
    },

    getLatestForTerminal(terminalId: string): ActivityPulse | undefined {
      return db
        .select()
        .from(activityPulses)
        .where(eq(activityPulses.terminalId, terminalId))
        .orderBy(desc(activityPulses.timestamp))
        .limit(1)
        .get()
    },

    reassignPulses(fromSessionId: string, toSessionId: string, beforeTimestamp?: number): void {
      if (beforeTimestamp !== undefined) {
        db.update(activityPulses)
          .set({ sessionId: toSessionId })
          .where(
            and(
              eq(activityPulses.sessionId, fromSessionId),
              sql`${activityPulses.timestamp} < ${beforeTimestamp}`,
            ),
          )
          .run()
      } else {
        db.update(activityPulses)
          .set({ sessionId: toSessionId })
          .where(eq(activityPulses.sessionId, fromSessionId))
          .run()
      }
    },

    findBySessionId(sessionId: string): ActivityPulse[] {
      return db
        .select()
        .from(activityPulses)
        .where(eq(activityPulses.sessionId, sessionId))
        .all()
    },
  }
}
