import { describe, expect, it } from 'vitest'
import { tagNameKey } from './tagName'

describe('tagNameKey', () => {
  it('trims a control separator the server trims and JavaScript keeps', () => {
    expect(tagNameKey('\u001FSnack\u001C')).toBe(tagNameKey('Snack'))
  })

  it('keeps a byte-order mark the server keeps and JavaScript trims', () => {
    expect(tagNameKey('﻿Snack')).not.toBe(tagNameKey('Snack'))
  })

  it('folds case across the whole of Unicode, as the server does', () => {
    expect(tagNameKey('  CRÈME BRÛLÉE ')).toBe(tagNameKey('crème brûlée'))
  })

  it('folds to lower case, so a sharp s is not the double s it upper-cases to', () => {
    expect(tagNameKey('Straße')).not.toBe(tagNameKey('STRASSE'))
  })
})
