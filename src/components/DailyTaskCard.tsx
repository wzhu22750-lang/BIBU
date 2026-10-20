import { useState } from 'react'
import { Button } from './ui'
import { Icon } from './PixelArt'
import type { Page } from '../lib/types'
import { useDailyTask } from '../hooks/useDailyTask'
import { TASK_TYPE_META } from '../lib/dailyTaskPool'
import { DailyTaskModal } from './DailyTaskModal'
import { DailyTaskHistoryModal } from './DailyTaskHistoryModal'

export function DailyTaskCard({
  coupleId,
  myUserId,
  partnerUserId,
  partnerName,
  demo = false,
  reloadKey,
  navigate,
}: {
  coupleId: string | undefined
  myUserId: string | undefined
  partnerUserId?: string
  partnerName?: string
  demo?: boolean
  reloadKey?: unknown
  navigate?: (page: Page) => void
}) {
  const {
    detail,
    loading,
    busy,
    error,
    history,
    historyLoading,
    streak,
    celebrating,
    dismissCelebration,
    completeTask,
    loadHistory,
  } = useDailyTask({
    coupleId,
    myUserId,
    partnerUserId,
    demo,
    reloadKey,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (loading && !detail) {
    return (
      <section className="daily-task-card loading-state" aria-busy="true">
        <div className="card-window-bar">
          <span className="micro">今日小任务</span>
        </div>
        <div className="daily-task-content">
          <p className="task-state-copy" role="status">
            正在准备今天的专属任务…
          </p>
        </div>
      </section>
    )
  }

  if (!detail) {
    return (
      <section className="daily-task-card">
        <div className="card-window-bar">
          <span className="micro">今日小任务</span>
        </div>
        <div className="daily-task-content">
          <p className="task-state-copy" role="status">
            {coupleId ? error || '今日任务稍后就绪' : '绑定空间后即可开启每日互动任务'}
          </p>
        </div>
      </section>
    )
  }

  const { task, isCompletedByMe, isCompletedByPartner, isAllCompleted } = detail
  const meta = TASK_TYPE_META[task.task_type] || {
    label: '日常互动',
    icon: 'heart',
    tone: 'yellow' as const,
  }

  return (
    <>
      <section className="daily-task-card" aria-label="今日小任务" data-completed={isAllCompleted}>
        {celebrating && (
          <div
            className="celebration-particles"
            aria-hidden="true"
            onAnimationEnd={dismissCelebration}
          >
            <span className="particle p1">✦</span>
            <span className="particle p2">♥</span>
            <span className="particle p3">★</span>
            <span className="particle p4">
              <Icon name="spark" size={14} />
            </span>
            <span className="particle p5">✦</span>
            <span className="particle p6">♥</span>
          </div>
        )}

        <div className="card-window-bar">
          <span className="micro">
            <strong className="task-section-label">今日小任务</strong>
            <time dateTime={task.task_date}>{task.task_date}</time>
          </span>
          <button
            type="button"
            className="history-trigger-link"
            onClick={() => {
              void loadHistory()
              setHistoryOpen(true)
            }}
            aria-label="查看每日任务历史记录"
          >
            <span>任务历史</span>
            <Icon name="arrow" size={12} />
          </button>
        </div>

        <div className="daily-task-content">
          <div className="daily-task-header-row">
            <span className={`daily-task-badge tone-${meta.tone}`}>
              <Icon name={meta.icon as any} size={14} />
              {meta.label}
            </span>
            {streak.currentStreak > 1 && (
              <span className="streak-pill micro">
                <Icon name="spark" size={12} />
                连续 {streak.currentStreak} 天
              </span>
            )}
          </div>

          <div className="daily-task-summary">
            <h3 className="daily-task-title">{task.title}</h3>
            {task.description && <p className="daily-task-description">{task.description}</p>}
          </div>

          {/* 双方完成状态栏 */}
          <div className="daily-task-players-status">
            <div className={`player-status-col ${isCompletedByMe ? 'done' : 'waiting'}`}>
              <span className="status-label">你</span>
              <span className="status-mark">
                {isCompletedByMe ? (
                  <>
                    <Icon name="check" size={14} /> 已完成
                  </>
                ) : (
                  '○ 待完成'
                )}
              </span>
            </div>

            <div className="status-divider" />

            <div className={`player-status-col ${isCompletedByPartner ? 'done' : 'waiting'}`}>
              <span className="status-label">{partnerName || '对方'}</span>
              <span className="status-mark">
                {isCompletedByPartner ? (
                  <>
                    <Icon name="check" size={14} /> 已完成
                  </>
                ) : (
                  '○ 待完成'
                )}
              </span>
            </div>
          </div>

          {/* 双方皆完成的温情横幅 */}
          {isAllCompleted ? (
            <div className="both-completed-banner">
              <div className="banner-icon">
                <Icon name="spark" size={20} />
              </div>
              <div className="banner-text">
                <strong>今日任务完成！</strong>
                <p>你们今天又完成了一件小事。</p>
              </div>
            </div>
          ) : null}

          {/* 底部行动按钮 */}
          <div className="daily-task-actions">
            <span className="task-progress" role="status">
              {isAllCompleted
                ? '两人都已完成'
                : isCompletedByMe
                  ? '已完成，等 TA 一起'
                  : '今日待完成'}
              <small>{Number(isCompletedByMe) + Number(isCompletedByPartner)} / 2 人完成</small>
            </span>
            <Button
              tone={isCompletedByMe ? 'white' : 'yellow'}
              onClick={() => setModalOpen(true)}
              disabled={busy}
              className="daily-task-action-btn"
            >
              {isCompletedByMe ? (
                <>
                  查看详情 / 修改 <Icon name="arrow" size={16} />
                </>
              ) : (
                <>
                  去完成 <Icon name="heart" size={16} />
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* 完成任务弹窗 */}
      {modalOpen && (
        <DailyTaskModal
          detail={detail}
          partnerName={partnerName}
          busy={busy}
          onComplete={completeTask}
          onClose={() => setModalOpen(false)}
          navigate={navigate}
        />
      )}

      {/* 历史记录弹窗 */}
      {historyOpen && (
        <DailyTaskHistoryModal
          history={history}
          streak={streak}
          partnerName={partnerName}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  )
}
