import { setFocusReminder, cancelFocusReminder } from '../lib/focusReminder'
import { ReminderPanel } from '../components/ReminderPanel'
import { ScreenTimePanel } from '../components/ScreenTimePanel'
import { useEffect, useState } from 'react'
import type { SpaceController } from '../hooks/useSpace'
import { Button, PageHeading, Panel, PixelSelect, useTask, useToast } from '../components/ui'
import { Icon, PixelPal } from '../components/PixelArt'
export function Focus({ controller }: { controller: SpaceController }) {
  const space = controller.space!,
    [activity, setActivity] = useState('学习'),
    [minutes, setMinutes] = useState(25),
    [allow, setAllow] = useState(false),
    [remindMe, setRemindMe] = useState(false),
    [reminderResult, setReminderResult] = useState(''),
    [now, setNow] = useState(Date.now()),
    { busy, run } = useTask(),
    toast = useToast()
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const own = space.focus.find(
    (f) => f.user_id === space.me.id && new Date(f.ends_at).getTime() > now,
  )
  const partner = space.focus.find(
    (f) => f.user_id === space.partner?.id && new Date(f.ends_at).getTime() > now,
  )
  const seconds = own
    ? Math.max(0, Math.ceil((new Date(own.ends_at).getTime() - now) / 1000))
    : minutes * 60
  return (
    <>
      <PageHeading
        eyebrow="GROW APART, GROW TOGETHER"
        title="专注陪伴"
        subtitle="不是监督你，是陪你成为更喜欢的自己。"
      />
      {reminderResult && (
        <div className="waiting-banner" role="status">
          {reminderResult}
        </div>
      )}
      <div className="focus-layout">
        <Panel className="focus-main" title="我的专注时间" tag="PLAYER 01">
          <div className="focus-timer-area">
            <div className="focus-status">
              <i />
              {own ? `正在${own.activity} · 专心模式 ON` : '准备好，给自己一点专注时间'}
            </div>
            <div className="focus-clock" role="timer" aria-label="专注剩余时间">
              {String(Math.floor(seconds / 60)).padStart(2, '0')}
              <span>:</span>
              {String(seconds % 60).padStart(2, '0')}
            </div>
            <PixelPal type={space.me.avatar} outfit={space.me.outfits?.[space.me.avatar]} />
            <span className="micro">ONE SMALL STEP AT A TIME</span>
          </div>
          {own ? (
            <div className="form-stack">
              <p className="focus-consent-state">
                <Icon name={own.allow_reminders ? 'sound' : 'lock'} size={18} />
                {own.allow_reminders ? '本次允许对方发送提醒' : '本次不接收对方的打扰提醒'}
              </p>
              <Button
                tone="pink"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await controller.endFocus()
                    const message = await cancelFocusReminder()
                    setReminderResult(message)
                    toast(message)
                  })
                }
              >
                结束本次专注
              </Button>
              <p className="form-note">你随时可以结束，只控制自己的状态。</p>
            </div>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  const saved = await controller.startFocus(activity, minutes, allow)
                  const message = await setFocusReminder(saved, remindMe)
                  setReminderResult(message)
                  toast(message)
                })
              }}
            >
              <div>
                <span
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '13px',
                    fontWeight: 650,
                  }}
                >
                  现在想做什么？
                </span>
                <PixelSelect
                  value={activity}
                  onChange={setActivity}
                  aria-label="选择专注活动"
                  options={[
                    { value: '学习', label: '学习' },
                    { value: '工作', label: '工作' },
                    { value: '阅读', label: '阅读' },
                    { value: '运动', label: '运动' },
                  ]}
                />
              </div>
              <fieldset className="duration-picker">
                <legend>给自己多少时间？</legend>
                {[15, 25, 45, 60].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={minutes === n ? 'selected' : ''}
                    onClick={() => setMinutes(n)}
                  >
                    {n} 分钟
                  </button>
                ))}
              </fieldset>
              <label className="check-label consent-box">
                <input
                  type="checkbox"
                  checked={allow}
                  onChange={(e) => setAllow(e.target.checked)}
                />
                <span>
                  我主动允许对方在本次专注中发提醒
                  <small>默认关闭。结束本次专注即可撤回授权。</small>
                </span>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={remindMe}
                  onChange={(e) => setRemindMe(e.target.checked)}
                />
                专注结束时提醒我（Android 本机，系统可能延后）
              </label>
              <Button tone="green" disabled={busy} type="submit">
                <Icon name="focus" size={20} />
                开始专注
              </Button>
              <p className="form-note">
                与“允许伴侣提醒”独立。通知只含通用文案；在其他设备结束专注不会立即取消本机闹钟，可从下方提醒列表取消。
              </p>
            </form>
          )}
        </Panel>
        <div className="focus-aside">
          <Panel title="TA 的小状态" tag="PLAYER 02" className="partner-focus">
            <PixelPal
              type={space.partner?.avatar || 'bunny'}
              outfit={space.partner?.outfits?.[space.partner?.avatar || 'bunny']}
            />
            <h3>{space.partner?.name || '另一位玩家'}</h3>
            <div className="partner-state">
              {partner
                ? `正在${partner.activity} · 还有 ${Math.ceil((new Date(partner.ends_at).getTime() - now) / 60000)} 分钟`
                : '暂时没有开启专注'}
            </div>
            <p>
              {partner?.allow_reminders
                ? 'TA 主动允许你在这次专注中提醒'
                : '不打扰，也是一种温柔的陪伴。'}
            </p>
            <div className="reminder-grid">
              {(['去学习', '去工作', '休息一下', '哔卟哔卟'] as const).map((kind) => (
                <Button
                  key={kind}
                  tone="white"
                  disabled={!partner?.allow_reminders || busy}
                  onClick={() =>
                    void run(async () => {
                      await controller.sendPing(kind)
                      toast('提醒已发送，暂无送达回执')
                    })
                  }
                >
                  {kind}
                </Button>
              ))}
            </div>
          </Panel>
          <div className="consent-note">
            <Icon name="lock" size={25} />
            <h3>陪伴，不是监控</h3>
            <p>
              不查看屏幕内容、不偷偷上传使用记录。设备使用时长仅在本人明确授予 Usage Access
              后读取；每次专注仍由本人开启和结束。
            </p>
            <p>
              你可以随时在 Android 系统设置中撤销使用情况访问权限。本版本不提供专注锁定或 App 拦截。
            </p>
          </div>
        </div>
      </div>
      <section className="focus-support" aria-label="提醒与设备使用情况">
        <ReminderPanel />
        <ScreenTimePanel />
      </section>
    </>
  )
}
