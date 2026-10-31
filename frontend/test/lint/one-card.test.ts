import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// `tucker/one-card` in `eslint.config.mjs`, run against the real config: a
// content card is built from ContentCard, never a bare UCard (DESIGN.md →
// Content card).

const eslint = new ESLint({ cwd: join(__dirname, '..', '..') })

/** What the rule reports for [template] linted as if it lived at [filePath]. */
async function refusals(template: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(
    `<template>\n  ${template}\n</template>\n`,
    { filePath },
  )
  const fatal = result!.messages.find((message) => message.fatal)
  if (fatal) throw new Error(`the sample does not parse: ${fatal.message}`)
  return result!.messages
    .filter((message) => message.ruleId === 'vue/no-restricted-syntax')
    .map((message) => message.message)
}

describe('a bare UCard outside ContentCard is refused', () => {
  it.each([
    '<UCard>Body</UCard>',
    '<u-card>Body</u-card>',
    '<LazyUCard>Body</LazyUCard>',
    '<lazy-u-card>Body</lazy-u-card>',
    '<UCard />',
  ])('%s', async (template) => {
    expect(await refusals(template, 'app/components/LintFixture.vue')).toEqual([
      expect.stringContaining('DESIGN.md → Content card'),
    ])
  })
})

// Both bans configure vue/no-restricted-syntax, and a later flat-config block's
// options replace an earlier one's rather than adding to them.
describe('the one-calendar ban still holds beside it', () => {
  it.each([
    'app/components/LintFixture.vue',
    'app/components/GoalCard.vue',
    'app/components/ContentCard.vue',
  ])('in %s', async (filePath) => {
    expect(await refusals('<UCalendar />', filePath)).toEqual([
      expect.stringContaining('Use AppCalendar'),
    ])
  })

  it('and AppCalendar, the one calendar, still may not hold a bare UCard', async () => {
    expect(
      await refusals('<UCard>Body</UCard>', 'app/components/AppCalendar.vue'),
    ).toEqual([expect.stringContaining('DESIGN.md → Content card')])
  })
})

describe('what stays legal', () => {
  it('a UCard inside ContentCard itself', async () => {
    expect(
      await refusals('<UCard>Body</UCard>', 'app/components/ContentCard.vue'),
    ).toEqual([])
  })

  it('a ContentCard anywhere', async () => {
    expect(
      await refusals(
        '<ContentCard subject="goal" title="Goal">Body</ContentCard>',
        'app/components/LintFixture.vue',
      ),
    ).toEqual([])
  })

  it('a component whose name only ends in Card', async () => {
    expect(
      await refusals('<GoalCard />', 'app/components/LintFixture.vue'),
    ).toEqual([])
  })

  it('a UCard in a file not yet migrated to content cards', async () => {
    expect(
      await refusals('<UCard>Body</UCard>', 'app/components/GoalCard.vue'),
    ).toEqual([])
  })
})
