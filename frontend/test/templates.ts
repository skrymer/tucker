import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Anchored to this file rather than the working directory, which is not the
// project root under StrykerJS.
const APP = resolve(import.meta.dirname, '../app')

function sfcs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return sfcs(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Every element in the app's templates with a static class. */
export function classedElements(): {
  site: string
  tag: string
  classes: string[]
}[] {
  return appTemplates().flatMap(({ file, source }) => {
    return [
      ...source.matchAll(/<([a-zA-Z][\w-]*)\s[^>]*?\bclass="([^"]*)"/g),
    ].map(([, tag, classList]) => {
      const classes = classList!.split(/\s+/).filter(Boolean)
      return {
        site: `${file}: <${tag}> ${classes.join(' ')}`,
        tag: tag!,
        classes,
      }
    })
  })
}

/** Every single-file component under `app/`, as its path relative to `app/` and its source. */
export function appTemplates(): { file: string; source: string }[] {
  return sfcs(APP).map((path) => ({
    file: path.slice(APP.length + 1),
    source: readFileSync(path, 'utf8'),
  }))
}
