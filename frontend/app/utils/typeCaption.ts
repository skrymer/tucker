/**
 * A rendered element's type, stated the way DESIGN.md's Scale table writes it:
 * `24px / 1.33 · 700`. The line-height is a ratio of the size, since a computed
 * style reports it in px.
 */
export function typeCaption(style: {
  fontSize: string
  lineHeight: string
  fontWeight: string
  letterSpacing: string
}): string {
  const size = Number.parseFloat(style.fontSize)
  const ratio = Number.parseFloat(style.lineHeight) / size
  const caption = `${size}px / ${Number(ratio.toFixed(2))} · ${style.fontWeight}`
  const tracking = Number.parseFloat(style.letterSpacing)
  if (!tracking) return caption
  return `${caption} · +${Number((tracking / size).toFixed(2))}em`
}
