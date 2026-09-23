import { InactiveEventOutbox } from '../components/InactiveEventOutbox'
import { AccountDeletion } from '../components/AccountDeletion'
import { InactiveOutbox } from '../components/InactiveOutbox'
import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { configured, db } from '../lib/supabase'
import { describeWechatError, initiateWechatLogin } from '../lib/wechatAuth'
import { Button, useTask, useToast } from '../components/ui'
import { Icon, PixelFlower, PixelPal } from '../components/PixelArt'
import type { SpaceController } from '../hooks/useSpace'
import { InviteCode } from './Settings'

// 微信快捷登录依赖浏览器 OAuth 跳转；原生 App 内（Capacitor WebView）不展示，
// 保持原有邮箱 + 深链接登录逻辑不受影响。
const isNativePlatform = Capacitor.isNativePlatform()

const OTP_LENGTH = 6
const OTP_COUNTDOWN = 60

function maskEmail(input: string) {
  const at = input.indexOf('@')
  if (at <= 1) return input
  return input.slice(0, 1) + '***' + input.slice(at)
}

// 像素风 6 位验证码输入：自动聚焦、退格、方向键、粘贴、凑满 6 位自动提交。
function OtpInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || '')
  const setValue = (next: string) => onChange(next.replace(/\D/g, '').slice(0, OTP_LENGTH))
  const focusIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(OTP_LENGTH - 1, index))
    const el = refs.current[clamped]
    if (el) {
      el.focus()
      el.select()
    }
  }
  // 进入验证步骤时自动聚焦第一个空框
  useEffect(() => {
    if (disabled) return
    const firstEmpty = digits.findIndex((d) => !d)
    focusIndex(firstEmpty === -1 ? OTP_LENGTH - 1 : firstEmpty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const handleChange = (index: number, raw: string) => {
    // 只保留数字：粘贴/IME 输入可能带非数字字符
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    setValue(value.slice(0, index) + digit + value.slice(index + 1))
    if (index < OTP_LENGTH - 1) focusIndex(index + 1)
  }
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // 单字符非数字直接拦截（保留退格/方向键等）
    if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
      e.preventDefault()
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) {
        setValue(value.slice(0, index) + value.slice(index + 1))
        focusIndex(index)
      } else if (index > 0) {
        const prev = index - 1
        setValue(value.slice(0, prev) + value.slice(prev + 1))
        focusIndex(prev)
      }
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      focusIndex(index + (e.key === 'ArrowLeft' ? -1 : 1))
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
    }
  }
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const extracted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!extracted) return
    const start = digits.findIndex((d) => !d)
    if (start === -1) return
    setValue(value.slice(0, start) + extracted + value.slice(start + extracted.length))
    focusIndex(Math.min(start + extracted.length - 1, OTP_LENGTH - 1))
  }
  return (
    <div className="otp-group" role="group" aria-label="6 位数字验证码" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          className={`otp-box ${digit ? 'filled' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`验证码第 ${index + 1} 位`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}

export function Auth({ enterDemo }: { enterDemo: () => void }) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login'),
    [regStep, setRegStep] = useState<'form' | 'verify'>('form'),
    [email, setEmail] = useState(() => {
      try {
        return localStorage.getItem('bibu-saved-email') || ''
      } catch {
        return ''
      }
    }),
    [password, setPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState(''),
    [remember, setRemember] = useState(true),
    [otpCode, setOtpCode] = useState(''),
    [otpCountdown, setOtpCountdown] = useState(0),
    { busy, run } = useTask(),
    toast = useToast()

  // 注册验证码 60 秒倒计时：每秒递减，到 0 后自动清理
  useEffect(() => {
    if (regStep !== 'verify' || otpCountdown <= 0) return
    const timer = setTimeout(() => setOtpCountdown((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(timer)
  }, [regStep, otpCountdown])

  function persistEmail(val: string) {
    try {
      if (remember && val.trim()) {
        localStorage.setItem('bibu-saved-email', val.trim())
      } else if (!remember) {
        localStorage.removeItem('bibu-saved-email')
      }
    } catch {}
  }

  // 登录表单提交：使用邮箱 + 密码登录
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const trimmedEmail = email.trim().toLowerCase()
      if (!trimmedEmail) throw new Error('请输入邮箱地址')
      if (!password) throw new Error('请输入登录密码')

      const { error } = await db().auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })
      if (error) {
        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('invalid_grant')
        ) {
          throw new Error('账号或密码不正确。如果未曾注册过，请点击下方“没有账号？点击注册”')
        }
        if (error.message.includes('Email not confirmed')) {
          throw new Error('该账号尚未完成邮箱验证，请先完成注册验证')
        }
        throw error
      }
      persistEmail(trimmedEmail)
      toast('登录成功，欢迎回家！')
    })
  }

  // 微信快捷登录：由 BIBU 独立后端管理微信授权与换码，不依赖 Supabase Custom OAuth Provider。
  // 成功跳转微信授权页；失败时给出友好提示。
  const handleWechatLogin = () => {
    void run(async () => {
      try {
        await initiateWechatLogin()
      } catch (error) {
        throw new Error(describeWechatError(error))
      }
    })
  }

  // 发起注册：校验密码并发送 6 位验证码到邮箱
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const trimmedEmail = email.trim().toLowerCase()
      if (!trimmedEmail) throw new Error('请输入邮箱地址')
      if (!password) throw new Error('请设置登录密码')
      if (password.length < 6) throw new Error('密码长度至少需要 6 位')
      if (password !== confirmPassword) throw new Error('两次输入的密码不一致')

      const { data, error } = await db().auth.signUp({
        email: trimmedEmail,
        password,
      })
      if (error) {
        if (
          error.message.includes('User already registered') ||
          (error as { status?: number }).status === 422
        ) {
          throw new Error('该邮箱已注册，请直接使用密码登录')
        }
        if (
          (error as { status?: number }).status === 429 ||
          /rate|freq|频繁|频率/i.test(error.message)
        ) {
          throw new Error('发送验证码太频繁，请稍后再试')
        }
        throw error
      }

      // 如果服务端未开启邮箱确认直接返回了 session（开发环境等兼容处理）
      if (data.session) {
        persistEmail(trimmedEmail)
        toast('注册成功，欢迎开启小宇宙！')
        return
      }

      persistEmail(trimmedEmail)
      setRegStep('verify')
      setOtpCode('')
      setOtpCountdown(OTP_COUNTDOWN)
      toast('验证码已发送，请查收邮件')
    })
  }

  // 注册验证码重新发送
  const handleRegisterResend = () => {
    if (busy || otpCountdown > 0) return
    void run(async () => {
      const trimmedEmail = email.trim().toLowerCase()
      const { error } = await db().auth.resend({
        type: 'signup',
        email: trimmedEmail,
      })
      if (error) {
        if (
          (error as { status?: number }).status === 429 ||
          /rate|freq|频繁|频率/i.test(error.message)
        ) {
          throw new Error('发送太频繁，请稍后再试')
        }
        throw error
      }
      setOtpCode('')
      setOtpCountdown(OTP_COUNTDOWN)
      toast('验证码已重新发送')
    })
  }

  // 验证注册 6 位验证码：校验成功后 Supabase 自动签发 session 并完成注册
  const handleVerifyRegister = (code: string = otpCode) => {
    if (code.length !== OTP_LENGTH || busy) return
    void run(async () => {
      const trimmedEmail = email.trim().toLowerCase()
      const { data, error } = await db().auth.verifyOtp({
        email: trimmedEmail,
        token: code,
        type: 'signup',
      })
      if (error) {
        const msg = String(error.message || '').toLowerCase()
        const errorCode = (error as { code?: string }).code
        if (errorCode === 'otp_expired' || msg.includes('expired')) {
          setOtpCode('')
          setOtpCountdown(0)
          throw new Error('验证码已过期，请点击重新发送')
        }
        if (errorCode === 'invalid_otp' || msg.includes('invalid') || msg.includes('token')) {
          throw new Error('验证码不正确，请检查后重试')
        }
        throw error
      }
      persistEmail(trimmedEmail)
      // 如果 verifyOtp 没有自动建立 session，尝试使用已填写的密码直接登录
      if (!data.session && password) {
        await db().auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })
      }
      toast('注册并验证成功，欢迎开启小宇宙！')
    })
  }

  // 凑满 6 位自动触发验证
  useEffect(() => {
    if (authMode === 'register' && regStep === 'verify' && otpCode.length === OTP_LENGTH) {
      handleVerifyRegister(otpCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, regStep, otpCode])

  const handleEditRegisterEmail = () => {
    setRegStep('form')
    setOtpCode('')
    setOtpCountdown(0)
  }

  return (
    <div className="auth-screen">
      <div className="auth-art">
        <span className="micro">NO THIRD PLAYER ALLOWED.</span>
        <h1>
          两个人，
          <br />
          一整个
          <br />
          <span>小宇宙。</span>
        </h1>
        <div className="auth-pals">
          <PixelPal />
          <Icon name="heart" size={48} />
          <PixelPal type="bunny" />
        </div>
        <PixelFlower className="auth-flower" />
        <span className="micro">PRESS START. MAKE MEMORIES.</span>
      </div>
      <section className="auth-panel">
        <a className="auth-brand" href="#home">
          BIBU！
        </a>
        <span className="micro">WELCOME TO OUR PRIVATE SPACE</span>
        <h2>{configured ? '你的专属入场券' : '小宇宙，准备开门'}</h2>
        <p>
          没有广场，没有陌生人。
          <br />
          只有你，和你最想分享日常的那个人。
        </p>
        {configured ? (
          <div>
            {!isNativePlatform && regStep !== 'verify' && (
              <>
                <Button
                  tone="green"
                  type="button"
                  disabled={busy}
                  onClick={handleWechatLogin}
                  style={{ width: '100%' }}
                >
                  <Icon name="wechat" size={17} />
                  {busy ? '正在跳转微信…' : '微信快捷登录'}
                </Button>
                <div className="auth-divider">或使用邮箱账号</div>
              </>
            )}
            {authMode === 'login' ? (
              /* 登录主模式：全流程邮箱 + 密码登录 */
              <form className="form-stack" onSubmit={handleLoginSubmit}>
                <label>
                  邮箱地址
                  <input
                    type="email"
                    autoComplete="username email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  登录密码
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <div className="auth-helper-row">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>记住账号</span>
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setAuthMode('register')
                      setRegStep('form')
                      setOtpCode('')
                    }}
                  >
                    没有账号？点击注册
                  </button>
                </div>
                <Button tone="yellow" type="submit" disabled={busy}>
                  {busy ? '正在登录…' : '登录小宇宙'}
                  <Icon name="arrow" size={17} />
                </Button>
              </form>
            ) : regStep === 'form' ? (
              /* 注册模式第一步：设置邮箱与密码 */
              <form className="form-stack" onSubmit={handleRegisterSubmit}>
                <label>
                  邮箱地址
                  <input
                    type="email"
                    autoComplete="username email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  设置密码
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    placeholder="至少 6 位密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  确认密码
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    placeholder="请再次输入密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                <div className="auth-helper-row">
                  <span className="otp-hint">注册需验证邮箱（下发 6 位验证码）</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setAuthMode('login')
                      setPassword('')
                      setConfirmPassword('')
                    }}
                  >
                    已有账号？直接登录
                  </button>
                </div>
                <Button tone="green" type="submit" disabled={busy}>
                  {busy ? '正在发送验证码…' : '下一步：获取验证码'}
                  <Icon name="arrow" size={17} />
                </Button>
              </form>
            ) : (
              /* 注册模式第二步：输入 6 位验证码激活账号 */
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleVerifyRegister()
                }}
              >
                <div className="otp-info">
                  <span className="otp-info-line">验证码已发送至 {maskEmail(email)}</span>
                  <button
                    type="button"
                    className="text-button otp-edit"
                    onClick={handleEditRegisterEmail}
                  >
                    <Icon name="edit" size={12} /> 修改信息
                  </button>
                </div>
                <OtpInput value={otpCode} onChange={setOtpCode} disabled={busy} />
                <div className="otp-resend">
                  {otpCountdown > 0 ? (
                    <span className="otp-countdown" aria-live="polite">
                      重新发送 ({otpCountdown}s)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      onClick={handleRegisterResend}
                      disabled={busy}
                    >
                      <Icon name="undo" size={13} /> 重新发送验证码
                    </button>
                  )}
                </div>
                <div className="auth-helper-row" style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setAuthMode('login')
                      setRegStep('form')
                      setOtpCode('')
                    }}
                  >
                    返回账号密码登录
                  </button>
                </div>
                <p className="otp-hint">
                  6 位验证码 10 分钟内有效。输入完成自动激活账号并完成注册；如未收到请检查垃圾箱。
                </p>
              </form>
            )}
          </div>
        ) : (
          <div className="setup-instructions">
            <strong>先连接你自己的 Supabase</strong>
            <ol>
              <li>复制项目根目录的 .env.example 为 .env.local。</li>
              <li>填写项目 URL 和公开的 Publishable Key。</li>
              <li>执行 supabase/migrations 中的 SQL，配置 Auth 回调地址。</li>
              <li>重新启动开发服务，即可邮箱登录。</li>
            </ol>
            <p>完整步骤见项目根目录 README.md。不要填写 service_role 密钥。</p>
          </div>
        )}
        <div className="auth-divider">或先逛一逛</div>
        <Button tone="white" onClick={enterDemo}>
          进入本地演示 <Icon name="spark" size={16} />
        </Button>
        <span className="auth-privacy">
          <Icon name="lock" size={13} /> 演示数据与真实空间完全分开
        </span>
      </section>
    </div>
  )
}
export function Onboarding({ controller }: { controller: SpaceController }) {
  const [invite, setInvite] = useState(''),
    [code, setCode] = useState(''),
    { busy, run } = useTask(),
    toast = useToast()
  return (
    <div className="onboarding">
      <div className="onboarding-logo">BIBU！</div>
      <Icon name="heart" size={56} />
      <h1>宇宙很小，只装得下两个人。</h1>
      <p>创建一个私人空间，或输入 TA 给你的邀请码。</p>
      {controller.space?.couple ? (
        <div className="onboarding-box">
          <h2>你的空间已创建</h2>
          <p>可以先去布置小窝，再把入场券发给 TA。</p>
          {code ? (
            <InviteCode code={code} />
          ) : (
            <Button
              disabled={busy}
              onClick={() => void run(async () => setCode(await controller.refreshInvite()))}
            >
              生成邀请码
            </Button>
          )}
        </div>
      ) : (
        <div className="onboarding-options">
          <section className="onboarding-box">
            <span className="micro">PLAYER 01</span>
            <h2>我来开一个小宇宙</h2>
            <p>创建空间，获取专属邀请码。</p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await controller.createSpace()
                  setCode(result)
                  window.location.hash = 'settings'
                  toast('空间创建成功，把入场券分享给 TA 吧')
                })
              }
            >
              创建我们的空间
              <Icon name="plus" size={17} />
            </Button>
          </section>
          <form
            className="onboarding-box form-stack"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await controller.joinSpace(invite)
                toast('绑定成功，欢迎回家！')
              })
            }}
          >
            <span className="micro">PLAYER 02</span>
            <h2>TA 正在等我</h2>
            <label>
              输入邀请码
              <input
                required
                minLength={32}
                maxLength={32}
                value={invite}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setInvite(e.target.value.trim())}
                placeholder="粘贴 TA 发来的 32 位邀请码"
              />
            </label>
            <Button tone="green" disabled={busy} type="submit">
              加入 TA 的空间
              <Icon name="arrow" size={17} />
            </Button>
          </form>
        </div>
      )}
      {controller.space && <AccountDeletion controller={controller} demo={false} />}
      {controller.space && (
        <InactiveEventOutbox
          userId={controller.space.me.id}
          currentCoupleId={controller.space.couple?.id || null}
        />
      )}
      {controller.space && (
        <InactiveOutbox
          userId={controller.space.me.id}
          currentCoupleId={controller.space.couple?.id || null}
        />
      )}
      <button
        className="text-button"
        onClick={() =>
          void run(async () => {
            const warnings = await controller.signOut()
            if (warnings.length)
              toast(`已退出登录；部分本机清理未确认：${warnings.join('；')}`, true)
          })
        }
      >
        退出登录
      </button>
    </div>
  )
}
