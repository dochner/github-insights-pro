// @vitest-environment happy-dom
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})

// Proves the harness can actually fail, so the component specs' "zero violations" is meaningful.
describe('axe-core + happy-dom harness sanity check', () => {
  it('flags a deliberately inaccessible image (missing alt text)', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<img src="broken.png">'
    document.body.appendChild(container)

    const results = await axe.run(container)

    const ruleIds = results.violations.map((v) => v.id)
    expect(ruleIds).toContain('image-alt')
  })

  it('reports zero violations for the same image once given proper alt text', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<img src="broken.png" alt="A descriptive label">'
    document.body.appendChild(container)

    const results = await axe.run(container)

    expect(results.violations).toEqual([])
  })

  // Documents a known gap: happy-dom can't resolve color-contrast even for this obvious case.
  it('never resolves color-contrast under happy-dom, even for an obvious violation', async () => {
    const container = document.createElement('div')
    container.style.color = '#ffffff'
    container.style.backgroundColor = '#ffffff'
    container.textContent = 'white text on white background'
    document.body.appendChild(container)

    const results = await axe.run(container)

    const ids = (entries: axe.Result[]) => entries.map((e) => e.id)
    expect(ids(results.violations)).not.toContain('color-contrast')
    expect(ids(results.incomplete)).toContain('color-contrast')
  })
})
