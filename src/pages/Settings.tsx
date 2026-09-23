import { InactiveEventOutbox } from '../components/InactiveEventOutbox'
import { downloadSpace } from '../lib/spaceExport'
import { PushRegistrationPanel } from '../components/PushRegistrationPanel'
import { SettingsNote } from '../components/SettingsNote'
import { AccountDeletion } from '../components/AccountDeletion'
import { InactiveOutbox } from '../components/InactiveOutbox'
import { InvitationManager } from '../components/InvitationManager'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { SpaceController } from '../hooks/useSpace'
import type { AvatarType, Page } from '../lib/types'
import { Button, Modal, PageHeading, useTask, useToast } from '../components/ui'
import { Icon } from '../components/PixelArt'
import { CharacterSelector, PixelCharacter, type PixelCharacterAnimation } from '../components/pet'
import { CHARACTER_MAP } from '../lib/pet'
import { db } from '../lib/supabase'
import {
  describeWechatError,
  getWechatBindingStatus,
  initiateWechatBind,
  unbindWechat as apiUnbindWechat,
  type WechatBindingStatus,
} from '../lib/wechatAuth'
import { localDateInput } from '../lib/dates'
import { PixelDatePicker } from '../components/PixelPickers'

export function InviteCode({ code }: { code: string }) {
  const { busy, run } = useTask(),
    toast = useToast()
  return (
    <div className="invite-code">
      <p>把这张入场券，私下交给唯一的 TA。</p>
      <code>{code}</code>
      <Button
        disabled={busy}
        tone="green"
        onClick={() =>
          void run(async () => {
            await navigator.clipboard.writeText(code)
            toast('邀请码已复制，有效期 24 小时')
          })
        }
      >
        复制邀请码
      </Button>
      <small>24 小时有效 · 使用一次即失效 · 重新生成会使旧码失效</small>
    </div>
  )
}

function getDaysCount(sinceStr: string): number {
  if (!sinceStr) return 0
  const start = new Date(sinceStr).getTime()
  if (Number.isNaN(start)) return 0
  const now = Date.now()
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff + 1)
}

