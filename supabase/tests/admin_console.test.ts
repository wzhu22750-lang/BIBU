import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

let pg: PGlite
const A = '10000000-0000-0000-0000-000000000001'
const B = '10000000-0000-0000-0000-000000000002'
const C = '10000000-0000-0000-0000-000000000003'
const D = '10000000-0000-0000-0000-000000000004'
const E = '10000000-0000-0000-0000-000000000005'
const F = '10000000-0000-0000-0000-000000000006'
const G = '10000000-0000-0000-0000-000000000007'
const SESSION_A = '20000000-0000-0000-0000-000000000001'
const SESSION_B = '20000000-0000-0000-0000-000000000002'
const REQUEST = '30000000-0000-0000-0000-000000000001'
const TICKET_KEY = '30000000-0000-0000-0000-000000000020'
const MESSAGE_A = '40000000-0000-0000-0000-000000000001'
const MESSAGE_B = '40000000-0000-0000-0000-000000000002'
const DEVICE_A = '50000000-0000-0000-0000-000000000001'
const FULL_TOKEN = 'secret-full-token-abcdefgh12345678'
let code: string
let couple: string
let otherCouple: string
let ticketId: string
let taskId: string

function parse<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}
async function asUser(id: string) {
  await pg.exec('reset role; set role authenticated;')
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id])
}
async function asService() {
  await pg.exec('reset role; set role service_role;')
  await pg.query(`select set_config('request.jwt.claim.sub', '', false)`)
}
async function asRoot() {
  await pg.exec('reset role;')
}
async function scalar<T = unknown>(sql: string, args: unknown[] = []) {
  const result = await pg.query<Record<string, unknown>>(sql, args)
  return Object.values(result.rows[0])[0] as T
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    create table auth.users(
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      created_at timestamptz not null default now(),
      last_sign_in_at timestamptz,
      banned_until timestamptz
    );
    create table auth.sessions(
      id uuid primary key,
      user_id uuid not null,
      not_after timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'),1)-1]
    $$;
    alter table storage.objects enable row level security;
    grant usage on schema auth, public, storage to authenticated, anon, service_role;
    grant select, insert, delete on storage.objects to authenticated;
    create publication supabase_realtime;
  `)
  const files = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .filter(
      (file) =>
        file < '202609220000' ||
        file === '202610200001_admin_console.sql' ||
        file === '202610200002_admin_hardening.sql' ||
        file === '20261020110436_admin_workflow.sql' ||
        file === '20261020111834_admin_waiting_since.sql' ||
        file === '20261020122206_admin_information_architecture.sql' ||
        file === '20261020123629_admin_record_scope.sql',
    )
    .sort()
  for (const file of files) {
    await pg.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
}, 60000)

afterAll(async () => {
  await pg?.close()
})

describe.sequential('admin console database boundary', () => {
  it('seeds real-ish users and a private two-player space', async () => {
    await asRoot()
    await pg.query(
      `insert into auth.users(id,email,email_confirmed_at,created_at) values
        ($1,'alice@example.com',now(),'2026-09-01T00:00:00Z'),
        ($2,'bob@example.com',now(),'2026-09-01T00:10:00Z'),
        ($3,'carol@example.com',now(),'2026-09-01T00:20:00Z'),
        ($4,'dave@example.com',now(),'2026-09-01T00:30:00Z'),
        ($5,'eve@example.com',now(),'2026-10-20T01:00:00Z'),
        ($6,'frank@example.com',now(),'2026-10-19T15:30:00Z'),
        ($7,'grace@example.com',now(),'2026-10-19T16:30:00Z')`,
      [A, B, C, D, E, F, G],
    )
    await pg.query(
      `insert into auth.sessions(id,user_id,not_after) values
        ($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')`,
      [SESSION_A, A, SESSION_B, B],
    )
    await asUser(A)
    code = (await scalar('select public.create_space()')) as string
    couple = (await scalar('select public.my_couple_id()')) as string
    await asUser(B)
    await pg.query('select public.join_space($1)', [code])
    await asUser(C)
    await pg.query('select public.create_space()')
    otherCouple = (await scalar('select public.my_couple_id()')) as string
    await asRoot()
    expect(await scalar('select count(*)::int from public.profiles')).toBe(7)
    expect(code).toMatch(/^[0-9a-f]{32}$/)
  })

  it('keeps every admin table and RPC closed to normal authenticated users', async () => {
    await asUser(A)
    for (const table of [
      'admin_members',
      'admin_user_notes',
      'admin_audit_logs',
      'admin_idempotency_keys',
      'support_tickets',
      'support_ticket_messages',
      'notification_delivery_logs',
    ]) {
      await expect(pg.query(`select * from public.${table}`)).rejects.toThrow()
    }
    await expect(pg.query('select public.admin_bootstrap_status()')).rejects.toThrow()
    await expect(
      pg.query('select public.admin_overview($1,current_date,current_date)', [A]),
    ).rejects.toThrow()
    await expect(
      pg.query(
        `select public.record_notification_delivery($1,'message',$2,$3,$4,'getui','android','12345678','provider_accepted',null,200,10)`,
        [REQUEST, MESSAGE_A, couple, B],
      ),
    ).rejects.toThrow()
    await asService()
    await expect(pg.query('select * from public.admin_members')).rejects.toThrow()
  })

  it('bootstraps exactly one owner and checks session validity', async () => {
    await asService()
    const status = parse<{ initialized: boolean }>(
      await scalar('select public.admin_bootstrap_status()'),
    )
    expect(status.initialized).toBe(false)
    const owner = parse<{ role: string }>(
      await scalar(`select public.admin_bootstrap_owner($1,'运营负责人')`, [A]),
    )
    expect(owner.role).toBe('owner')
    await expect(pg.query(`select public.admin_bootstrap_owner($1,'第二个')`, [B])).rejects.toThrow(
      '已初始化',
    )

    const actor = parse<Record<string, unknown>>(
      await scalar('select public.admin_actor($1,$2)', [A, SESSION_A]),
    )
    expect(actor.role).toBe('owner')
    expect(actor.session_alive).toBe(true)
    expect(actor.capabilities).toContain('admins.manage')
    const stale = parse<Record<string, unknown>>(
      await scalar('select public.admin_actor($1,$2)', [A, SESSION_B]),
    )
    expect(stale.session_alive).toBe(false)
  })

  it('enforces role capabilities and blocks self-escalation', async () => {
    await asService()
    const created = parse<{ member: { role: string } }>(
      await scalar(
        `select public.admin_upsert_member($1,$2,$3,'support','active','小助手','配置客服角色','req-member-1')`,
        [REQUEST, A, B],
      ),
    )
    expect(created.member.role).toBe('support')
    const support = parse<Record<string, unknown>>(
      await scalar('select public.admin_actor($1,$2)', [B, SESSION_B]),
    )
    expect(support.role).toBe('support')
    expect(support.capabilities).not.toContain('audit.read')
    expect(support.capabilities).not.toContain('diagnostics.read')

    const users = parse<{ total: number }>(
      await scalar(`select public.admin_list_users($1,'','name',1,10,'created_at_desc','all')`, [
        B,
      ]),
    )
    expect(users.total).toBe(7)
    await expect(
      pg.query(
        `select public.admin_list_users($1,'alice@example.com','email',1,10,'created_at_desc','all')`,
        [B],
      ),
    ).rejects.toThrow('不能按账号邮箱检索')
    await expect(
      pg.query(`select public.admin_list_audit($1,'','all',null,null,1,10)`, [B]),
    ).rejects.toThrow('无权')
    await expect(
      pg.query(
        `select public.admin_list_diagnostics($1,current_date,current_date,'all','all',1,10)`,
        [B],
      ),
    ).rejects.toThrow('无权')
    await expect(pg.query(`select public.admin_system_health($1)`, [B])).rejects.toThrow('无权')
    await expect(
      pg.query(
        `select public.admin_upsert_member($1,$2,$2,'owner','active','自提权限','越权测试','req-member-2')`,
        [REQUEST, B],
      ),
    ).rejects.toThrow('无权')
  })

  it('keeps user tickets private and internal notes out of the user view', async () => {
    await asUser(A)
    const ticket = parse<Record<string, unknown>>(
      await scalar(
        `select public.create_support_ticket('bug','这是用户提交的测试反馈内容，至少十个字','1.2.3','web')`,
      ),
    )
    ticketId = ticket.id as string
    expect(ticket.ticket_no).toMatch(/^BIBU-\d{8}-\d{5}$/)
    expect(ticket.status).toBe('pending')

    await asUser(C)
    expect(await scalar('select public.my_support_ticket($1)', [ticketId])).toBeNull()
    expect(parse<unknown[]>(await scalar('select public.my_support_tickets()'))).toHaveLength(0)

    await asService()
    const list = parse<{ total: number }>(
      await scalar(`select public.admin_list_tickets($1,'open','all','',1,20,'updated_desc')`, [A]),
    )
    expect(list.total).toBe(1)
    const replied = parse<{ ticket: { status: string } }>(
      await scalar(
        `select public.admin_ticket_action($1,$2,$3,'reply','已收到反馈','我们正在排查这个问题',null,null,'req-ticket-reply-1')`,
        [TICKET_KEY, A, ticketId],
      ),
    )
    expect(replied.ticket.status).toBe('waiting_user')
    await pg.query(
      `select public.admin_ticket_action($1,$2,$3,'note','内部排查','用户不可见的内部备注',null,null,'req-ticket-note-1')`,
      ['30000000-0000-0000-0000-000000000002', A, ticketId],
    )

    await asUser(A)
    const mine = parse<{ status: string; messages: { body: string }[] }>(
      await scalar('select public.my_support_ticket($1)', [ticketId]),
    )
    expect(mine.status).toBe('waiting_user')
    expect(mine.messages.map((message) => message.body)).toContain('我们正在排查这个问题')
    expect(JSON.stringify(mine)).not.toContain('用户不可见的内部备注')
    const afterReply = parse<{ status: string }>(
      await scalar(`select public.reply_my_support_ticket($1,'补充一下复现步骤和截图时间')`, [
        ticketId,
      ]),
    )
    expect(afterReply.status).toBe('pending')

    await asService()
    await pg.query(
      `select public.admin_ticket_action($1,$2,$3,'status','开始处理','处理中','in_progress',null,'req-ticket-status-1')`,
      ['30000000-0000-0000-0000-000000000003', A, ticketId],
    )
    const reopened = parse<{ ticket: { status: string } }>(
      await scalar(
        `select public.admin_ticket_action($1,$2,$3,'status','处理完成','已解决','resolved',null,'req-ticket-status-2')`,
        ['30000000-0000-0000-0000-000000000004', A, ticketId],
      ),
    )
    expect(reopened.ticket.status).toBe('resolved')
    await expect(
      pg.query(
        `select public.admin_ticket_action($1,$2,$3,'reply','已解决','不能再回复',null,null,'req-ticket-reply-2')`,
        ['30000000-0000-0000-0000-000000000005', A, ticketId],
      ),
    ).rejects.toThrow('已解决')
    await asUser(A)
    await expect(
      pg.query(`select public.reply_my_support_ticket($1,'已解决后继续回复')`, [ticketId]),
    ).rejects.toThrow('已解决')
  })

  it('writes audit rows, rejects mutation, and replays idempotent writes', async () => {
    await asService()
    const key = '30000000-0000-0000-0000-000000000010'
    const first = parse<{ note: { id: string } }>(
      await scalar(
        `select public.admin_add_user_note($1,$2,$3,'用户反馈网络问题，已记录待跟进','记录客服备注','req-note-1')`,
        [key, A, D],
      ),
    )
    const replay = parse<{ note: { id: string }; operation: Record<string, unknown> }>(
      await scalar(
        `select public.admin_add_user_note($1,$2,$3,'用户反馈网络问题，已记录待跟进','记录客服备注','req-note-2')`,
        [key, A, D],
      ),
    )
    expect(replay.note.id).toBe(first.note.id)
    expect(replay.operation).toMatchObject({ request_id: 'req-note-1', replayed: true })
    await expect(
      pg.query(
        `select public.admin_add_user_note($1,$2,$3,'不同的内容但复用同一幂等键','记录客服备注','req-note-3')`,
        [key, A, D],
      ),
    ).rejects.toThrow('不匹配')
    await asRoot()
    const noteCount = await scalar<number>(
      'select count(*)::int from public.admin_user_notes where user_id = $1',
      [D],
    )
    expect(noteCount).toBe(1)

    const auditCount = await scalar<number>(
      `select count(*)::int from public.admin_audit_logs where action in ('user.note.create','ticket.reply','ticket.note','ticket.status')`,
    )
    expect(auditCount).toBeGreaterThanOrEqual(4)
    await expect(
      pg.query(
        `update public.admin_audit_logs set reason = '篡改' where action = 'user.note.create'`,
      ),
    ).rejects.toThrow('不可修改')
    await expect(
      pg.query(`delete from public.admin_audit_logs where action = 'user.note.create'`),
    ).rejects.toThrow('不可修改')

    await asService()
    await pg.query(
      `select public.admin_record_failure($1,$2,'user.note.create','user',$3,'模拟失败','TEST_FAILURE',$4)`,
      ['request-failure-1', A, D, '30000000-0000-0000-0000-000000000099'],
    )
    const failed = parse<{
      total: number
      rows: { success: boolean; error_code: string; request_id: string; summary: any }[]
    }>(
      await scalar(`select public.admin_list_audit($1,'TEST_FAILURE','failure',null,null,1,10)`, [
        A,
      ]),
    )
    expect(failed.total).toBe(1)
    expect(failed.rows[0].success).toBe(false)
    expect(failed.rows[0].error_code).toBe('TEST_FAILURE')
    expect(failed.rows[0].request_id).toBe('request-failure-1')
    expect(failed.rows[0].summary.idempotency_key).toBe('30000000-0000-0000-0000-000000000099')

    await asRoot()
    const successAudit = (
      await pg.query<{ total: number; request_id: string }>(
        `select count(*)::int as total, min(request_id) as request_id
         from public.admin_audit_logs
         where action = 'user.note.create' and summary->>'idempotency_key' = $1`,
        [key],
      )
    ).rows[0]
    expect(successAudit.total).toBe(1)
    expect(successAudit.request_id).toBe('req-note-1')
  })

  it('用户工单创建与回复的幂等严格绑定用户、操作和内容', async () => {
    await asUser(A)
    const createKey = '30000000-0000-0000-0000-000000000030'
    const first = parse<{ id: string; messages: unknown[] }>(
      await scalar(
        `select public.create_support_ticket_v2($1,'bug','用户幂等测试反馈内容至少十个字','1.0.0','web')`,
        [createKey],
      ),
    )
    const replay = parse<{ id: string }>(
      await scalar(
        `select public.create_support_ticket_v2($1,'bug','用户幂等测试反馈内容至少十个字','1.0.0','web')`,
        [createKey],
      ),
    )
    expect(replay.id).toBe(first.id)
    await expect(
      pg.query(
        `select public.create_support_ticket_v2($1,'bug','同键但内容完全不同的反馈内容','1.0.0','web')`,
        [createKey],
      ),
    ).rejects.toThrow('不匹配')

    await asUser(B)
    await expect(
      pg.query(
        `select public.create_support_ticket_v2($1,'bug','用户幂等测试反馈内容至少十个字','1.0.0','web')`,
        [createKey],
      ),
    ).rejects.toThrow('不匹配')
    await expect(pg.query('select * from public.support_idempotency_keys')).rejects.toThrow()

    await asUser(A)
    const replyKey = '30000000-0000-0000-0000-000000000031'
    const replied = parse<{ messages: { id: string; body: string }[]; id: string }>(
      await scalar(`select public.reply_my_support_ticket_v2($1,$2,'用户幂等回复内容')`, [
        replyKey,
        first.id,
      ]),
    )
    const repliedAgain = parse<{ messages: { id: string; body: string }[] }>(
      await scalar(`select public.reply_my_support_ticket_v2($1,$2,'用户幂等回复内容')`, [
        replyKey,
        first.id,
      ]),
    )
    expect(replied.messages.map((message) => message.id)).toEqual(
      repliedAgain.messages.map((message) => message.id),
    )
    expect(replied.messages.filter((message) => message.body === '用户幂等回复内容')).toHaveLength(
      1,
    )

    await asRoot()
    const ticketCount = await scalar<number>(
      `select count(*)::int from public.support_tickets where description = '用户幂等测试反馈内容至少十个字'`,
    )
    expect(ticketCount).toBe(1)
    const replyCount = await scalar<number>(
      `select count(*)::int from public.support_ticket_messages where body = '用户幂等回复内容'`,
    )
    expect(replyCount).toBe(1)
  })

  it('清理函数按保留期删除诊断与过期幂等记录', async () => {
    await asRoot()
    await pg.query(
      `insert into public.notification_delivery_logs(
        request_id,event_type,event_id,couple_id,recipient_user_id,channel,device_platform,
        token_suffix,stage,error_code,provider_http_status,duration_ms,created_at
      ) values ($1,'message',$2,$3,$4,'getui','android','12345678','provider_accepted',
        null,200,10,'2020-01-01T00:00:00Z')`,
      [REQUEST, MESSAGE_A, couple, B],
    )
    await pg.query(
      `insert into public.admin_idempotency_keys(key,actor_id,route,request_hash,response,status_code,expires_at)
       values ($1,$2,'cleanup.test','hash','{}'::jsonb,200,'2020-01-01T00:00:00Z')`,
      ['30000000-0000-0000-0000-000000000040', A],
    )
    await pg.query(
      `insert into public.support_idempotency_keys(key,user_id,operation,request_hash,response,status_code,expires_at)
       values ($1,$2,'cleanup.test','hash','{}'::jsonb,200,'2020-01-01T00:00:00Z')`,
      ['30000000-0000-0000-0000-000000000041', A],
    )
    await asService()
    const deleted = await scalar<number>('select public.prune_admin_diagnostics(30)')
    expect(deleted).toBeGreaterThanOrEqual(1)
    await asRoot()
    expect(
      await scalar<number>(
        "select count(*)::int from public.notification_delivery_logs where created_at < now() - interval '30 days'",
      ),
    ).toBe(0)
    expect(
      await scalar<number>(
        `select count(*)::int from public.admin_idempotency_keys where key = '30000000-0000-0000-0000-000000000040'`,
      ),
    ).toBe(0)
    expect(
      await scalar<number>(
        `select count(*)::int from public.support_idempotency_keys where key = '30000000-0000-0000-0000-000000000041'`,
      ),
    ).toBe(0)
  })

  it('顺序降级最后一位 owner 会被拒绝且不留下部分变更或成功审计', async () => {
    await asService()
    await scalar(
      `select public.admin_upsert_member($1,$2,$3,'owner','active','备份 owner','保留双 owner','req-owner-promote')`,
      ['30000000-0000-0000-0000-000000000050', A, B],
    )
    const demotedA = parse<{ member: { role: string; status: string } }>(
      await scalar(
        `select public.admin_upsert_member($1,$2,$3,'operator','active','A 降级','演练 owner 保护','req-owner-a-demote')`,
        ['30000000-0000-0000-0000-000000000051', A, A],
      ),
    )
    expect(demotedA.member).toMatchObject({ role: 'operator', status: 'active' })

    await expect(
      pg.query(
        `select public.admin_upsert_member($1,$2,$3,'operator','active','B 降级','演练最后 owner 保护','req-owner-b-demote')`,
        ['30000000-0000-0000-0000-000000000052', B, B],
      ),
    ).rejects.toThrow('至少需要保留一位有效 owner')

    await asRoot()
    const memberB = (
      await pg.query<{ role: string; status: string }>(
        `select role, status from public.admin_members where user_id = $1`,
        [B],
      )
    ).rows[0]
    expect(memberB).toMatchObject({ role: 'owner', status: 'active' })
    const failedAudit = await scalar<number>(
      `select count(*)::int from public.admin_audit_logs where request_id = 'req-owner-b-demote'`,
    )
    expect(failedAudit).toBe(0)

    await asService()
    await scalar(
      `select public.admin_upsert_member($1,$2,$3,'owner','active','恢复 A','演练结束恢复 owner','req-owner-a-restore')`,
      ['30000000-0000-0000-0000-000000000053', B, A],
    )
    await scalar(
      `select public.admin_upsert_member($1,$2,$3,'support','active','恢复 B','演练结束恢复客服','req-owner-b-restore')`,
      ['30000000-0000-0000-0000-000000000054', A, B],
    )
  })

  it('computes timezone-bounded metrics only from real current-member activity', async () => {
    await asRoot()
    await pg.query(
      `insert into public.messages(id,couple_id,sender_id,content,created_at) values
        ($1,$3,$4,'私密消息内容ABC','2026-10-20T02:00:00Z'),
        ($2,$3,$5,'对方的私密回复DEF','2026-10-20T03:00:00Z')`,
      [MESSAGE_A, MESSAGE_B, couple, A, B],
    )
    await pg.query(
      `insert into public.photos(couple_id,uploaded_by,path,caption,created_at)
       values($1,$2,$3,'秘密相册说明','2026-10-20T04:00:00Z')`,
      [couple, A, `${couple}/${A}/secret-photo.jpg`],
    )
    taskId = (await scalar(
      `insert into public.daily_tasks(couple_id,task_date,title,description,task_type,created_at)
       values($1,'2026-10-20','测试任务','任务描述不应被后台返回','interaction','2026-10-20T00:00:00Z')
       returning id`,
      [couple],
    )) as string
    await pg.query(
      `insert into public.daily_task_completions(couple_id,task_id,user_id,completed_at,optional_content) values
        ($1,$2,$3,'2026-10-20T05:00:00Z','私密任务答案一'),
        ($1,$2,$4,'2026-10-20T06:00:00Z','私密任务答案二')`,
      [couple, taskId, A, B],
    )
    await pg.query(
      `update public.couples set created_at = '2026-10-20T02:00:00Z',
        greeting_title = '私密寄语XYZ', greeting_subtitle = '私密副标题XYZ'
       where id = $1`,
      [couple],
    )
    await pg.query(`update public.couples set created_at = '2026-09-01T00:00:00Z' where id = $1`, [
      otherCouple,
    ])
    await pg.query(
      `insert into public.device_installations(id,user_id,platform,token,app_version)
       values($1,$2,'android',$3,'1.2.3')`,
      [DEVICE_A, A, FULL_TOKEN],
    )
    await pg.query(
      `select public.record_notification_delivery($1,'message',$2,$3,$4,'getui','android','12345678','provider_rejected','invalid_cid',400,321)`,
      [REQUEST, MESSAGE_A, couple, B],
    )
    await pg.query(
      `select public.record_notification_delivery($1,'message',$2,$3,$4,'getui','android','12345678','provider_accepted',null,200,120)`,
      ['30000000-0000-0000-0000-000000000011', MESSAGE_B, couple, A],
    )

    await asService()
    const overview = parse<Record<string, any>>(
      await scalar(`select public.admin_overview($1,'2026-10-20','2026-10-20')`, [A]),
    )
    expect(overview.timezone).toBe('Asia/Shanghai')
    expect(overview.current.new_users).toBe(2)
    expect(overview.current.new_couples).toBe(1)
    expect(overview.current.mutual_spaces).toBe(1)
    expect(overview.current.task_denominator).toBe(1)
    expect(overview.current.task_numerator).toBe(1)
    expect(overview.current.task_rate).toBe(100)
    expect(overview.small_sample).toBe(true)
    expect(overview.previous.new_users).toBe(1)
    expect(overview.previous.new_couples).toBe(0)
    expect(overview.series).toHaveLength(1)
    expect(overview.series[0].mutual_spaces).toBe(1)
    expect(overview.alerts.push_failures_24h).toBe(1)
    expect(JSON.stringify(overview)).not.toContain('私密消息内容ABC')
    expect(JSON.stringify(overview)).not.toContain('私密任务答案一')

    const supportView = parse<Record<string, any>>(
      await scalar(`select public.admin_overview($1,'2026-10-20','2026-10-20')`, [B]),
    )
    expect(supportView.recent_failures).toBeNull()
    expect(overview.recent_failures).toHaveLength(1)
  })

  it('returns only whitelisted, derived fields for users, spaces, and diagnostics', async () => {
    await asService()
    const ownerSearch = parse<{ rows: Record<string, unknown>[] }>(
      await scalar(
        `select public.admin_list_users($1,'alice@example.com','email',1,10,'created_at_desc','all')`,
        [A],
      ),
    )
    expect(ownerSearch.rows).toHaveLength(1)
    expect(ownerSearch.rows[0].email_masked).toBe('alice@example.com')
    expect(ownerSearch.rows[0]).not.toHaveProperty('total_count')
    expect(JSON.stringify(ownerSearch)).toContain('alice@example.com')

    const userDetail = parse<Record<string, any>>(
      await scalar('select public.admin_user_detail($1,$2)', [A, A]),
    )
    expect(userDetail.email_masked).toBe('alice@example.com')
    expect(JSON.stringify(userDetail)).toContain('alice@example.com')
    expect(userDetail.devices[0].token).toBe(FULL_TOKEN)
    expect(userDetail.devices[0].token_suffix).toBe(FULL_TOKEN.slice(-6))

    const couples = parse<{ rows: Record<string, any>[] }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc')`,
        [A],
      ),
    )
    expect(couples.rows).toHaveLength(2)
    const primary = couples.rows.find((row) => row.id === couple)
    expect(primary?.members).toHaveLength(2)
    expect(primary).not.toHaveProperty('total_count')
    expect(primary).not.toHaveProperty('greeting_title')
    expect(JSON.stringify(couples)).not.toContain('私密寄语XYZ')
    expect(JSON.stringify(couples)).not.toContain('私密消息内容ABC')
    expect(JSON.stringify(couples)).not.toContain('secret-photo.jpg')

    const createdToday = parse<{ total: number; rows: { user_id: string }[] }>(
      await scalar(
        `select public.admin_list_users($1,'','name',1,10,'created_at_desc','all','2026-10-20','2026-10-20')`,
        [A],
      ),
    )
    expect(createdToday.total).toBe(2)
    expect(createdToday.rows.map((row) => row.user_id).sort()).toEqual([E, G].sort())

    const mutualOnly = parse<{ total: number; rows: Record<string, any>[] }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc',null,null,true,'all')`,
        [A],
      ),
    )
    expect(mutualOnly.total).toBe(1)
    expect(mutualOnly.rows[0].id).toBe(couple)
    expect(mutualOnly.rows[0].mutual).toBe(true)

    const createdCouple = parse<{ total: number; rows: Record<string, any>[] }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc','2026-10-20','2026-10-20',null,'all')`,
        [A],
      ),
    )
    expect(createdCouple.total).toBe(1)
    expect(createdCouple.rows[0].id).toBe(couple)

    const doubleTask = parse<{ rows: Record<string, any>[] }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc',null,null,null,'double')`,
        [A],
      ),
    )
    expect(doubleTask.rows.map((row) => row.id)).toEqual([couple])

    const singleTask = parse<{ total: number }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc',null,null,null,'single')`,
        [A],
      ),
    )
    expect(singleTask.total).toBe(0)

    const noTask = parse<{ rows: Record<string, any>[] }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc',null,null,null,'none')`,
        [A],
      ),
    )
    expect(noTask.rows.map((row) => row.id)).toEqual([otherCouple])

    const detail = parse<Record<string, any>>(
      await scalar(`select public.admin_couple_detail($1,$2,'2026-10-20','2026-10-20')`, [
        A,
        couple,
      ]),
    )
    expect(detail.stats.messages).toBe(2)
    expect(detail.stats.tasks_double).toBe(1)
    expect(detail.stats.photos_in_range).toBe(1)
    expect(JSON.stringify(detail)).not.toContain('私密消息内容ABC')
    expect(JSON.stringify(detail)).not.toContain('secret-photo.jpg')
    expect(JSON.stringify(detail)).not.toContain('秘密相册说明')
    expect(JSON.stringify(detail)).not.toContain('私密寄语XYZ')

    const diagnostics = parse<Record<string, any>>(
      await scalar(
        `select public.admin_list_diagnostics($1,'2026-10-20','2026-10-20','message','failed',1,10)`,
        [A],
      ),
    )
    expect(diagnostics.total).toBe(1)
    expect(diagnostics.rows[0].delivery_status).toBe('failed')
    expect(diagnostics.rows[0].token_suffix).toBe('12345678')
    expect(JSON.stringify(diagnostics)).not.toContain(FULL_TOKEN)
    expect(diagnostics.uncollected_stages).toContain('客户端收到回执')

    const system = parse<Record<string, any>>(
      await scalar('select public.admin_system_health($1)', [A]),
    )
    expect(system.database).toBe('ok')
    expect(system.diagnostic_coverage.not_collected).toContain('实时在线人数')
    expect(JSON.stringify(system)).not.toContain('私密消息内容ABC')
  })

  it('keeps the other space isolated and refuses invalid ticket targets', async () => {
    await asUser(C)
    expect(parse<unknown[]>(await scalar('select public.my_support_tickets()'))).toHaveLength(0)
    await expect(
      pg.query(`select public.reply_my_support_ticket($1,'试图回复别人的工单')`, [ticketId]),
    ).rejects.toThrow('工单不存在')

    await asService()
    const ticket = parse<Record<string, any>>(
      await scalar('select public.admin_ticket_detail($1,$2)', [A, ticketId]),
    )
    expect(ticket.couple_id).toBe(couple)
    expect(JSON.stringify(ticket)).toContain('alice@example.com')
    const other = parse<{ rows: unknown[] }>(
      await scalar(
        `select public.admin_list_couples($1,'2026-10-20','2026-10-20','all','all',1,10,'created_at_desc')`,
        [A],
      ),
    )
    expect(other.rows).toHaveLength(2)
    const isolated = other.rows.find((row) => (row as Record<string, any>).id === otherCouple) as
      Record<string, any> | undefined
    expect(isolated?.messages).toBe(0)
    expect(isolated?.pings).toBe(0)
  })
  it('filters queues before pagination and excludes internal notes from user-reply tracking', async () => {
    await asRoot()
    await pg.exec(`insert into public.support_tickets(id,user_id,category,description,status,created_at,updated_at) values
      ('60000000-0000-4000-8000-000000000001','${A}','bug','待办测试一：无法收到提醒通知','pending',now()-interval '2 days',now()),
      ('60000000-0000-4000-8000-000000000002','${A}','bug','待办测试二：需要补充排查信息','in_progress',now()-interval '1 day',now());
      update public.support_tickets set assigned_admin_id='${A}' where id='60000000-0000-4000-8000-000000000002';
      insert into public.support_ticket_messages(ticket_id,author_type,author_id,visibility,body,created_at) values
      ('60000000-0000-4000-8000-000000000002','user','${A}','user','补充问题',now()-interval '1 hour'),
      ('60000000-0000-4000-8000-000000000002','admin','${A}','internal','内部排查',now());`)
    await asService()
    const queue = async (view: string) =>
      parse<Record<string, any>>(
        await scalar(
          `select public.admin_list_tickets($1,'open','all','待办测试',1,1,'waiting_asc',$2)`,
          [A, view],
        ),
      )
    expect((await queue('all')).total).toBe(2)
    expect((await queue('all')).rows[0].id).toBe('60000000-0000-4000-8000-000000000001')
    expect((await queue('unassigned')).total).toBe(1)
    expect((await queue('mine')).rows[0].id).toBe('60000000-0000-4000-8000-000000000002')
    expect((await queue('user_replied')).total).toBe(1)
    expect((await queue('user_replied')).rows[0].user_replied).toBe(true)
  })

  it('does not reset the waiting clock when the user sends another unanswered message', async () => {
    const id = '60000000-0000-4000-8000-000000000002'
    await asRoot()
    await pg.query(
      `insert into public.support_ticket_messages(ticket_id,author_type,author_id,visibility,body,created_at) values
      ($1,'admin',$2,'user','之前的公开回复',now()-interval '3 hours'),
      ($1,'user',$2,'user','第一条未回答反馈',now()-interval '2 hours')`,
      [id, A],
    )
    const expected = await scalar(
      `select min(created_at)::text from public.support_ticket_messages where ticket_id=$1 and author_type='user'`,
      [id],
    )
    await asService()
    const queue = parse<Record<string, any>>(
      await scalar(
        `select public.admin_list_tickets($1,'open','all','待办测试二',1,20,'waiting_asc','user_replied')`,
        [A],
      ),
    )
    expect(Date.parse(queue.rows[0].waiting_since)).toBe(Date.parse(String(expected)))
  })

  it('atomically replies and resolves, replays safely, and rejects stale/invalid writes without partial messages', async () => {
    await asService()
    const id = '60000000-0000-4000-8000-000000000002'
    const before = parse<Record<string, any>>(
      await scalar('select public.admin_ticket_detail($1,$2)', [A, id]),
    )
    const key = '70000000-0000-4000-8000-000000000001'
    const sql = `select public.admin_ticket_action($1,$2,$3,'reply','处理完成','问题已修复','resolved',null,'req-workflow',$4)`
    const result = parse<Record<string, any>>(await scalar(sql, [key, A, id, before.updated_at]))
    expect(result.ticket.status).toBe('resolved')
    expect(result.ticket.resolved_at).not.toBeNull()
    expect(result.ticket.messages.length).toBe(before.messages.length + 1)
    expect(
      parse<Record<string, any>>(await scalar(sql, [key, A, id, before.updated_at])).operation
        .replayed,
    ).toBe(true)
    await expect(
      pg.query(
        `select public.admin_ticket_action(gen_random_uuid(),$1,$2,'note','','过时的备注',null,null,'req-stale',$3)`,
        [A, id, before.updated_at],
      ),
    ).rejects.toMatchObject({ code: '40001' })
    const otherId = '60000000-0000-4000-8000-000000000001'
    await expect(
      pg.query(
        `select public.admin_ticket_action(gen_random_uuid(),$1,$2,'reply','','不能部分成功','pending',null,'req-invalid')`,
        [A, otherId],
      ),
    ).rejects.toThrow('回复后状态无效')
    const other = parse<Record<string, any>>(
      await scalar('select public.admin_ticket_detail($1,$2)', [A, otherId]),
    )
    expect(other.messages).toHaveLength(0)
    expect(other.status).toBe('pending')
    const after = parse<Record<string, any>>(
      await scalar('select public.admin_ticket_detail($1,$2)', [A, id]),
    )
    expect(after.messages).toHaveLength(before.messages.length + 1)
  })

  it('locates diagnostics across dates by exact event/request and applies space constraints', async () => {
    await asService()
    const byEvent = parse<Record<string, any>>(
      await scalar(
        `select public.admin_list_diagnostics($1,'2020-01-01','2020-01-01','all','all',1,20,$2,null,null)`,
        [A, MESSAGE_A],
      ),
    )
    expect(byEvent.total).toBe(1)
    expect(byEvent.rows[0].event_id).toBe(MESSAGE_A)
    const req = byEvent.rows[0].attempts[0].request_id
    const byRequest = parse<Record<string, any>>(
      await scalar(
        `select public.admin_list_diagnostics($1,'2020-01-01','2020-01-01','all','all',1,20,null,$2,null)`,
        [A, req],
      ),
    )
    expect(byRequest.rows.some((row: any) => row.event_id === MESSAGE_A)).toBe(true)
    const wrongSpace = parse<Record<string, any>>(
      await scalar(
        `select public.admin_list_diagnostics($1,'2020-01-01','2020-01-01','all','all',1,20,$2,null,$3)`,
        [A, MESSAGE_A, otherCouple],
      ),
    )
    expect(wrongSpace.total).toBe(0)
    await expect(
      pg.query(
        `select public.admin_list_diagnostics($1,'2020-01-01','2020-01-01','all','all',1,20,$2,null,null)`,
        [B, MESSAGE_A],
      ),
    ).rejects.toThrow()
  })
  it('allows full business content for the owner while retaining staff boundaries and read audits', async () => {
    await asService()
    const read = async (entity: string, space = couple) =>
      parse<Record<string, any>>(
        await scalar(`select public.admin_read_records($1,$2,$3,null,'',1,20,'req-full-content')`, [
          A,
          entity,
          space,
        ]),
      )
    expect((await read('profiles')).total).toBe(2)
    const tasksByUser = parse<Record<string, any>>(
      await scalar(`select public.admin_read_records($1,'daily_tasks',null,$2)`, [A, A]),
    )
    expect(tasksByUser.total).toBeGreaterThan(0)
    const messages = await read('messages')
    expect(messages.rows.some((row: any) => row.content === '私密消息内容ABC')).toBe(true)
    expect(
      (await read('photos')).rows.some((row: any) => row.path.includes('secret-photo.jpg')),
    ).toBe(true)
    expect((await read('couples')).rows[0].greeting_title).toBe('私密寄语XYZ')
    const all = await read('daily_task_completions')
    expect(all.rows.every((row: any) => Object.hasOwn(row, 'optional_content'))).toBe(true)
    for (const entity of [
      'profiles',
      'couple_members',
      'events',
      'daily_tasks',
      'focus_sessions',
      'pings',
    ])
      await read(entity)
    await expect(
      pg.query(`select public.admin_read_records($1,'messages',$2)`, [B, couple]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      pg.query(`select public.admin_read_records($1,'auth.users')`, [A]),
    ).rejects.toMatchObject({ code: '22023' })
    await expect(
      pg.query(`select public.admin_read_records($1,'device_installations')`, [A]),
    ).rejects.toMatchObject({ code: '22023' })
    const staff = parse<Record<string, any>>(
      await scalar('select public.admin_user_detail($1,$2)', [B, A]),
    )
    expect(staff.email_masked).toBe('a***@example.com')
    expect(JSON.stringify(staff)).not.toContain(FULL_TOKEN)
    const id = (await read('photos')).rows[0].id
    expect(await scalar('select public.admin_photo_path($1,$2)', [A, id])).toContain(
      'secret-photo.jpg',
    )
    await expect(pg.query('select public.admin_photo_path($1,$2)', [B, id])).rejects.toMatchObject({
      code: '42501',
    })
    const audit = parse<Record<string, any>>(
      await scalar(`select public.admin_list_audit($1,'data.read','all',null,null,1,20)`, [A]),
    )
    expect(audit.total).toBeGreaterThan(0)
    expect(JSON.stringify(audit)).not.toContain('私密消息内容ABC')
    await asUser(A)
    await expect(pg.query(`select public.admin_read_records($1,'messages')`, [A])).rejects.toThrow()
  })
})
