import { describe, expect, it } from 'vitest'
import {
  WECHAT_IDENTITY_TAKEN_MESSAGE,
  describeWechatError,
  readOAuthErrorFromLocation,
  stripOAuthErrorFromUrl,
} from './wechatAuth'

describe('readOAuthErrorFromLocation', () => {
  it('reads error params from search and hash queries', () => {
    expect(
      readOAuthErrorFromLocation({
        search:
          '?error=access_denied&error_description=%E5%B7%B2%E5%8F%96%E6%B6%88%E5%BE%AE%E4%BF%A1%E6%8E%88%E6%9D%83',
        hash: '',
      }),
    ).toEqual({ code: 'access_denied', description: '已取消微信授权' })
    expect(
      readOAuthErrorFromLocation({
        search: '',
        hash: '#settings?error=invalid_state&error_description=expired',
      }),
    ).toEqual({ code: 'invalid_state', description: 'expired' })
  })
  it('returns null when there is no error param', () => {
    expect(readOAuthErrorFromLocation({ search: '?code=abc', hash: '#home' })).toBeNull()
    expect(readOAuthErrorFromLocation({ search: '', hash: '' })).toBeNull()
  })
})

describe('stripOAuthErrorFromUrl', () => {
  it('strips error params without touching the rest of the URL', () => {
    expect(
      stripOAuthErrorFromUrl('https://bibu.app/?error=access_denied&error_description=x#settings'),
    ).toBe('https://bibu.app/#settings')
    expect(
      stripOAuthErrorFromUrl('https://bibu.app/#settings?error=invalid_state&error_description=y'),
    ).toBe('https://bibu.app/#settings')
    expect(stripOAuthErrorFromUrl('https://bibu.app/?error=access_denied#chat?message=1')).toBe(
      'https://bibu.app/#chat?message=1',
    )
  })
  it('returns null when there is nothing to clean', () => {
    expect(stripOAuthErrorFromUrl('https://bibu.app/?code=abc#home')).toBeNull()
  })
})

describe('describeWechatError', () => {
  it('never leaks tokens or secrets and keeps messages user-friendly', () => {
    const message = describeWechatError({
      code: 'identity_already_exists',
      message: 'identity_already_exists',
    })
    expect(message).toBe(WECHAT_IDENTITY_TAKEN_MESSAGE)
    expect(message).not.toMatch(/token|secret|access_/i)
  })

  it('maps identity conflicts, cancellation, expiry and provider gaps', () => {
    expect(describeWechatError({ message: 'Identity already linked to another user' })).toBe(
      WECHAT_IDENTITY_TAKEN_MESSAGE,
    )
    expect(describeWechatError({ code: 'access_denied' })).toBe('已取消微信授权，可随时重新登录')
    expect(describeWechatError({ code: 'invalid_state' })).toBe(
      '登录状态已失效，请重新点击「微信快捷登录」',
    )
    expect(describeWechatError({ message: 'invalid_grant: code expired' })).toBe(
      '微信登录已过期，请重新操作',
    )
    expect(describeWechatError({ code: 'custom_provider_not_found' })).toBe(
      '微信登录暂未开放，请先使用邮箱登录',
    )
    expect(describeWechatError({ message: 'wechat_timeout: 微信服务连接超时，请稍后重试' })).toBe(
      '连接微信服务超时，请稍后重试',
    )
    expect(describeWechatError({ message: 'unexpected 500 from auth server' })).toBe(
      '微信登录没有完成，请重试；如多次失败请改用邮箱登录',
    )
  })

  it('falls back to a generic message for unknown failures', () => {
    expect(describeWechatError(new Error('boom'))).toBe(
      '微信登录没有完成，请重试；如多次失败请改用邮箱登录',
    )
  })
})
