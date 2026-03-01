import type { Repositories } from '../../db/repositories/index'
import type { Session } from '../../db/types'
import {
  NoActiveSessionError,
  InvalidTagError,
  NothingToUndoError,
  InvalidTimeRangeError,
  InvalidSplitTimeError,
  MergeValidationError,
} from './errors'
import type {
  EditOptions,
  EditResult,
  UndoResult,
  SplitPreview,
  SplitResult,
  MergePreview,
  MergeResult,
} from './types'
import type { UndoSnapshot } from '../../db/repositories/undo-repository'
import { parseEditTime } from '../../cli/time-parsing'
import { withTransaction } from '../../db/client'
import {
  NOTE_MAX_LENGTH,
  KEBAB_CASE_PATTERN,
  resolveActiveSession,
  resolveSessionByPrefix,
  buildSnapshot,
} from './session-helpers'

interface EditServiceDeps {
  readonly repos: Repositories
}

export function createEditService(deps: EditServiceDeps) {
  const { repos } = deps

  function splitIdleDeducted(
    originalIdleMs: number,
    totalWallMs: number,
    wallAMs: number,
  ): { idleA: number; idleB: number } {
    if (totalWallMs === 0) return { idleA: 0, idleB: 0 }
    const idleA = Math.max(0, Math.round(originalIdleMs * (wallAMs / totalWallMs)))
    const idleB = Math.max(0, originalIdleMs - idleA)
    return { idleA, idleB }
  }

  function previewSplitInternal(sessionPrefix: string, splitTimeInput: string): SplitPreview {
    const session = resolveSessionByPrefix(repos, sessionPrefix)

    if (!session.endTime) {
      throw new InvalidTimeRangeError('Cannot split an active session. Stop it first.')
    }

    const splitMs = parseEditTime(splitTimeInput, session.startTime)

    if (splitMs <= session.startTime || splitMs >= session.endTime) {
      throw new InvalidSplitTimeError(splitMs, session.startTime, session.endTime)
    }

    const totalWall = session.endTime - session.startTime
    const wallA = splitMs - session.startTime
    const wallB = session.endTime - splitMs
    const { idleA, idleB } = splitIdleDeducted(session.idleDeductedMs, totalWall, wallA)

    return {
      original: session,
      sessionA: {
        startTime: session.startTime,
        endTime: splitMs,
        durationMs: Math.max(0, wallA - idleA),
        idleDeductedMs: idleA,
      },
      sessionB: {
        startTime: splitMs,
        endTime: session.endTime,
        durationMs: Math.max(0, wallB - idleB),
        idleDeductedMs: idleB,
      },
    }
  }

  function previewMergeInternal(prefixA: string, prefixB: string): MergePreview {
    const sessionA = resolveSessionByPrefix(repos, prefixA)
    const sessionB = resolveSessionByPrefix(repos, prefixB)

    if (!sessionA.endTime) {
      throw new MergeValidationError(`Session ${prefixA} is still active. Stop it first.`)
    }
    if (!sessionB.endTime) {
      throw new MergeValidationError(`Session ${prefixB} is still active. Stop it first.`)
    }

    if (sessionA.projectId !== sessionB.projectId) {
      throw new MergeValidationError(
        'Sessions belong to different projects. Reassign with "tt edit <id> --project <slug>" first.'
      )
    }

    const [earlier, later] = sessionA.startTime <= sessionB.startTime
      ? [sessionA, sessionB]
      : [sessionB, sessionA]

    const gapMs = Math.max(0, later.startTime - earlier.endTime!)

    const FORCE_GAP_THRESHOLD_MS = 60 * 60 * 1000
    const requiresForce = gapMs > FORCE_GAP_THRESHOLD_MS

    const mergedIdleMs = earlier.idleDeductedMs + later.idleDeductedMs + gapMs
    const mergedStartTime = earlier.startTime
    const mergedEndTime = later.endTime!
    const mergedDurationMs = Math.max(0, mergedEndTime - mergedStartTime - mergedIdleMs)

    return {
      earlier,
      later,
      gapMs,
      merged: {
        startTime: mergedStartTime,
        endTime: mergedEndTime,
        durationMs: mergedDurationMs,
        idleDeductedMs: mergedIdleMs,
      },
      requiresForce,
    }
  }

  return {
    addNote(cwd: string, content: string): { session: Session; note: ReturnType<Repositories['notes']['create']> } {
      if (content.length > NOTE_MAX_LENGTH) {
        throw new Error('Note exceeds 10,000 character limit')
      }

      const resolved = resolveActiveSession(repos, cwd)
      if (!resolved) {
        throw new NoActiveSessionError("Start a session first with: tt start")
      }

      const note = repos.notes.create(resolved.session.id, content)
      return { session: resolved.session, note }
    },

    addTag(cwd: string, tag: string): { session: Session; tag: ReturnType<Repositories['tags']['addTag']> } {
      if (!KEBAB_CASE_PATTERN.test(tag)) {
        throw new InvalidTagError(tag)
      }

      const resolved = resolveActiveSession(repos, cwd)
      if (!resolved) {
        throw new NoActiveSessionError("Start a session first with: tt start")
      }

      const addedTag = repos.tags.addTag(resolved.session.id, tag)
      return { session: resolved.session, tag: addedTag }
    },

    removeTag(cwd: string, tag: string): void {
      const resolved = resolveActiveSession(repos, cwd)
      if (!resolved) {
        throw new NoActiveSessionError("Start a session first with: tt start")
      }

      repos.tags.removeTag(resolved.session.id, tag)
    },

    edit(sessionPrefix: string, options: EditOptions): EditResult {
      const session = resolveSessionByPrefix(repos, sessionPrefix)
      const changes: string[] = []

      return withTransaction(() => {
        // Snapshot before editing
        const snapshot = buildSnapshot(repos, [session.id])
        repos.undo.push('edit', snapshot)

        let newStartTime = session.startTime
        let newEndTime = session.endTime

        // Parse --start
        if (options.start) {
          newStartTime = parseEditTime(options.start, session.startTime)
          changes.push(`start: ${new Date(session.startTime).toISOString()} -> ${new Date(newStartTime).toISOString()}`)
        }

        // Parse --end
        if (options.end) {
          if (!session.endTime) {
            throw new InvalidTimeRangeError('Cannot edit end time of an active session. Stop it first.')
          }
          newEndTime = parseEditTime(options.end, session.startTime)
          changes.push(`end: ${new Date(session.endTime).toISOString()} -> ${new Date(newEndTime!).toISOString()}`)
        }

        // Validate time range
        if (newEndTime !== null && newEndTime !== undefined && newStartTime >= newEndTime) {
          throw new InvalidTimeRangeError(`start (${new Date(newStartTime).toISOString()}) must be before end (${new Date(newEndTime).toISOString()})`)
        }

        // Apply time changes
        const timeChanges: Record<string, unknown> = {}
        if (options.start) timeChanges['startTime'] = newStartTime
        if (options.end) timeChanges['endTime'] = newEndTime

        // Parse --project
        if (options.project) {
          const newProject = repos.projects.findBySlug(options.project)
          if (!newProject) {
            throw new Error(`Project "${options.project}" not found`)
          }
          timeChanges['projectId'] = newProject.id
          changes.push(`project: -> ${options.project}`)
        }

        if (Object.keys(timeChanges).length > 0) {
          repos.sessions.update(session.id, timeChanges as Partial<Pick<Session, 'startTime' | 'endTime' | 'projectId'>>)
        }

        // Add note
        if (options.note) {
          if (options.note.length > NOTE_MAX_LENGTH) {
            throw new Error('Note exceeds 10,000 character limit')
          }
          repos.notes.create(session.id, options.note)
          changes.push(`note: added "${options.note}"`)
        }

        // Add tag
        if (options.tag) {
          repos.tags.addTag(session.id, options.tag)
          changes.push(`tag: added "${options.tag}"`)
        }

        // Remove tag
        if (options.untag) {
          repos.tags.removeTag(session.id, options.untag)
          changes.push(`tag: removed "${options.untag}"`)
        }

        const updated = repos.sessions.findById(session.id)!
        return { session: updated, changes }
      })
    },

    undo(): UndoResult {
      return withTransaction(() => {
        const entry = repos.undo.pop()
        if (!entry) throw new NothingToUndoError()

        const restoredSessionIds: string[] = []

        // Restore sessions
        for (const session of entry.snapshot.sessions) {
          repos.sessions.restore(session)
          restoredSessionIds.push(session.id)
        }

        // Restore notes: delete current notes for these sessions, re-insert snapshot
        for (const session of entry.snapshot.sessions) {
          repos.notes.deleteBySessionId(session.id)
        }
        for (const note of entry.snapshot.notes) {
          repos.notes.restoreNote(note)
        }

        // Restore tags: delete current tags for these sessions, re-insert snapshot
        for (const session of entry.snapshot.sessions) {
          repos.tags.deleteBySessionId(session.id)
        }
        for (const tag of entry.snapshot.tags) {
          repos.tags.restoreTag(tag)
        }

        // Hard-delete sessions created by the undone operation
        for (const id of entry.snapshot.deletedSessionIds ?? []) {
          repos.sessions.hardDelete(id)
        }

        return { operation: entry.operation, restoredSessionIds }
      })
    },

    previewSplit(sessionPrefix: string, splitTimeInput: string): SplitPreview {
      return previewSplitInternal(sessionPrefix, splitTimeInput)
    },

    split(sessionPrefix: string, splitTimeInput: string): SplitResult {
      const preview = previewSplitInternal(sessionPrefix, splitTimeInput)
      const session = preview.original

      return withTransaction(() => {
        const snapshot = buildSnapshot(repos, [session.id])

        const idA = crypto.randomUUID()
        const idB = crypto.randomUUID()

        const snapshotWithDeleted: UndoSnapshot = {
          ...snapshot,
          deletedSessionIds: [idA, idB],
        }
        repos.undo.push('split', snapshotWithDeleted)

        repos.sessions.softDelete(session.id)

        const now = Date.now()
        const sessionA = repos.sessions.create({
          id: idA,
          projectId: session.projectId,
          startTime: preview.sessionA.startTime,
          endTime: preview.sessionA.endTime,
          timezone: session.timezone,
          source: session.source,
          rateAtTime: session.rateAtTime,
          idleDeductedMs: preview.sessionA.idleDeductedMs,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })

        const sessionB = repos.sessions.create({
          id: idB,
          projectId: session.projectId,
          startTime: preview.sessionB.startTime,
          endTime: preview.sessionB.endTime,
          timezone: session.timezone,
          source: session.source,
          rateAtTime: session.rateAtTime,
          idleDeductedMs: preview.sessionB.idleDeductedMs,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })

        const notes = repos.notes.findBySessionId(session.id)
        const tags = repos.tags.findBySessionId(session.id)

        for (const note of notes) {
          repos.notes.create(sessionA.id, note.content)
          repos.notes.create(sessionB.id, note.content)
        }

        for (const tag of tags) {
          repos.tags.addTag(sessionA.id, tag.tag)
          repos.tags.addTag(sessionB.id, tag.tag)
        }

        const splitMs = preview.sessionA.endTime
        repos.pulses.reassignPulses(session.id, idA, splitMs)
        repos.pulses.reassignPulses(session.id, idB)

        return { sessionA, sessionB, originalId: session.id }
      })
    },

    previewMerge(prefixA: string, prefixB: string): MergePreview {
      return previewMergeInternal(prefixA, prefixB)
    },

    merge(prefixA: string, prefixB: string, force: boolean = false): MergeResult {
      const preview = previewMergeInternal(prefixA, prefixB)

      if (preview.requiresForce && !force) {
        throw new MergeValidationError(
          `Gap between sessions is ${Math.round(preview.gapMs / 60000)} minutes (> 60 min threshold). Use --force to proceed.`
        )
      }

      const { earlier, later } = preview

      return withTransaction(() => {
        const snapshotEarlier = buildSnapshot(repos, [earlier.id])
        const snapshotLater = buildSnapshot(repos, [later.id])

        const mergedId = crypto.randomUUID()

        const combinedSnapshot: UndoSnapshot = {
          sessions: [...snapshotEarlier.sessions, ...snapshotLater.sessions],
          notes: [...snapshotEarlier.notes, ...snapshotLater.notes],
          tags: [...snapshotEarlier.tags, ...snapshotLater.tags],
          deletedSessionIds: [mergedId],
        }
        repos.undo.push('merge', combinedSnapshot)

        repos.sessions.softDelete(earlier.id)
        repos.sessions.softDelete(later.id)

        const now = Date.now()
        const merged = repos.sessions.create({
          id: mergedId,
          projectId: earlier.projectId,
          startTime: preview.merged.startTime,
          endTime: preview.merged.endTime,
          timezone: earlier.timezone,
          source: 'merged',
          rateAtTime: earlier.rateAtTime,
          idleDeductedMs: preview.merged.idleDeductedMs,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })

        const earlierNotes = repos.notes.findBySessionId(earlier.id)
        const laterNotes = repos.notes.findBySessionId(later.id)
        for (const note of [...earlierNotes, ...laterNotes]) {
          repos.notes.create(merged.id, note.content)
        }

        const earlierTags = repos.tags.findBySessionId(earlier.id)
        const laterTags = repos.tags.findBySessionId(later.id)
        const allTagNames = new Set([...earlierTags.map(t => t.tag), ...laterTags.map(t => t.tag)])
        for (const tagName of allTagNames) {
          repos.tags.addTag(merged.id, tagName)
        }

        repos.pulses.reassignPulses(earlier.id, mergedId)
        repos.pulses.reassignPulses(later.id, mergedId)

        return { merged, removedIds: [earlier.id, later.id] }
      })
    },
  }
}

export type EditService = ReturnType<typeof createEditService>
