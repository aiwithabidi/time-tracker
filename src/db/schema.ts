import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  clientName: text('client_name'),
  hourlyRate: real('hourly_rate'),
  currency: text('currency').default('USD'),
  gitRemoteUrl: text('git_remote_url'),
  directoryPath: text('directory_path'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  startTime: integer('start_time', { mode: 'number' }).notNull(),
  endTime: integer('end_time', { mode: 'number' }),
  timezone: text('timezone').notNull(),
  source: text('source').notNull(),
  rateAtTime: real('rate_at_time'),
  pausedAt: integer('paused_at', { mode: 'number' }),
  idleDeductedMs: integer('idle_deducted_ms').default(0).notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
}, (table) => [
  index('idx_sessions_project_start').on(table.projectId, table.startTime),
  index('idx_sessions_end_time').on(table.endTime),
])

export const sessionTerminals = sqliteTable('session_terminals', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  terminalId: text('terminal_id').notNull(),
  attachedAt: integer('attached_at', { mode: 'number' }).notNull(),
  detachedAt: integer('detached_at', { mode: 'number' }),
}, (table) => [
  index('idx_session_terminals_session_terminal').on(table.sessionId, table.terminalId),
])

export const sessionNotes = sqliteTable('session_notes', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const sessionTags = sqliteTable('session_tags', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  tag: text('tag').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (table) => [
  uniqueIndex('idx_session_tags_session_tag').on(table.sessionId, table.tag),
])

export const activityPulses = sqliteTable('activity_pulses', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  terminalId: text('terminal_id').notNull(),
  sourceType: text('source_type').notNull(),
  timestamp: integer('timestamp', { mode: 'number' }).notNull(),
}, (table) => [
  index('idx_activity_pulses_session_timestamp').on(table.sessionId, table.timestamp),
  index('idx_activity_pulses_terminal_timestamp').on(table.terminalId, table.timestamp),
])

export const undoLog = sqliteTable('undo_log', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  operation: text('operation').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  audience: text('audience').notNull(),
  content: text('content').notNull(),
  rawDataJson: text('raw_data_json').notNull(),
  periodStart: integer('period_start', { mode: 'number' }).notNull(),
  periodEnd: integer('period_end', { mode: 'number' }).notNull(),
  totalMs: integer('total_ms', { mode: 'number' }).notNull(),
  spreadDays: integer('spread_days', { mode: 'number' }),
  projectId: text('project_id').references(() => projects.id),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
}, (table) => [
  index('idx_reviews_period').on(table.periodStart, table.periodEnd),
])

export const reviewSessions = sqliteTable('review_sessions', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id),
  sessionId: text('session_id').notNull().references(() => sessions.id),
}, (table) => [
  uniqueIndex('idx_review_sessions_review_session').on(table.reviewId, table.sessionId),
])

export const reviewGitCommits = sqliteTable('review_git_commits', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id),
  hash: text('hash').notNull(),
  shortHash: text('short_hash').notNull(),
  author: text('author').notNull(),
  date: integer('date', { mode: 'number' }).notNull(),
  message: text('message').notNull(),
  repositoryPath: text('repository_path').notNull(),
  filesChanged: integer('files_changed', { mode: 'number' }),
  insertions: integer('insertions', { mode: 'number' }),
  deletions: integer('deletions', { mode: 'number' }),
}, (table) => [
  index('idx_review_git_commits_review').on(table.reviewId),
])
