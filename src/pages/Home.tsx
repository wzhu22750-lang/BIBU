import { EventArt } from '../components/EventArt'
import { lovePings, pingFeedback } from '../lib/ping'
import { dailyMemories, upcomingEvents } from '../lib/home'
import { useNow } from '../hooks/useNow'
import { useState } from 'react'
import { Icon, PixelFlower, PixelPal } from '../components/PixelArt'
import { Button, Empty, Modal, PageHeading, Panel, useTask, useToast } from '../components/ui'
import { clock, dateLabel, togetherDays } from '../lib/dates'
import type { Page, Photo } from '../lib/types'
import type { SpaceController } from '../hooks/useSpace'
import type { BibuAction } from '../hooks/useBibu'
import { EventCard, EventForm } from './Events'
import { PhotoCard, PhotoViewer } from './Photos'
import { DailyTaskCard } from '../components/DailyTaskCard'

const GREETING_PRESETS = [
  {
    title: '今天也喜欢你，多一点',
    subtitle: '生活不是每天都浪漫，但每天都有你。',
  },
  {
    title: '宇宙很大，但我们很近',
    subtitle: '只要你在身边，连发呆都觉得很有意义。',
  },
  {
    title: '今日份开心来源是你',
    subtitle: '好好吃饭、好好生活，想我的时候就哔卟一声。',
  },
  {
    title: '和你在一起的每天都是纪念日',
    subtitle: '柴米油盐与晨昏朝暮，我只贪恋有你的温度。',
  },
]

