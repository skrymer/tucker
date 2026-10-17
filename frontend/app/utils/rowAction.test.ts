import { describe, expect, it } from 'vitest'
import { parse } from 'vue/compiler-sfc'
import { appTemplates } from '../../test/templates'

// An edit or delete icon on a row is one control wherever it appears: the same
// low-emphasis neutral ghost, at the same tap target. Restyled per screen, the
// same action read green in one place and grey in the next.

/**
 * A row action's glyph — edit, delete, or a Recipe's ingredients — named in a
 * static `icon` or a bound one's expression.
 */
const EDIT_OR_DELETE_ICON = /i-lucide-(?:pencil|square-pen|trash|list\b)/

type TemplateNode = {
  type: number
  tag?: string
  content?: string
  children?: TemplateNode[]
  props?: {
    type: number
    name: string
    value?: { content: string }
    arg?: { content: string }
    exp?: { content: string }
  }[]
  loc: { source: string }
}

/** Vue's node types: an element, its text, and a static or bound attribute. */
const ELEMENT = 1
const TEXT = 2
const ATTRIBUTE = 6
const DIRECTIVE = 7

/** What a node's `icon` names, written statically or bound. */
function iconOf(node: TemplateNode): string {
  const icon = node.props?.find(
    (p) =>
      (p.type === ATTRIBUTE && p.name === 'icon') ||
      (p.type === DIRECTIVE && p.arg?.content === 'icon'),
  )
  return icon?.value?.content ?? icon?.exp?.content ?? ''
}

/** A UButton with no label: no children, or only whitespace. */
const isIconOnly = (node: TemplateNode) =>
  (node.children ?? []).every(
    (child) => child.type === TEXT && !child.content?.trim(),
  )

/** Every UButton in [nodes], however deep. */
function buttonsIn(nodes: TemplateNode[]): TemplateNode[] {
  return nodes.flatMap((node) => [
    ...(node.type === ELEMENT && node.tag === 'UButton' ? [node] : []),
    ...buttonsIn(node.children ?? []),
  ])
}

/**
 * Every icon-only edit or delete UButton in [template], as written — read by
 * Vue's own parser, so no attribute's content can end the tag early.
 */
function restyledRowActions(template: string): string[] {
  const { descriptor } = parse(
    template.includes('<template')
      ? template
      : `<template>${template}</template>`,
  )
  const root = descriptor.template?.ast as TemplateNode | undefined
  return buttonsIn(root?.children ?? [])
    .filter((button) => isIconOnly(button))
    .filter((button) => EDIT_OR_DELETE_ICON.test(iconOf(button)))
    .map((button) => button.loc.source)
}

describe('edit and delete row actions', () => {
  it('are all drawn by RowActionButton, never a UButton styled per screen', () => {
    const restyled = appTemplates()
      // The one place the treatment is written down.
      .filter(({ file }) => file !== 'components/RowActionButton.vue')
      .flatMap(({ file, source }) =>
        restyledRowActions(source).map(
          (tag) => `${file}: ${tag.split(/\s+/).join(' ')}`,
        ),
      )

    expect(restyled).toEqual([])
  })

  it.each([
    ['a static icon', '<UButton icon="i-lucide-trash-2" />'],
    ['a bound icon', `<UButton :icon="'i-lucide-pencil'" aria-label="Edit" />`],
    [
      'an icon bound by condition',
      `<UButton :icon="open ? 'i-lucide-pencil' : 'i-lucide-x'" />`,
    ],
    [
      'an empty open-and-close tag',
      '<UButton icon="i-lucide-trash-2"></UButton>',
    ],
    [
      'a button whose other attribute holds a <',
      '<UButton :disabled="count < 3" icon="i-lucide-trash-2" />',
    ],
    [
      "a Recipe's view-ingredients icon",
      '<UButton icon="i-lucide-list" aria-label="View ingredients in Gratin" />',
    ],
    [
      'another pencil or trash glyph',
      '<UButton icon="i-lucide-square-pen" /><UButton icon="i-lucide-trash" />',
    ],
  ])('are caught when written as %s', (_, source) => {
    expect(restyledRowActions(source)).not.toEqual([])
  })

  it('leave a labelled edit or delete button alone', () => {
    expect(
      restyledRowActions(
        '<UButton icon="i-lucide-pencil" block>Edit recipe</UButton>',
      ),
    ).toEqual([])
  })
})
