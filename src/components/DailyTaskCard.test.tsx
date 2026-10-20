import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DailyTaskCard } from './DailyTaskCard'
import { DailyTaskModal } from './DailyTaskModal'
import { DailyTaskHistoryModal } from './DailyTaskHistoryModal'
import type { DailyTaskDetail, DailyTaskHistoryItem, DailyTaskStreak } from '../lib/dailyTaskTypes'

describe('DailyTask UI components', () => {
  const mockTask = {
    id: 'task-123',
    couple_id: 'couple-1',
    task_date: '2026-09-09',
    title: '给对方发一句不能超过 10 个字的话',
    description: '字数很短，但装满了想念。',
    task_type: 'interaction' as const,
    created_at: '2026-09-09T08:00:00Z',
  }

  it('renders DailyTaskCard with initial state', () => {
    const html = renderToStaticMarkup(
      <DailyTaskCard
        coupleId="demo"
        myUserId="user-me"
        partnerUserId="user-partner"
        partnerName="小桃"
        demo={true}
      />,
    )
    expect(html).toContain('今日小任务')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('正在准备今天的专属任务')
  })

  it('renders DailyTaskModal with task information and form', () => {
    const mockDetail: DailyTaskDetail = {
      task: mockTask,
      myCompletion: null,
      partnerCompletion: null,
      isCompletedByMe: false,
      isCompletedByPartner: false,
      isAllCompleted: false,
    }

    const html = renderToStaticMarkup(
      <DailyTaskModal
        detail={mockDetail}
        partnerName="小桃"
        busy={false}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('今日小任务')
    expect(html).toContain('给对方发一句不能超过 10 个字的话')
    expect(html).toContain('字数很短，但装满了想念。')
    expect(html).toContain('小桃：')
    expect(html).toContain('等待完成中')
    expect(html).toContain('完成今日任务')
  })

  it('renders DailyTaskModal with completed partner answer', () => {
    const mockDetail: DailyTaskDetail = {
      task: mockTask,
      myCompletion: {
        id: 'c-me',
        couple_id: 'couple-1',
        task_id: 'task-123',
        user_id: 'user-me',
        completed_at: '2026-09-09T09:00:00Z',
        optional_content: '今天也很想你',
      },
      partnerCompletion: {
        id: 'c-partner',
        couple_id: 'couple-1',
        task_id: 'task-123',
        user_id: 'user-partner',
        completed_at: '2026-09-09T09:30:00Z',
        optional_content: '晚上见哦！',
      },
      isCompletedByMe: true,
      isCompletedByPartner: true,
      isAllCompleted: true,
    }

    const html = renderToStaticMarkup(
      <DailyTaskModal
        detail={mockDetail}
        partnerName="小桃"
        busy={false}
        onComplete={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('已完成')
    expect(html).toContain('TA 的回答：')
    expect(html).toContain('晚上见哦！')
    expect(html).toContain('更新回答')
  })

  it('renders DailyTaskHistoryModal with streak and history entries', () => {
    const mockStreak: DailyTaskStreak = {
      currentStreak: 5,
      totalCompletedDays: 12,
      lastCompletedDate: '2026-09-09',
    }

    const mockHistory: DailyTaskHistoryItem[] = [
      {
        task: mockTask,
        myCompletion: {
          id: 'c1',
          couple_id: 'couple-1',
          task_id: 'task-123',
          user_id: 'user-me',
          completed_at: '',
          optional_content: '回答 1',
        },
        partnerCompletion: {
          id: 'c2',
          couple_id: 'couple-1',
          task_id: 'task-123',
          user_id: 'user-partner',
          completed_at: '',
          optional_content: '回答 2',
        },
        isAllCompleted: true,
      },
    ]

    const html = renderToStaticMarkup(
      <DailyTaskHistoryModal
        history={mockHistory}
        streak={mockStreak}
        partnerName="小桃"
        loading={false}
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('每日任务历史')
    expect(html).toContain('连续互动')
    expect(html).toContain('5')
    expect(html).toContain('累计完成')
    expect(html).toContain('12')
    expect(html).toContain('共同完成')
    expect(html).toContain('你的回答：回答 1')
    expect(html).toContain('小桃的回答：回答 2')
  })
})
