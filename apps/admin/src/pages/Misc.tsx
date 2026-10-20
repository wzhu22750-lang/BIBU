import { Button, StateView } from '../components/ui'
import { navigate } from '../lib/route'

export function NoPermissionPage({ fallback }: { fallback: string }) {
  return (
    <StateView
      kind="denied"
      title="当前角色没有访问这个页面的权限"
      description="页面入口与 API 都会校验角色能力。如需访问，请联系 owner 调整管理员角色。"
      action={<Button onClick={() => navigate(fallback)}>返回可访问页面</Button>}
    />
  )
}

export function NotFoundPage({ fallback }: { fallback: string }) {
  return (
    <StateView
      kind="empty"
      title="页面不存在"
      description="链接可能已失效，或地址输入有误。"
      action={<Button onClick={() => navigate(fallback)}>返回首页</Button>}
    />
  )
}
