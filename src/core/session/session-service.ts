import type { Repositories } from '../../db/repositories/index'
import { createPulseService } from './pulse-service'
import { createLifecycleService } from './lifecycle-service'
import { createEditService } from './edit-service'

interface SessionServiceDeps {
  readonly repos: Repositories
}

/**
 * Facade that composes pulse, lifecycle, and edit services
 * into a single SessionService interface for backward compatibility.
 */
export function createSessionService(deps: SessionServiceDeps) {
  const { repos } = deps

  const pulseService = createPulseService({ repos })
  const lifecycleService = createLifecycleService({ repos, pulseService })
  const editService = createEditService({ repos })

  return {
    // Lifecycle
    start: lifecycleService.start,
    stop: lifecycleService.stop,
    now: lifecycleService.now,
    away: lifecycleService.away,
    back: lifecycleService.back,

    // Pulse
    pulse: pulseService.pulse,

    // Edit operations
    addNote: editService.addNote,
    addTag: editService.addTag,
    removeTag: editService.removeTag,
    edit: editService.edit,
    undo: editService.undo,
    previewSplit: editService.previewSplit,
    split: editService.split,
    previewMerge: editService.previewMerge,
    merge: editService.merge,
  }
}

export type SessionService = ReturnType<typeof createSessionService>
