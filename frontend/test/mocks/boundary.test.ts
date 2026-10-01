import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')

/** Every source file the production build can reach, tests excluded. */
function shippedSources(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return walk(path)
      return /\.(ts|vue|mjs|js)$/.test(entry.name) &&
        !/\.(test|spec)\.ts$/.test(entry.name)
        ? [path]
        : []
    })
  return [
    ...walk(join(root, 'app')),
    ...walk(join(root, 'server')),
    join(root, 'nuxt.config.ts'),
  ]
}

describe('MSW stays out of what ships', () => {
  it('is imported by no app or server source', () => {
    const importing = shippedSources()
      .filter((file) =>
        /from ['"](msw|@msw\/|openapi-msw)|test\/mocks/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(root, file))

    expect(importing).toEqual([])
  })

  it('ships no MSW worker script, so the app keeps the only service worker', () => {
    expect(existsSync(join(root, 'public', 'mockServiceWorker.js'))).toBe(false)
  })
})
