import type { Page } from '@playwright/test'

/**
 * Records the open dialog's text on every frame until it is gone — a closing
 * dialog stays drawn through its leave animation. Call the returned function
 * once the dialog is hidden to read what was drawn.
 */
export async function sampleDialogText(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = []
    Object.assign(window, { seen })
    const sample = () => {
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return
      seen.push(dialog.textContent ?? '')
      requestAnimationFrame(sample)
    }
    sample()
  })
  return () =>
    page.evaluate(() => (window as unknown as { seen: string[] }).seen)
}
