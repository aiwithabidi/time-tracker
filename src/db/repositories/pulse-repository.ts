import { eq, desc } from 'drizzle-orm'
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
  }
}
