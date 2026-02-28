import { z } from 'zod'

export const projectAliasSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string(),
  clientName: z.string().optional(),
  hourlyRate: z.number().positive().optional(),
  currency: z.string().default('USD'),
})

export const configSchema = z.object({
  projects: z.record(z.string(), projectAliasSchema).default({}),
  defaults: z.object({
    currency: z.string().default('USD'),
  }).default({ currency: 'USD' }),
  idle: z.object({
    softIdleMinutes: z.number().min(1).default(8),
    hardIdleMinutes: z.number().min(1).default(20),
  }).default({ softIdleMinutes: 8, hardIdleMinutes: 20 }),
})

export type ProjectAlias = z.infer<typeof projectAliasSchema>
export type Config = z.infer<typeof configSchema>
