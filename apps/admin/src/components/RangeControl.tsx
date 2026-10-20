import { useEffect, useState, type FormEvent } from 'react'
import { Button } from './ui'
import { Icon } from './Icon'
import { addDays, businessToday, daySpan, isValidDate } from '../lib/format'

export function RangeControl({
  from,
  to,
  onChange,
  maxDays = 92,
  presetDays = [7, 30, 90],
  disabled = false,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  maxDays?: number
  presetDays?: number[]
  disabled?: boolean
}) {
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftFrom(from)
    setDraftTo(to)
    setError('')
  }, [from, to])

  const days = daySpan(from, to) + 1

  function apply(nextFrom: string, nextTo: string) {
    if (!isValidDate(nextFrom) || !isValidDate(nextTo)) {
      setError('请选择有效日期')
      return
    }
    const span = daySpan(nextFrom, nextTo)
    if (span < 0) {
      setError('结束日期不能早于开始日期')
      return
    }
    if (span + 1 > maxDays) {
      setError(`日期范围不能超过 ${maxDays} 天`)
      return
    }
    setError('')
    onChange(nextFrom, nextTo)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    apply(draftFrom, draftTo)
  }

  function preset(daysBack: number) {
    const end = businessToday()
    const start = addDays(end, -(daysBack - 1))
    setDraftFrom(start)
    setDraftTo(end)
    setError('')
    onChange(start, end)
  }

  return (
    <form className="range-control" onSubmit={submit}>
      <div className="range-presets" role="group" aria-label="快捷日期范围">
        {presetDays.map((daysBack) => (
          <button
            key={daysBack}
            type="button"
            className={days === daysBack ? 'chip chip-active' : 'chip'}
            disabled={disabled}
            onClick={() => preset(daysBack)}
          >
            近 {daysBack} 天
          </button>
        ))}
      </div>
      <label className="date-field">
        <span>开始</span>
        <input
          type="date"
          value={draftFrom}
          max={businessToday()}
          disabled={disabled}
          onChange={(event) => setDraftFrom(event.target.value)}
        />
      </label>
      <span className="range-dash" aria-hidden="true">
        –
      </span>
      <label className="date-field">
        <span>结束</span>
        <input
          type="date"
          value={draftTo}
          max={businessToday()}
          disabled={disabled}
          onChange={(event) => setDraftTo(event.target.value)}
        />
      </label>
      <Button type="submit" size="sm" tone="secondary" icon="calendar" disabled={disabled}>
        应用
      </Button>
      <span className="range-summary">
        <Icon name="calendar" size={13} />
        北京时间 · 共 {days} 天
      </span>
      {error && (
        <span className="range-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
