import { describe, expect, it } from 'vitest'
import { detailHref, listReturnHref, parseRoute } from './route'

describe('list return context', () => {
  it('round trips page, unicode search and filters through a detail link', () => {
    const source = parseRoute('#/tickets?view=mine&page=3&query=%E6%8E%A8%E9%80%81&status=open')
    const detail = parseRoute(detailHref('/tickets/123', source))
    expect(listReturnHref(detail.params.get('return_to'), '/tickets')).toBe(
      '#/tickets?view=mine&page=3&query=%E6%8E%A8%E9%80%81&status=open',
    )
  })
  it('rejects external, executable and detail return targets', () => {
    for (const value of [
      'https://example.com',
      'javascript:alert(1)',
      '#//example.com',
      '#/tickets/123',
      '#/admins',
    ]) {
      expect(listReturnHref(value, '/tickets')).toBe('#/tickets')
    }
  })
})