export function Settings({
  controller,
  navigate,
  demo,
  exitDemo,
  sound,
  setSound,
}: {
  controller: SpaceController
  navigate?: (page: Page) => void
  demo: boolean
  exitDemo: () => void
  sound: boolean
  setSound: (on: boolean) => void
}) {
  const space = controller.space!,
    [name, setName] = useState(space.me.name),
    [since, setSince] = useState(space.couple?.together_since || localDateInput()),
    [avatar, setAvatar] = useState<AvatarType>(space.me.avatar || 'cat'),
    outfits = space.me.outfits || {},
    [petAnim, setPetAnim] = useState<PixelCharacterAnimation>('none'),
    [showCharacterPicker, setShowCharacterPicker] = useState(false),
    [newPass, setNewPass] = useState(''),
    [closing, setClosing] = useState(false),
    [closeText, setCloseText] = useState(''),
    [identities, setIdentities] = useState<{ email: boolean } | null>(null),
    [wechatStatus, setWechatStatus] = useState<WechatBindingStatus | null>(null),
    [unbindWechatModal, setUnbindWechatModal] = useState(false),
    { busy, run } = useTask(),
    toast = useToast()

  const isNativePlatform = Capacitor.isNativePlatform()
  const daysTogether = getDaysCount(since)

  // 账号安全：读取当前用户邮箱状态与自建微信绑定状态。
  useEffect(() => {
    if (demo) return
    let active = true
    void Promise.all([db().auth.getUser(), getWechatBindingStatus().catch(() => null)])
      .then(([userRes, wxStatus]) => {
        if (!active) return
        const user = userRes.data.user
        const isPlaceholder =
          user?.email?.includes('@auth.bibu.space') || user?.email?.includes('@login.bibu.space')
        setIdentities({ email: !isPlaceholder && !!user?.email })
        setWechatStatus(wxStatus)
      })
      .catch(() => {
        if (active) {
          setIdentities(null)
          setWechatStatus(null)
        }
      })
    return () => {
      active = false
    }
  }, [demo, space.me.id])

  const handleSelectCharacter = (newId: AvatarType) => {
    setAvatar(newId)
    setPetAnim('bounce')
    setTimeout(() => setPetAnim('none'), 500)
  }

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await controller.save(name.trim(), since, avatar, outfits)
      toast('档案与 BIBU！形象已保存 ♥')
    })
  }

  const handleCloseRelationship = (e: React.FormEvent) => {
    e.preventDefault()
    if (closeText !== '解除绑定') return
    void run(async () => {
      await controller.closeRelationship(space.couple!.id)
      setClosing(false)
      toast('双方已解除绑定，旧空间已封存。可创建或加入新空间。')
    })
  }

  // 绑定微信：调用自建微信授权服务，传递当前用户 session 凭据，
  // 微信授权成功后原子关联到当前 bibu_user_id，不会创建新账号。
  const handleBindWechat = () => {
    void run(async () => {
      const {
        data: { session },
      } = await db().auth.getSession()
      if (!session?.access_token) {
        throw new Error('当前登录已失效，请重新登录后再试')
      }
      try {
        await initiateWechatBind(session.access_token)
      } catch (error) {
        throw new Error(describeWechatError(error))
      }
    })
  }

  // 解绑微信：仅在账号存在可用密码或邮箱登录方式时允许，避免误操作导致无法登录。
  const handleUnbindWechat = () => {
    void run(async () => {
      try {
        await apiUnbindWechat()
        setUnbindWechatModal(false)
        setWechatStatus((prev) => (prev ? { ...prev, bound: false } : null))
        toast('已解除微信绑定')
      } catch (error) {
        throw new Error(describeWechatError(error))
      }
    })
  }

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (newPass.length < 6) throw new Error('密码长度至少需要 6 位')
      const { error } = await db().auth.updateUser({ password: newPass })
      if (error) throw error
      setNewPass('')
      toast('登录密码设置成功，后续可直接用密码登录')
    })
  }

  return (
    <>
      {closing && (
        <Modal
          title="解除当前绑定？"
          onClose={() => {
            if (!busy) setClosing(false)
          }}
        >
          <form className="form-stack" onSubmit={handleCloseRelationship}>
            <p>
              解除绑定后，此双人空间将被封存，两人的互动记录保留但不产生新消息。解绑后你可以重新创建或加入新的双人小窝。
            </p>
            <label>
              输入“解除绑定”确认
              <input
                value={closeText}
                onChange={(e) => setCloseText(e.target.value)}
                autoComplete="off"
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <Button tone="pink" type="submit" disabled={busy || closeText !== '解除绑定'}>
                {busy ? '正在解除…' : '确认解除并封存'}
              </Button>
              <Button tone="white" type="button" disabled={busy} onClick={() => setClosing(false)}>
                保留当前关系
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {unbindWechatModal && (
        <Modal
          title="解除微信绑定？"
          onClose={() => {
            if (!busy) setUnbindWechatModal(false)
          }}
        >
          <div className="form-stack">
            <p>解绑后，这个微信将不能用来登录当前 BIBU 账号。你仍然可以用邮箱密码登录。</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button tone="pink" type="button" disabled={busy} onClick={handleUnbindWechat}>
                {busy ? '正在解绑…' : '确认解绑'}
              </Button>
              <Button
                tone="white"
                type="button"
                disabled={busy}
                onClick={() => setUnbindWechatModal(false)}
              >
                先不解绑
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <PageHeading
        eyebrow="OUR SPACE, OUR RULES"
        title="空间设置"
        subtitle="伴侣专属档案 · 通信与系统设置"
      />

      {!demo && <InactiveOutbox userId={space.me.id} currentCoupleId={space.couple?.id || null} />}
      {!demo && (
        <InactiveEventOutbox userId={space.me.id} currentCoupleId={space.couple?.id || null} />
      )}

      {/* 掌机卡带双列布局 */}
      <div className="settings-cartridge-layout">
        {/* 左列：档案与双人关系 */}
        <div className="cartridge-col">
          {/* === CARD 1: 恋人专属护照 === */}
          <div className="retro-cartridge">
            <div className="retro-window-bar bar-pink">
              <span className="micro">
                <i className="sq" /> PASSPORT · 恋人专属档案
              </span>
              <div className="dots">✦ ✦ ✦</div>
            </div>

            <div className="retro-cartridge-body">
              <form onSubmit={handleSaveProfile} style={{ display: 'grid', gap: '14px' }}>
                <div className="passport-hero">
                  {/* 萌宠小舞台 */}
                  <div className="passport-pedestal-box">
                    <div className="passport-stage">
                      <PixelCharacter
                        character={avatar}
                        outfit={outfits[avatar]}
                        size={68}
                        animation={petAnim}
                        onClick={() => {
                          setPetAnim('happy')
                          setTimeout(() => setPetAnim('none'), 600)
                        }}
                      />
                    </div>
                    {navigate && (
                      <button
                        type="button"
                        className="passport-wardrobe-btn"
                        onClick={() => navigate('wardrobe')}
                      >
                        <Icon name="spark" size={11} />
                        <span>换装衣橱 →</span>
                      </button>
                    )}
                  </div>

                  {/* 核心资料输入 */}
                  <div className="passport-meta-fields">
                    <div className="passport-input-group">
                      <label>我的小昵称</label>
                      <input
                        className="passport-input"
                        required
                        maxLength={24}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="输入你的昵称"
                      />
                    </div>

                    <div className="passport-input-group">
                      <label>相遇起始日</label>
                      <PixelDatePicker value={since} onChange={setSince} />
                    </div>

                    {/* 相恋天数徽章 */}
                    <div className="passport-counter-badge">
                      <div className="counter-left">
                        <span>♥ 相伴时光</span>
                      </div>
                      <div>
                        <span className="counter-days-num">{daysTogether}</span>
                        <span style={{ fontSize: '10px', marginLeft: '4px', fontWeight: 700 }}>
                          DAYS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 16款萌宠伙伴抽屉 */}
                <div className="companion-selector-block">
                  <div className="companion-header">
                    <span>当前伙伴: {CHARACTER_MAP[avatar]?.name || avatar}</span>
                    <button
                      type="button"
                      className="companion-toggle-btn"
                      onClick={() => setShowCharacterPicker((prev) => !prev)}
                    >
                      {showCharacterPicker ? '收起图鉴 ▲' : '切换伙伴 (16款) ▼'}
                    </button>
                  </div>
                  {showCharacterPicker && (
                    <div style={{ marginTop: '10px' }}>
                      <CharacterSelector selectedId={avatar} onSelect={handleSelectCharacter} />
                    </div>
                  )}
                </div>

                <Button
                  tone="green"
                  type="submit"
                  disabled={busy || !name.trim()}
                  style={{ width: '100%', padding: '10px' }}
                >
                  保存玩家小档案 ♥
                </Button>
              </form>
            </div>
          </div>

          {/* === CARD 2: 双人爱意车票 === */}
          <div className="retro-cartridge couple-ticket">
            <div className="retro-window-bar bar-yellow">
              <span className="micro">
                <i className="sq" /> COUPLE TICKET · 双人专属票根
              </span>
              <div className="dots">♥ ♥ ♥</div>
            </div>

            <div className="ticket-perforation-bar" />

            <div className="retro-cartridge-body">
              <div className="ticket-partners-grid">
                <div className="ticket-user-slot">
                  <PixelCharacter character={space.me.avatar || 'cat'} size={32} />
                  <strong>{space.me.name}</strong>
                  <span>(我)</span>
                </div>

                <div className="ticket-heart-center">
                  <span className="ticket-heart-icon">♥</span>
                  <span className="ticket-connect-tag">
                    {space.partner ? 'CONNECTED' : 'WAITING'}
                  </span>
                </div>

                <div className="ticket-user-slot">
                  {space.partner ? (
                    <>
                      <PixelCharacter character={space.partner.avatar || 'bunny'} size={32} />
                      <strong>{space.partner.name}</strong>
                      <span>(TA)</span>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          border: '1px dashed #99a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        ?
                      </div>
                      <strong style={{ color: '#888' }}>等待入场</strong>
                      <span>(伴侣)</span>
                    </>
                  )}
                </div>
              </div>

              {!demo && !space.partner && (
                <InvitationManager key={space.couple!.id} controller={controller} />
              )}

              <div style={{ borderTop: '1px dashed #d5deca', paddingTop: '10px' }}>
                <SettingsNote title="解除绑定说明">
                  <p>解除会封存旧空间。重新绑定只能进入新空间，旧关系内容不会分享给新伴侣。</p>
                </SettingsNote>
                {!demo && (
                  <Button
                    tone="pink"
                    style={{ marginTop: '8px', width: '100%' }}
                    onClick={() => setClosing(true)}
                  >
                    解除并封存当前空间
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 右列：通信联络与系统安全 */}
        <div className="cartridge-col">
          {/* === CARD 3: 想念信报箱（个推实时推送与反馈） === */}
          <PushRegistrationPanel controller={controller} sound={sound} setSound={setSound} />

          {/* === CARD 4: 空间保险箱与系统设置 === */}
          <div className="retro-cartridge">
            <div className="retro-window-bar bar-blue">
              <span className="micro">
                <i className="sq" /> SYSTEM VAULT · 空间存储与安全
              </span>
              <div className="dots">■ ■ ■</div>
            </div>

            <div className="retro-cartridge-body">
              {!demo && (
                <div className="vault-action-card">
                  <div>
                    <h4>本机离线回忆快照</h4>
                    <p>在手机本地安全缓存最近日记与相册，飞行模式亦可翻看回忆</p>
                  </div>
                  <Button
                    tone="white"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        controller.setOfflineCache(!controller.offlineCacheEnabled)
                        toast(
                          controller.offlineCacheEnabled
                            ? '已关闭并清除本机快照'
                            : '已开启本机离线快照',
                        )
                      })
                    }
                  >
                    {controller.offlineCacheEnabled ? '关闭并清除快照' : '开启快照'}
                  </Button>
                </div>
              )}

              {!demo && (
                <div className="vault-action-card">
                  <div>
                    <h4>导出双人空间备份</h4>
                    <p>完整下载日记、聊天记录与相册元数据为 JSON 文件</p>
                  </div>
                  <Button
                    tone="white"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        downloadSpace(space)
                        toast('空间数据已导出到下载目录')
                      })
                    }
                  >
                    导出数据
                  </Button>
                </div>
              )}

              {!demo && (
                <div
                  style={{
                    display: 'grid',
                    gap: '6px',
                    padding: '8px 0',
                    borderTop: '1px dashed #d5dec6',
                    borderBottom: '1px dashed #d5dec6',
                  }}
                >
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#445233' }}>
                    账号安全 · 登录方式
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      color: '#445233',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Icon name="lock" size={13} /> 邮箱登录
                    </span>
                    <strong>{identities?.email ? '已绑定' : '未绑定'}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      color: '#445233',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Icon name="wechat" size={13} /> 微信快捷登录
                    </span>
                    <strong>{wechatStatus?.bound ? '已绑定' : '未绑定'}</strong>
                  </div>
                  {!wechatStatus?.bound ? (
                    isNativePlatform ? (
                      <p style={{ margin: 0, fontSize: '11px', color: '#66705b', lineHeight: 1.5 }}>
                        微信绑定请在网页版 (www.515171.xyz) 完成，绑定后全平台通用。
                      </p>
                    ) : (
                      <Button tone="green" type="button" disabled={busy} onClick={handleBindWechat}>
                        <Icon name="wechat" size={15} />
                        {busy ? '正在连接微信…' : '绑定微信'}
                      </Button>
                    )
                  ) : wechatStatus?.canUnbind ? (
                    <Button
                      tone="white"
                      type="button"
                      disabled={busy}
                      onClick={() => setUnbindWechatModal(true)}
                    >
                      解除微信绑定
                    </Button>
                  ) : (
                    <p style={{ margin: 0, fontSize: '11px', color: '#a05a5a', lineHeight: 1.5 }}>
                      当前账号没有邮箱密码登录，为避免失去所有登录方式，暂不支持解绑微信。请在下方设置密码后再解绑。
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: '11px', color: '#66705b', lineHeight: 1.5 }}>
                    绑定后，邮箱和微信登录进入的是同一个 BIBU
                    账号与同一个空间；微信授权信息只用于身份识别。
                  </p>
                </div>
              )}

              {!demo && (
                <form
                  onSubmit={handleUpdatePassword}
                  style={{
                    display: 'grid',
                    gap: '6px',
                    padding: '8px 0',
                    borderTop: '1px dashed #d5dec6',
                    borderBottom: '1px dashed #d5dec6',
                  }}
                >
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#445233' }}>
                    设置 / 修改登录密码
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="passport-input"
                      style={{ flex: 1 }}
                      type="password"
                      autoComplete="new-password"
                      placeholder="至少 6 位新密码"
                      minLength={6}
                      required
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                    />
                    <Button tone="green" type="submit" disabled={busy || newPass.length < 6}>
                      更新
                    </Button>
                  </div>
                </form>
              )}

              {/* 复制诊断报告 */}
              <Button
                tone="white"
                onClick={() =>
                  void run(async () => {
                    const info = [
                      `build: ${__BIBU_BUILD__.commit}`,
                      `builtAt: ${__BIBU_BUILD__.builtAt}`,
                      `mode: ${__BIBU_BUILD__.mode}`,
                      `url: ${window.location.href}`,
                      `ua: ${navigator.userAgent}`,
                    ].join('\n')
                    await navigator.clipboard.writeText(info)
                    toast('诊断信息已复制')
                  })
                }
              >
                <Icon name="spark" size={15} />
                复制版本与环境信息
              </Button>

              <AccountDeletion controller={controller} demo={demo} />

              <div style={{ borderTop: '1px dashed #d5dec6', paddingTop: '10px' }}>
                <Button
                  tone="white"
                  disabled={busy}
                  style={{ width: '100%' }}
                  onClick={() =>
                    demo
                      ? exitDemo()
                      : void run(async () => {
                          const warnings = await controller.signOut()
                          if (warnings.length)
                            toast(`已退出登录；部分本机清理未确认：${warnings.join('；')}`, true)
                        })
                  }
                >
                  <Icon name={demo ? 'arrow' : 'logout'} size={15} />
                  {demo ? '进入登录 / 配置指引' : '退出登录'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
