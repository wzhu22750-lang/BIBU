import { useEffect, useRef, useState } from 'react'
import type { SeriesPoint } from '../lib/types'
import { formatNumber, formatShortDay } from '../lib/format'

export type TrendMetric = 'new_users' | 'new_couples' | 'mutual_spaces' | 'task_rate'

const H = 240
const PAD = { top: 18, right: 22, bottom: 34, left: 48 }

function pointValue(point: SeriesPoint, metric: TrendMetric): number | null {
  if (metric === 'task_rate') {
    return point.task_denominator > 0 ? (point.task_numerator / point.task_denominator) * 100 : null
  }
  return point[metric]
}

export function TrendChart({
  series,
  metric,
  emptyText = '所选区间没有可绘制数据',
}: {
  series: SeriesPoint[]
  metric: TrendMetric
  emptyText?: string
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  useEffect(() => {
    const element = chartRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [series.length])

  const values = series.map((point) => pointValue(point, metric))
  const finite = values.filter((value): value is number => value !== null)
  if (series.length === 0) {
    return <div className="chart-empty">{emptyText}</div>
  }
  const rawMax = Math.max(...finite, metric === 'task_rate' ? 100 : 1)
  const max = metric === 'task_rate' ? 100 : Math.max(1, rawMax * 1.15)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0
  const x = (index: number) => PAD.left + (series.length > 1 ? index * stepX : innerW / 2)
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH

  const segments: Array<Array<{ x: number; y: number; index: number; value: number }>> = []
  let current: Array<{ x: number; y: number; index: number; value: number }> = []
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current)
      current = []
      return
    }
    current.push({ x: x(index), y: y(value), index, value })
  })
  if (current.length) segments.push(current)

  const labelIndexes = new Set<number>()
  if (series.length <= 6) {
    series.forEach((_, index) => labelIndexes.add(index))
  } else {
    for (let i = 0; i < 5; i += 1) {
      labelIndexes.add(Math.round((i * (series.length - 1)) / 4))
    }
  }

  const unit = metric === 'task_rate' ? '%' : ''
  const gridValues =
    metric === 'task_rate' ? [0, 25, 50, 75, 100] : [0, 0.25, 0.5, 0.75, 1].map((p) => max * p)

  return (
    <div className="trend-chart" ref={chartRef}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`趋势图，共 ${series.length} 天，最高值 ${formatNumber(Math.max(...finite, 0))}${unit}`}
        preserveAspectRatio="none"
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="chart-grid"
            />
            <text x={PAD.left - 8} y={y(value) + 4} className="chart-axis" textAnchor="end">
              {metric === 'task_rate' ? `${Math.round(value)}%` : formatNumber(Math.round(value))}
            </text>
          </g>
        ))}
        {segments.map((segment, index) => (
          <g key={index}>
            {segment.length > 1 && (
              <polygon
                className="chart-area"
                points={`${segment[0].x},${y(0)} ${segment.map((point) => `${point.x},${point.y}`).join(' ')} ${segment[segment.length - 1].x},${y(0)}`}
              />
            )}
            {segment.length > 1 && (
              <polyline
                className="chart-line"
                points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
              />
            )}
            {segment.map((point) => (
              <g key={point.index}>
                <circle className="chart-dot" cx={point.x} cy={point.y} r={3.4}>
                  <title>
                    {series[point.index].date} · {formatNumber(Number(point.value.toFixed(1)))}
                    {unit}
                  </title>
                </circle>
              </g>
            ))}
          </g>
        ))}
        {series.map((point, index) =>
          labelIndexes.has(index) ? (
            <text
              key={point.date}
              x={x(index)}
              y={H - 10}
              className="chart-axis"
              textAnchor="middle"
            >
              {formatShortDay(point.date)}
            </text>
          ) : null,
        )}
      </svg>
      <details className="chart-data">
        <summary>查看图表数据表</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>数值</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point, index) => (
                <tr key={point.date}>
                  <td>{point.date}</td>
                  <td>
                    {values[index] === null
                      ? '无任务样本'
                      : `${formatNumber(Number(values[index]!.toFixed(1)))}${unit}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
