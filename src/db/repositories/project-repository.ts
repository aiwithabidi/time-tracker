import { eq, and } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { projects } from '../schema'
import type * as schema from '../schema'
import type { Project, NewProject } from '../types'

type Db = BunSQLiteDatabase<typeof schema>

export function createProjectRepository(db: Db) {
  return {
    findById(id: string): Project | undefined {
      return db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.isDeleted, false)))
        .get()
    },

    findBySlug(slug: string): Project | undefined {
      const results = db
        .select()
        .from(projects)
        .where(and(eq(projects.slug, slug), eq(projects.isDeleted, false)))
        .all()
      return results[0]
    },

    findByDirectoryPath(dirPath: string): Project | undefined {
      const results = db
        .select()
        .from(projects)
        .where(and(eq(projects.directoryPath, dirPath), eq(projects.isDeleted, false)))
        .all()
      return results[0]
    },

    findAll(): Project[] {
      return db
        .select()
        .from(projects)
        .where(eq(projects.isDeleted, false))
        .all()
    },

    create(data: NewProject): Project {
      const now = Date.now()
      const row = {
        ...data,
        id: data.id ?? crypto.randomUUID(),
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      }
      db.insert(projects).values(row).run()
      const result = db
        .select()
        .from(projects)
        .where(eq(projects.id, row.id))
        .get()
      if (!result) {
        throw new Error(`Failed to create project with id ${row.id}`)
      }
      return result
    },

    update(id: string, data: Partial<Project>): Project {
      const now = Date.now()
      const { id: _id, ...updateData } = data
      db.update(projects)
        .set({ ...updateData, updatedAt: now })
        .where(eq(projects.id, id))
        .run()
      const result = db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .get()
      if (!result) {
        throw new Error(`Project not found: ${id}`)
      }
      return result
    },

    upsertFromDirectory(slug: string, dirPath: string, displayName: string): Project {
      const existing = db
        .select()
        .from(projects)
        .where(and(eq(projects.directoryPath, dirPath), eq(projects.isDeleted, false)))
        .get()

      if (existing) {
        return existing
      }

      const bySlug = db
        .select()
        .from(projects)
        .where(and(eq(projects.slug, slug), eq(projects.isDeleted, false)))
        .get()

      if (bySlug) {
        return bySlug
      }

      const now = Date.now()
      const row = {
        id: crypto.randomUUID(),
        slug,
        displayName,
        directoryPath: dirPath,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      }
      db.insert(projects).values(row).run()
      const result = db
        .select()
        .from(projects)
        .where(eq(projects.id, row.id))
        .get()
      if (!result) {
        throw new Error(`Failed to upsert project: ${slug}`)
      }
      return result
    },
  }
}
