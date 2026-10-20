export type AdminRole = 'owner' | 'operator' | 'support' | 'maintainer'
export type AdminStatus = 'active' | 'suspended'
export type TicketStatus = 'pending' | 'in_progress' | 'waiting_user' | 'resolved'
export type TicketCategory = 'bug' | 'account' | 'notification' | 'data' | 'privacy' | 'other'
export type DeliveryStatus = 'accepted' | 'failed' | 'skipped' | 'unrecorded'
export type AccountStatus = 'active' | 'banned' | 'deletion_pending'

export type AdminActor = {
  user_id: string
  role: AdminRole
  status: AdminStatus
  display_name: string
  capabilities: string[]
}

export type AuthContextData = {
  authenticated: boolean
  initialized: boolean
  is_admin: boolean
  role: AdminRole | null
  status: AdminStatus | null
  display_name: string
  session_alive: boolean
}

export type AdminSession = {
  actor: AdminActor
  initialized: boolean
  env: string
  server_time: string
}

export type RangeMetrics = {
  new_users: number
  new_couples: number
  mutual_spaces: number
  task_denominator: number
  task_numerator: number
  task_rate: number | null
  task_rate_denominator?: number
  task_rate_numerator?: number
}

export type SeriesPoint = {
  date: string
  new_users: number
  new_couples: number
  mutual_spaces: number
  task_denominator: number
  task_numerator: number
}

export type RecentTicket = {
  id: string
  ticket_no: string
  category: TicketCategory
  status: TicketStatus
  created_at: string
  excerpt: string
}

export type RecentFailure = {
  event_type: 'message' | 'ping'
  event_id: string
  attempts: number
  last_at: string
  error_code: string | null
}

export type OverviewData = {
  timezone: string
  from: string
  to: string
  data_updated_at: string
  current: RangeMetrics
  previous: RangeMetrics & { from: string; to: string }
  series: SeriesPoint[]
  small_sample: boolean
  alerts: {
    ticket_pending: number
    ticket_in_progress: number
    ticket_waiting_user: number
    push_failures_24h: number
    deletion_jobs: number
  }
  recent_tickets: RecentTicket[]
  recent_failures: RecentFailure[] | null
  unavailable: string[]
}

export type MemberBrief = {
  user_id: string
  name: string
  avatar: string
  slot: number
  email_masked: string | null
}

export type UserRow = {
  user_id: string
  name: string
  avatar: string
  email_masked: string | null
  created_at: string
  last_sign_in_at: string | null
  account_status: AccountStatus
  couple_id: string | null
  couple_closed_at: string | null
  couple_member_count: number
  device_count: number
  open_ticket_count: number
}

export type Paged<T> = {
  total: number
  page: number
  page_size: number
  rows: T[]
}

export type UserDevice = {
  id: string
  platform: string
  app_version: string | null
  token_suffix: string
  last_seen_at: string
  created_at: string
  last_delivery_stage: string | null
  last_delivery_at: string | null
}

export type UserNote = {
  id: string
  body: string
  created_at: string
  author_label: string
}

export type UserDetail = {
  user_id: string
  name: string
  avatar: string
  email_masked: string | null
  email_confirmed: boolean
  created_at: string
  last_sign_in_at: string | null
  banned_until: string | null
  account_status: AccountStatus
  couple: {
    id: string
    name: string
    created_at: string
    closed_at: string | null
    members: MemberBrief[]
  } | null
  devices: UserDevice[]
  deletion_job: { status: string; prepared_at: string | null } | null
  notes: UserNote[]
  tickets: Array<{
    id: string
    ticket_no: string
    category: TicketCategory
    status: TicketStatus
    created_at: string
    updated_at: string
  }>
  diagnostics_30d: { attempts: number; failures: number }
}

export type CoupleRow = {
  id: string
  name: string
  together_since: string | null
  created_at: string
  closed_at: string | null
  member_count: number
  members: MemberBrief[]
  messages: number
  pings: number
  photos_in_range: number
  photos_total: number
  tasks_assigned: number
  tasks_single: number
  tasks_double: number
  mutual: boolean
  tickets_open: number
  last_activity_at: string | null
}

