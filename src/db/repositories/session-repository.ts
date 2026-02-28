import { eq, and, isNull, gte, lte, sql, desc } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { sessions, sessionTerminals } from '../schema'
import type * as schema from '../schema'
import type { Session, NewSession, SessionTerminal } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

export function createSessionRepository(db: Db) {
  return {
    findActiveByProject(projectId: string): Session | undefined {
      return db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.projectId, projectId),
            isNull(sessions.endTime),
            eq(sessions.isDeleted, false),
          ),
        )
        .get()
    },

    findActiveAll(): Session[] {
      return db
        .select()
        .from(sessions)
        .where(
          and(
            isNull(sessions.endTime),
            eq(sessions.isDeleted, false),
          ),
        )
        .all()
    },

    findById(id: string): Session | undefined {
      return db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.isDeleted, false)))
        .get()
    },

    findByDateRange(from: number, to: number, projectId?: string): Session[] {
      const conditions = [
        gte(sessions.startTime, from),
        lte(sessions.startTime, to),
        eq(sessions.isDeleted, false),
      ]
      if (projectId) {
        conditions.push(eq(sessions.projectId, projectId))
      }
      return db
        .select()
        .from(sessions)
        .where(and(...conditions))
        .all()
    },

    create(data: NewSession): Session {
      const now = Date.now()
      const row = {
        ...data,
        id: data.id ?? crypto.randomUUID(),
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      }
      db.insert(sessions).values(row).run()
      const result = db
        .select()
        .from(sessions)
        .where(eq(sessions.id, row.id))
        .get()
      if (!result) {
        throw new Error(`Failed to create session with id ${row.id}`)
      }
      return result
    },

    stop(id: string, endTime: number): Session {
      const now = Date.now()
      db.update(sessions)
        .set({ endTime, updatedAt: now })
        .where(eq(sessions.id, id))
        .run()
      const result = db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .get()
      if (!result) {
        throw new Error(`Session not found: ${id}`)
      }
      return result
    },

    softDelete(id: string): void {
      const now = Date.now()
      db.update(sessions)
        .set({ isDeleted: true, updatedAt: now })
        .where(eq(sessions.id, id))
        .run()
    },

    attachTerminal(sessionId: string, terminalId: string): void {
      const now = Date.now()
      const row = {
        id: crypto.randomUUID(),
        sessionId,
        terminalId,
        attachedAt: now,
      }
      db.insert(sessionTerminals).values(row).run()
    },

    getTerminals(sessionId: string): SessionTerminal[] {
      return db
        .select()
        .from(sessionTerminals)
        .where(eq(sessionTerminals.sessionId, sessionId))
        .all()
    },

    isTerminalAttached(sessionId: string, terminalId: string): boolean {
      const result = db
        .select()
        .from(sessionTerminals)
        .where(
          and(
            eq(sessionTerminals.sessionId, sessionId),
            eq(sessionTerminals.terminalId, terminalId),
            isNull(sessionTerminals.detachedAt),
          ),
        )
        .get()
      return result !== undefined
    },

    resumeFromIdle(id: string, deductionMs: number): Session {
      db.update(sessions)
        .set({
          idleDeductedMs: sql`${sessions.idleDeductedMs} + ${deductionMs}`,
          pausedAt: null,
          updatedAt: Date.now(),
        })
        .where(eq(sessions.id, id))
        .run()
      const result = db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .get()
      if (!result) {
        throw new Error(`Session not found: ${id}`)
      }
      return result
    },

    findLastCompleted(): Session | undefined {
      return db
        .select()
        .from(sessions)
        .where(
          and(
            sql`${sessions.endTime} IS NOT NULL`,
            eq(sessions.isDeleted, false),
          ),
        )
        .orderBy(sql`${sessions.endTime} DESC`)
        .limit(1)
        .get()
    },

    findByPrefix(prefix: string): Session {
      if (prefix.length < 6) {
        throw new Error('Session ID prefix must be at least 6 characters')
      }
      const rows = db
        .select()
        .from(sessions)
        .where(
          and(
            sql`${sessions.id} LIKE ${prefix + '%'}`,
            eq(sessions.isDeleted, false),
          ),
        )
        .all()
      if (rows.length === 0) {
        throw new Error(`SESSION_NOT_FOUND:${prefix}`)
      }
      if (rows.length > 1) {
        const candidates = rows.map(r => r.id.slice(0, 8)).join(', ')
        throw new Error(`AMBIGUOUS_ID:${prefix}:${candidates}`)
      }
      return rows[0]!
    },

    update(id: string, changes: Partial<Pick<Session, 'startTime' | 'endTime' | 'projectId' | 'source' | 'idleDeductedMs' | 'isDeleted'>>): Session {
      const now = Date.now()
      db.update(sessions)
        .set({ ...changes, updatedAt: now })
        .where(eq(sessions.id, id))
        .run()
      const result = db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .get()
      if (!result) {
        throw new Error(`Session not found: ${id}`)
      }
      return result
    },

    restore(session: Session): void {
      db.insert(sessions)
        .values(session)
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            projectId: session.projectId,
            startTime: session.startTime,
            endTime: session.endTime,
            timezone: session.timezone,
            source: session.source,
            rateAtTime: session.rateAtTime,
            pausedAt: session.pausedAt,
            idleDeductedMs: session.idleDeductedMs,
            isDeleted: session.isDeleted,
            updatedAt: Date.now(),
          },
        })
        .run()
    },

    hardDelete(id: string): void {
      db.delete(sessions).where(eq(sessions.id, id)).run()
    },

    setPausedAt(id: string, pausedAt: number | null): Session {
      db.update(sessions)
        .set({ pausedAt, updatedAt: Date.now() })
        .where(eq(sessions.id, id))
        .run()
      const result = db
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .get()
      if (!result) {
        throw new Error(`Session not found: ${id}`)
      }
      return result
    },
  }
}
