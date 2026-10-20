import { useRef } from 'react'

export type OperationMetadata = {
  idempotency_key?: string
  request_id?: string
  current_request_id?: string
  replayed?: boolean
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${entries.join(',')}}`
}

// 一次逻辑提交对应一个幂等键：内容不变时，网络失败/响应丢失后的重试复用同一键；
// 内容改变或上次已明确成功后才换新键。不要把键持久化到 localStorage，避免工单正文
// 或备注内容以另一种形式长期留在浏览器。
export class LogicalSubmission {
  private key: string | null = null
  private fingerprint = ''

  begin(payload: unknown): string {
    const fingerprint = stableStringify(payload)
    if (!this.key || fingerprint !== this.fingerprint) {
      this.key = crypto.randomUUID()
      this.fingerprint = fingerprint
    }
    return this.key
  }

  succeed() {
    this.key = null
    this.fingerprint = ''
  }

  get pending(): boolean {
    return this.key !== null
  }
}

export function useLogicalSubmission(): LogicalSubmission {
  const ref = useRef<LogicalSubmission | null>(null)
  if (!ref.current) ref.current = new LogicalSubmission()
  return ref.current
}

export function operationMetadata(value: unknown): OperationMetadata | null {
  if (!value || typeof value !== 'object') return null
  const operation = (value as { operation?: unknown }).operation
  if (!operation || typeof operation !== 'object') return null
  return operation as OperationMetadata
}

export function withRequestId(message: string, value: unknown): string {
  const operation = operationMetadata(value)
  if (!operation?.request_id) return message
  const prefix = operation.replayed ? '此前已提交成功' : '已完成'
  return `${message} · ${prefix}，请求 ${operation.request_id}`
}
