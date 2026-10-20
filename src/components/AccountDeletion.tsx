import { useState } from 'react'
import type { SpaceController } from '../hooks/useSpace'
import { Button, Modal, useTask, useToast } from './ui'

export function AccountDeletion({
  controller,
  demo,
}: {
  controller: SpaceController
  demo: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const { busy, run } = useTask()
  const toast = useToast()
  if (demo) return null
  return (
    <>
      <Button tone="danger" disabled={busy} onClick={() => setOpen(true)}>
        永久注销账号
      </Button>
      {open && (
        <Modal
          title="永久注销账号？"
          onClose={() => {
            if (!busy) setOpen(false)
          }}
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault()
              if (confirmation !== '注销账号') return
              const expectedSpace = controller.space?.couple?.id || null
              void run(async () => {
                const result = await controller.deleteAccount(expectedSpace)
                setOpen(false)
                setConfirmation('')
                if (result.cleanupWarning) {
                  toast(`账号已注销，但本机清理未完全确认：${result.cleanupWarning}`, true)
                } else {
                  toast('账号已注销，本机待发送记录和离线快照已清除')
                }
              })
            }}
          >
            <p>
              注销会删除登录账号。当前关系会被解除；共享聊天、事件、照片回忆和哔卟记录会保留给仍在空间中的另一位玩家，但不再显示你的身份归属。
            </p>
            <p>
              你的照片文件会先从私有存储清理。操作不可撤销；本机离线快照和待发送消息会清除。其他设备已经下载的文件无法远程撤回。
            </p>
            <p>
              如果服务器在数据准备后无法确认账号删除，界面会明确提示；不要重复提交，请先联系管理员。
            </p>
            <label>
              输入“注销账号”确认
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
            <Button tone="danger" type="submit" disabled={busy || confirmation !== '注销账号'}>
              {busy ? '正在注销…' : '确认永久注销'}
            </Button>
            <Button
              tone="white"
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setConfirmation('')
              }}
            >
              保留账号
            </Button>
          </form>
        </Modal>
      )}
    </>
  )
}