export function Home({
  controller,
  navigate,
  demo,
  bibu,
}: {
  controller: SpaceController
  navigate: (page: Page) => void
  demo: boolean
  bibu: BibuAction
}) {
  const space = controller.space!
  const [adding, setAdding] = useState(false),
    [photo, setPhoto] = useState<Photo | null>(null)

  const greetingTitle = space.couple?.greeting_title || '今天也喜欢你，多一点'
  const greetingSubtitle = space.couple?.greeting_subtitle || '生活不是每天都浪漫，但每天都有你。'
  const [editingGreeting, setEditingGreeting] = useState(false)
  const [tempTitle, setTempTitle] = useState(greetingTitle)
  const [tempSubtitle, setTempSubtitle] = useState(greetingSubtitle)
  const { busy, run } = useTask()
  const toast = useToast()

  const now = useNow()
  const events = upcomingEvents(space, now).slice(0, 3)
  const memories = dailyMemories(space.photos, space.couple!.id, now)
  const days = togetherDays(space.couple!.together_since, now)
  const last = space.messages.at(-1)
  const focus = space.focus.find(
    (f) => f.user_id === space.me.id && new Date(f.ends_at).getTime() > now.getTime(),
  )
  return (
    <>
      <PageHeading
        eyebrow="WELCOME TO OUR LITTLE UNIVERSE"
        title={greetingTitle}
        subtitle={greetingSubtitle}
        onEdit={() => {
          setTempTitle(greetingTitle)
          setTempSubtitle(greetingSubtitle)
          setEditingGreeting(true)
        }}
        editLabel="双方均可编辑小宇宙寄语"
      >
        <span className="today-label">
          <Icon name="calendar" size={16} />
          {dateLabel(now)}
          <span>星期{'日一二三四五六'[now.getDay()]}</span>
        </span>
      </PageHeading>
      {editingGreeting && (
        <Modal title="编辑我们的小宇宙寄语" onClose={() => setEditingGreeting(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                const finalTitle = tempTitle.trim() || '今天也喜欢你，多一点'
                const finalSub = tempSubtitle.trim() || '生活不是每天都浪漫，但每天都有你。'
                await controller.updateGreeting(finalTitle, finalSub)
                setEditingGreeting(false)
                toast('寄语已保存，双方小窝实时同步')
              })
            }}
          >
            <label>
              今日主标题
              <input
                required
                maxLength={40}
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                placeholder="输入想对 TA 说的一句话"
              />
            </label>
            <label>
              副标寄语与碎碎念
              <textarea
                rows={3}
                maxLength={100}
                value={tempSubtitle}
                onChange={(e) => setTempSubtitle(e.target.value)}
                placeholder="输入日常心语或情侣密语"
              />
            </label>

            <div>
              <span
                className="micro"
                style={{
                  color: '#687358',
                  marginBottom: '6px',
                  display: 'flex',
                  gap: '5px',
                  alignItems: 'center',
                }}
              >
                <Icon name="spark" size={12} /> 快速换上情侣灵感寄语
              </span>
              <div className="greeting-presets">
                {GREETING_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="greeting-preset-item"
                    onClick={() => {
                      setTempTitle(preset.title)
                      setTempSubtitle(preset.subtitle)
                    }}
                  >
                    <span className="greeting-preset-title">{preset.title}</span>
                    <span className="greeting-preset-sub">{preset.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <Button
                type="button"
                tone="white"
                onClick={() => setEditingGreeting(false)}
                disabled={busy}
              >
                取消
              </Button>
              <Button type="submit" tone="yellow" disabled={busy || !tempTitle.trim()}>
                {busy ? '正在保存…' : '保存寄语'}
                <Icon name="check" size={16} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <div className="home-overview">
        <section className="together-card" aria-label="我们一起走过的日子">
          <div className="card-window-bar">
            <span className="micro">
              <i /> OUR LOVE STORY.EXE
            </span>
            <div aria-hidden="true">— □ ×</div>
          </div>
          <div className="together-content">
            <div className="together-text">
              <span className="hero-label">我们已经一起走过</span>
              <div
                className={`day-counter ${days > 9999 ? 'extra-long' : days > 999 ? 'long' : ''}`}
              >
                <strong>{days}</strong>
                <span>
                  天<small className="micro">DAYS</small>
                </span>
              </div>
              <span className="since-label">
                从 {dateLabel(space.couple!.together_since + 'T00:00:00')} 开始，未完待续{' '}
                <span>↗</span>
              </span>
            </div>
            <div className="hero-pals">
              <span className="love-bubble">
                <Icon name="heart" size={29} />
              </span>
              <Icon name="spark" size={31} className="hero-spark" />
              <div className="pal-ground">
                <PixelPal type={space.me.avatar} outfit={space.me.outfits?.[space.me.avatar]} />
                <PixelPal
                  type={space.partner?.avatar || 'bunny'}
                  outfit={space.partner?.outfits?.[space.partner?.avatar || 'bunny']}
                />
              </div>
              <div className="pal-name">
                <span>{space.me.name}</span>
                <span>×</span>
                <span>{space.partner?.name || '等待加入'}</span>
              </div>
            </div>
            <PixelFlower className="hero-flower" />
          </div>
          <div className="together-footer">
            <span>
              <Icon name="lock" size={12} /> 仅限 {space.me.name} &{' '}
              {space.partner?.name || '另一位玩家'}
            </span>
            <span className="micro">2 PLAYERS · 1 WORLD</span>
          </div>
        </section>
      </div>
      <div className="home-today" aria-label="今天一起做点什么">
        <section className="bibu-card" aria-label="发送想念">
          <div className="bibu-inner">
            <div className="bibu-copy">
              <h2>哔卟一下！</h2>
              <p>戳一下，把想念发射给 TA</p>
            </div>
            <button
              className={`bibu-button ${bibu.busy ? 'pressed' : ''}`}
              disabled={bibu.disabled}
              aria-busy={bibu.busy}
              onClick={() => void bibu.send()}
              aria-label={`发送${bibu.kind}`}
            >
              <Icon name="heart" size={36} />
              <strong>BIBU！</strong>
              <small>{bibu.busy ? '发送中…' : pingFeedback(bibu.kind).label}</small>
            </button>
          </div>
          <details className="home-mood-picker">
            <summary>
              换个心情 <span>{pingFeedback(bibu.kind).label}</span>
            </summary>
            <div className="ping-choices" role="group" aria-label="选择哔卟心情">
              {lovePings.map((item) => (
                <button
                  key={item.kind}
                  aria-pressed={bibu.kind === item.kind}
                  disabled={bibu.busy}
                  onClick={() => bibu.setKind(item.kind)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </details>
          <div className="bibu-bottom">
            <span>✦ {demo ? '演示模式 · 点击预览提醒效果' : '对方需在线 · 声音需先授权'}</span>
            <span>♥</span>
          </div>
        </section>
        <DailyTaskCard
          coupleId={space.couple?.id}
          myUserId={space.me.id}
          partnerUserId={space.partner?.id}
          partnerName={space.partner?.name}
          demo={demo}
          reloadKey={space}
          navigate={navigate}
        />
      </div>
      <section className="home-plans" aria-label="接下来值得期待的日子">
        <div className="home-section-title">
          <h2>
            <Icon name="calendar" />
            接下来，值得期待
          </h2>
          <button className="text-button" onClick={() => navigate('events')}>
            所有期待 <Icon name="arrow" size={14} />
          </button>
        </div>
        {events.length ? (
          <div className="home-events">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
            <button
              className="add-event-card"
              onClick={() => setAdding(true)}
              aria-label="添加新的期待"
            >
              <Icon name="plus" size={24} />
              <span>
                再添一个
                <br />
                小期待
              </span>
            </button>
          </div>
        ) : (
          <button className="empty-add" onClick={() => setAdding(true)}>
            ＋ 写下我们的第一份期待
          </button>
        )}
      </section>
      <div className="home-lower">
        <Panel
          title="今天翻到的回忆"
          className="memories-panel"
          action={
            <button className="text-button" onClick={() => navigate('photos')}>
              去照片墙 <Icon name="arrow" size={14} />
            </button>
          }
        >
          <div className="home-photos">
            {memories.map((p, i) => (
              <PhotoCard photo={p} key={p.id} index={i} onClick={() => setPhoto(p)} />
            ))}
            {!space.photos.length && (
              <Empty title="回忆相册还是空的" description="去照片墙收藏第一个瞬间吧。" />
            )}
          </div>
          <div className="memories-footer">
            <span>把我们的日常，存成永远。</span>
            <span className="micro">LIFE LOOKS BETTER WITH YOU ♡</span>
          </div>
        </Panel>
        <div className="home-side">
          <Panel title="悄悄话" action={<Icon name="chat" size={19} />} className="chat-preview">
            <div className="chat-preview-content">
              <span className="tiny-avatar pink">
                {(() => {
                  const isMe = last?.sender_id === space.me.id
                  const char = isMe ? space.me.avatar : space.partner?.avatar || 'bunny'
                  const outfit = isMe
                    ? space.me.outfits?.[space.me.avatar]
                    : space.partner?.outfits?.[space.partner?.avatar || 'bunny']
                  return <PixelPal type={char} outfit={outfit} />
                })()}
              </span>
              <div>
                <div className="message-meta">
                  <b>
                    {last
                      ? last.sender_id === null
                        ? '已注销玩家'
                        : last.sender_id === space.me.id
                          ? space.me.name
                          : space.partner?.name
                      : '还没有悄悄话'}
                  </b>
                  <time>{last && clock(last.created_at)}</time>
                </div>
                <p>{last?.content || '今天，想对 TA 说些什么？'}</p>
              </div>
            </div>
            <button className="chat-reply" onClick={() => navigate('chat')}>
              回一句甜甜的话…
              <Icon name="send" size={17} />
            </button>
          </Panel>
          <button className="focus-preview" onClick={() => navigate('focus')}>
            <div className="focus-preview-icon">
              <Icon name="focus" size={29} />
            </div>
            <div>
              <h3>{focus ? `正在${focus.activity}` : '各自努力，一起变好'}</h3>
              <p>{focus ? '专注进行中 · 点此查看计时' : '开启专注陪伴，做彼此的加油站'}</p>
            </div>
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
      <details className="home-history">
        <summary>
          最近的哔卟 <span>查看互动记录</span>
        </summary>
        <Panel className="ping-history">
          {space.pings.length ? (
            <ul aria-label="最近哔卟记录">
              {space.pings.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <EventArt value={pingFeedback(item.kind).art} size={28} />
                  <div>
                    <b>
                      {item.sender_id === null
                        ? '已注销玩家'
                        : item.sender_id === space.me.id
                          ? '你'
                          : space.partner?.name || '另一位玩家'}
                    </b>{' '}
                    发来「{item.kind}」
                    <time dateTime={item.created_at}>
                      {dateLabel(item.created_at)} {clock(item.created_at)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>还没有哔卟记录。给 TA 留下一点想念吧。</p>
          )}
          <small>
            {demo
              ? '本地演示记录，不会发送给真实伴侣。'
              : '最近 50 条中展示最新 5 条；记录不代表对方已读或通知已送达。'}
          </small>
        </Panel>
      </details>
      <div className="home-signoff">
        <span className="micro">✳ THIS MUST BE THE PLACE ✳</span>
        <span>宇宙很大，但我的小窝刚好装下你。</span>
      </div>
      {adding && <EventForm controller={controller} onClose={() => setAdding(false)} />}{' '}
      {photo && (
        <PhotoViewer controller={controller} photo={photo} onClose={() => setPhoto(null)} />
      )}
    </>
  )
}
