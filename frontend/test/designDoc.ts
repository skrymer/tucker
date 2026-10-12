import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Anchored to this file rather than the working directory, which is not the
// project root under StrykerJS. Read off disk because a `?raw` stylesheet import
// resolves to the empty string under the Nuxt test environment.
const FRONTEND = resolve(import.meta.dirname, '..')

/** A file under `frontend/`, by its path from there. */
export function readFrontend(path: string): string {
  return readFileSync(resolve(FRONTEND, path), 'utf8')
}

/** DESIGN.md's section under [heading], up to the next heading at its level or above. */
export function designSection(heading: string): string {
  const level = heading.match(/^#+/)![0].length
  const body = readFrontend('DESIGN.md').split(`\n${heading}\n`)[1] ?? ''
  return body.split(new RegExp(`^#{1,${level}} `, 'm'))[0]!
}

/** A rem length in the px DESIGN.md writes: `1.5rem` → `24px`. */
export function remToPx(rem: string): string {
  return `${Number.parseFloat(rem) * 16}px`
}
