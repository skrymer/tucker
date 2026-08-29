import { defineConfig, enforceTdd } from '@nizos/probity'

/**
 * TDD enforcement, applied to the code and nowhere else.
 *
 * Tucker is built test-first and the rule was advisory until it was not followed:
 * a batch of tests written in one go left the OR-widening branch of
 * `ReferenceFoodRepository.search` pinned by nothing, which is exactly the failure
 * writing tests up front produces. This is the gate the prose was not.
 *
 * The `files` globs are a positive list on purpose. An exclusion list would have to
 * keep pace with every generated artefact the build learns to emit — the jOOQ
 * classes, `frontend/openapi/tucker.json`, `frontend/.nuxt` — and the first one it
 * missed would put a model call in front of a write nothing can drive test-first.
 * Naming the two source trees instead leaves docs, ADRs, SQL migrations and every
 * generated file outside the rule by construction.
 *
 * Kotlin and Vue have no deterministic fast path in probity (its language registry
 * is .ts/.tsx/.js/.py/.cs/.rb/.php), so every matching write is judged by the AI
 * validator. That is the intended behaviour here rather than a shortfall:
 * `fastPath` is off by default precisely so the green->red boundary stays checked,
 * which is where an unmade refactor gets caught.
 *
 * The validator judges "was there a genuine failing test?" from the session
 * transcript, so a test run has to reach it with its failure text intact. The rules
 * turn on the distinction between a clean red — an assertion failed, so
 * implementation is allowed — and a compile error, where only a stub is. Both
 * report `BUILD FAILED`, and only the detail below it tells them apart, so anything
 * that filters or truncates the agent's command output silently degrades every
 * verdict that follows.
 */
export default defineConfig({
  rules: [
    {
      files: [
        'backend/src/**/*.kt',
        'frontend/app/**/*.ts',
        'frontend/app/**/*.vue',
      ],
      rules: [
        enforceTdd({
          // Gradle and Vitest runs are verbose, and the evidence the validator
          // needs is the assertion line buried in them. The defaults (10 / 6000)
          // truncate a failing Gradle run before it reaches that line.
          maxEvents: 12,
          maxContentChars: 10000,
        }),
      ],
    },
  ],
})
