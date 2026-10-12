// probity.config.ts rewrites one rule of Probity's default TDD text by string
// replacement, and passes the defaults through unchanged when the text is gone.
// So a Probity upgrade that rewords that rule turns the override into a silent
// no-op, and the refusals it exists to stop come back. This pins the replaced
// text against the Probity version package.json pins.
//
// CI does not install Probity (see the hooks job), so it points
// PROBITY_PACKAGE at an `npm pack` of the pinned version; locally the
// repo's node_modules is read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROBITY =
  process.env.PROBITY_PACKAGE ?? resolve(ROOT, 'node_modules/@nizos/probity')

/** A template literal's text from source, unescaping only backticks. */
const literal = (source, pattern) => {
  const match = source.match(pattern)
  assert.ok(match, `no match for ${pattern}`)
  return match[1].replace(/\\`/g, '`')
}

test('the Probity rule text the override replaces is still in the pinned version', () => {
  const pinned = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    .devDependencies['@nizos/probity']
  const installed = JSON.parse(
    readFileSync(resolve(PROBITY, 'package.json'), 'utf8'),
  ).version
  assert.equal(installed, pinned, 'read the Probity version package.json pins')

  const defaults = literal(
    readFileSync(resolve(PROBITY, 'dist/rules/enforce-tdd.js'), 'utf8'),
    /const DEFAULT_TDD_RULES = `([\s\S]*?)`;\n/,
  )
  const loose = literal(
    readFileSync(resolve(ROOT, 'probity.config.ts'), 'utf8'),
    /loose: `([\s\S]*?)`,/,
  )

  assert.ok(
    defaults.includes(loose),
    'Probity no longer carries the rule text probity.config.ts replaces: if the ' +
      'upstream fix (nizos/probity#52) shipped, drop the override; otherwise ' +
      'update its `loose` text to the new wording',
  )
})
