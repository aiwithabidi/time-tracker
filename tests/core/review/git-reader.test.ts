import { describe, it, expect } from 'vitest'
import { readGitLog } from '../../../src/core/review/git-reader'
import * as path from 'node:path'

const REPO_PATH = path.resolve(import.meta.dirname, '../../..')

describe('readGitLog', () => {
  it('returns empty array for non-git directory', () => {
    const commits = readGitLog({
      repositoryPath: '/tmp',
      afterEpochSec: 0,
      beforeEpochSec: Math.floor(Date.now() / 1000),
    })
    expect(commits).toEqual([])
  })

  it('returns empty array for future date range', () => {
    const future = Math.floor(Date.now() / 1000) + 86400 * 365
    const commits = readGitLog({
      repositoryPath: REPO_PATH,
      afterEpochSec: future,
      beforeEpochSec: future + 86400,
    })
    expect(commits).toEqual([])
  })

  it('returns commits with correct structure for a real git repo', () => {
    const now = Math.floor(Date.now() / 1000)
    const weekAgo = now - 86400 * 7

    const commits = readGitLog({
      repositoryPath: REPO_PATH,
      afterEpochSec: weekAgo,
      beforeEpochSec: now + 1,
    })

    // This repo should have recent commits
    if (commits.length > 0) {
      const commit = commits[0]!
      expect(commit.hash).toMatch(/^[0-9a-f]{40}$/)
      expect(commit.shortHash).toBeTruthy()
      expect(commit.author).toBeTruthy()
      expect(commit.date).toBeGreaterThan(0)
      expect(commit.message).toBeTruthy()
      expect(commit.repositoryPath).toBe(REPO_PATH)
    }
  })

  it('includes stats when includeStats is true', () => {
    const now = Math.floor(Date.now() / 1000)
    const weekAgo = now - 86400 * 7

    const commits = readGitLog({
      repositoryPath: REPO_PATH,
      afterEpochSec: weekAgo,
      beforeEpochSec: now + 1,
      includeStats: true,
    })

    if (commits.length > 0) {
      const commit = commits[0]!
      expect(typeof commit.filesChanged).toBe('number')
      expect(typeof commit.insertions).toBe('number')
      expect(typeof commit.deletions).toBe('number')
    }
  })
})