export type CoupleDetail = {
  id: string
  name: string
  created_at: string
  closed_at: string | null
  together_since: string | null
  members: Array<MemberBrief & { created_at: string; last_sign_in_at: string | null }>
  stats: {
    messages: number
    pings: number
    photos_in_range: number
    photos_total: number
    tasks_assigned: number
    tasks_single: number
    tasks_double: number
    tickets_open: number
    push_failures_30d: number
  }
  last_activity: {
    message_at: string | null
    ping_at: string | null
    photo_at: string | null
    task_at: string | null
  }
  tickets: Array<{
    id: string
    ticket_no: string
    category: TicketCategory
    status: TicketStatus
    created_at: string
    updated_at: string
  }>
}

export type TicketRow = {
  waiting_since: string | null
  user_replied: boolean
  id: string
  ticket_no: string
  user_id: string
  user_name: string
  email_masked: string | null
  category: TicketCategory
  status: TicketStatus
  created_at: string
  updated_at: string
  resolved_at: string | null
  assigned_admin_id: string | null
  assignee_name: string | null
  excerpt: string
}

export type TicketMessage = {
  id: string
  author_type: 'user' | 'admin' | 'system'
  author_id: string | null
  author_label: string
  visibility: 'user' | 'internal'
  body: string
  created_at: string
}

export type TicketDetail = {
  id: string
  ticket_no: string
  user_id: string
  user_name: string
  email_masked: string | null
  couple_id: string | null
  category: TicketCategory
  description: string
  status: TicketStatus
  client_app_version: string | null
  client_platform: string | null
  assigned_admin_id: string | null
  assignee_name: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  messages: TicketMessage[]
}

export type DeliveryAttempt = {
  request_id: string
  stage: string
  error_code: string | null
  provider_http_status: number | null
  duration_ms: number | null
  token_suffix: string | null
  device_platform: string | null
  recipient_user_id: string | null
  created_at: string
}

export type DiagnosticRow = {
  event_type: 'message' | 'ping'
  event_id: string
  couple_id: string
  sender_id: string | null
  created_at: string
  delivery_status: DeliveryStatus
  attempt_count: number
  accepted_count: number
  failed_count: number
  skipped_count: number
  last_attempt_at: string | null
  duration_ms: number | null
  error_code: string | null
  token_suffix: string | null
  device_platform: string | null
  request_id: string | null
  attempts: DeliveryAttempt[]
}

export type DiagnosticsData = Paged<DiagnosticRow> & {
  collected_stages: string[]
  uncollected_stages: string[]
}

export type AuditRow = {
  id: string
  request_id: string
  actor_id: string | null
  actor_role: string
  actor_label: string
  action: string
  target_type: string
  target_id: string | null
  reason: string | null
  success: boolean
  error_code: string | null
  summary: Record<string, unknown> | null
  created_at: string
}

export type SystemHealth = {
  database: string
  database_time: string
  pg_version: string
  counts: {
    users: number
    couples: number
    open_tickets: number
    push_attempts_24h: number
    push_failures_24h: number
    audit_failures_7d: number
  }
  recent_audit_failures: Array<{
    action: string
    target_type: string
    target_id: string | null
    error_code: string | null
    created_at: string
    request_id: string
  }>
  recent_push_failures: Array<{
    event_type: string
    event_id: string
    attempts: number
    last_at: string
    error_code: string | null
  }>
  diagnostic_retention_days: number
  diagnostic_coverage: {
    collected: string[]
    not_collected: string[]
  }
}

export type AdminMember = {
  user_id: string
  role: AdminRole
  status: AdminStatus
  display_name: string
  created_at: string
  last_seen_at: string | null
  email_masked: string | null
}

export type TicketAction = 'reply' | 'note' | 'status' | 'assign'
