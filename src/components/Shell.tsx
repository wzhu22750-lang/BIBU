import { BottomNav } from './BottomNav'
import type { BibuAction } from '../hooks/useBibu'
import type { ReactNode } from 'react'
import { Icon, PixelPal } from './PixelArt'
import type { IconName } from './PixelArt'
import type { Page, Space } from '../lib/types'
const nav: { page: Page; name: string; en: string; icon: IconName }[] = [
  { page: 'home', name: '我们的小窝', en: 'OUR SPACE', icon: 'home' },
  { page: 'chat', name: '悄悄话', en: 'LOVE CHAT', icon: 'chat' },
  { page: 'events', name: '值得期待', en: 'SPECIAL DAYS', icon: 'calendar' },
  { page: 'photos', name: '照片墙', en: 'MEMORY WALL', icon: 'photo' },
  { page: 'focus', name: '专注陪伴', en: 'FOCUS TOGETHER', icon: 'focus' },
  { page: 'wardrobe', name: '萌宠衣橱', en: 'PET WARDROBE', icon: 'shirt' },
]
export function Shell({
  page,
  navigate,
  space,
  demo,
  connection,
  bibu,
  children,
}: {
  page: Page
  navigate: (page: Page) => void
  space: Space
  demo: boolean
  connection: string
  bibu: BibuAction
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('home')} aria-label="BIBU！首页">
          <span className="brand-word">
            BIBU<span>!</span>
            <i>
              <Icon name="spark" size={20} />
            </i>
          </span>
          <span className="brand-cn">哔 卟 哔 卟</span>
        </button>
        <div className="sidebar-rule">
          <span className="micro">A SPACE FOR TWO</span>
          <Icon name="heart" size={13} />
        </div>
        <nav aria-label="主导航">
          {nav.map((item) => (
            <button
              key={item.page}
              onClick={() => navigate(item.page)}
              aria-current={page === item.page ? 'page' : undefined}
              className={`nav-item ${page === item.page ? 'active' : ''}`}
            >
              <Icon name={item.icon} />
              <span>
                {item.name}
                <small className="micro">{item.en}</small>
              </span>
              {page === item.page && <span className="nav-cursor">›</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-world">
            <div className="mini-world-label micro">PLAYER 01 + PLAYER 02</div>
            <div className="mini-pals">
              <PixelPal type={space.me.avatar} outfit={space.me.outfits?.[space.me.avatar]} />
              <Icon name="heart" size={22} />
              <PixelPal
                type={space.partner?.avatar || 'bunny'}
                outfit={space.partner?.outfits?.[space.partner?.avatar || 'bunny']}
              />
            </div>
            <strong>两个人，一整个宇宙。</strong>
            <span className="status-line">
              <i />
              {space.partner ? '专属双人空间' : '等待另一位玩家'}
            </span>
          </div>
          <button
            aria-current={page === 'settings' ? 'page' : undefined}
            className={`settings-nav ${page === 'settings' ? 'selected' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Icon name="settings" size={19} />
            空间设置<small>↗</small>
          </button>
          <span className="sidebar-footer micro">MADE FOR US. ONLY US.</span>
        </div>
      </aside>
      <div className={`main-wrap page-wrap-${page}`}>
        <header className="topbar">
          <span className="topbar-caption">
            <Icon name="star" size={15} /> BIBU！
          </span>
          <div className="topbar-right">
            <button
              className={`connection-tag ${demo ? 'demo' : ''}`}
              onClick={() => navigate('settings')}
            >
              <span />
              {connection}
            </button>
            <span className="topbar-divider" />
            <button
              className="profile-button"
              onClick={() => navigate('settings')}
              aria-label="个人资料与空间设置"
            >
              <span className="tiny-avatar">
                <PixelPal type={space.me.avatar} outfit={space.me.outfits?.[space.me.avatar]} />
              </span>
              <b>{space.me.name}</b>
              <span>⌄</span>
            </button>
          </div>
        </header>
        <main id="main" key={page} tabIndex={-1} className={`page-${page}`}>
          {children}
        </main>
        <footer className="main-footer">
          <span className="micro">YOU + ME = A LITTLE UNIVERSE</span>
          <span>
            私密空间 · 只对彼此开放 <Icon name="lock" size={12} />
          </span>
          <span className="micro">BUILD {__BIBU_BUILD__.commit}</span>
        </footer>
      </div>
      <BottomNav page={page} navigate={navigate} bibu={bibu} />
    </div>
  )
}
