import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type {
  projects,
  sessions,
  sessionTerminals,
  sessionNotes,
  sessionTags,
  activityPulses,
} from './schema'

export type Project = InferSelectModel<typeof projects>
export type NewProject = InferInsertModel<typeof projects>

export type Session = InferSelectModel<typeof sessions>
export type NewSession = InferInsertModel<typeof sessions>

export type SessionTerminal = InferSelectModel<typeof sessionTerminals>
export type NewSessionTerminal = InferInsertModel<typeof sessionTerminals>

export type SessionNote = InferSelectModel<typeof sessionNotes>
export type NewSessionNote = InferInsertModel<typeof sessionNotes>

export type SessionTag = InferSelectModel<typeof sessionTags>
export type NewSessionTag = InferInsertModel<typeof sessionTags>

export type ActivityPulse = InferSelectModel<typeof activityPulses>
export type NewActivityPulse = InferInsertModel<typeof activityPulses>
