import { Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { ChatMessage, ToolCall } from '../api/types'

const { Text } = Typography

const ROLE_META: Record<
  ChatMessage['role'],
  { label: string; color: string; align: 'left' | 'right'; bg: string }
> = {
  system: { label: '系统', color: 'purple', align: 'left', bg: 'rgba(114,46,209,0.12)' },
  user: { label: '用户', color: 'blue', align: 'left', bg: 'rgba(22,119,255,0.10)' },
  assistant: { label: 'Agent', color: 'green', align: 'right', bg: 'rgba(82,196,26,0.10)' },
  tool: { label: '工具', color: 'orange', align: 'left', bg: 'rgba(250,140,22,0.10)' },
}

function toolCallsBlock(calls: ToolCall[]): ReactNode {
  return (
    <div style={{ marginTop: 6 }}>
      {calls.map((call, i) => (
        <div
          key={call.id || i}
          style={{
            background: 'rgba(0,0,0,0.02)',
            border: '1px dashed rgba(0,0,0,0.18)',
            borderRadius: 6,
            padding: '4px 8px',
            marginTop: 4,
          }}
        >
          <Text className="mono" strong style={{ fontSize: 12 }}>
            ⚙ {call.name}
          </Text>
          <pre className="mono" style={{ fontSize: 11, opacity: 0.85 }}>
            {JSON.stringify(call.arguments, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  )
}

/** 半双工对话时间线：用户/Agent/工具消息气泡。 */
export default function ConversationView({
  messages,
}: {
  messages: ChatMessage[]
}): ReactNode {
  if (!messages.length) {
    return (
      <Text type="secondary">
        无消息记录（可能在服务端以目录格式保存，未随响应返回）。
      </Text>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map((msg, idx) => {
        const meta = ROLE_META[msg.role]
        const toolMsg = msg.role === 'tool' ? msg : null
        const assistantMsg = msg.role === 'assistant' ? msg : null
        return (
          <div
            key={idx}
            style={{ display: 'flex', justifyContent: meta.align === 'right' ? 'flex-end' : 'flex-start' }}
          >
            <div style={{ maxWidth: '92%' }}>
              <div style={{ marginBottom: 2 }}>
                <Tag color={meta.color} style={{ marginRight: 6 }}>
                  {meta.label}
                </Tag>
                {msg.turn_idx != null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    #{msg.turn_idx}
                  </Text>
                )}
              </div>
              <div className="message-bubble" style={{ background: meta.bg }}>
                {msg.content ??
                  (toolMsg || assistantMsg?.tool_calls?.length ? '' : '（空）')}
                {assistantMsg?.tool_calls?.length
                  ? toolCallsBlock(assistantMsg.tool_calls)
                  : null}
                {toolMsg?.error ? (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    {' '}
                    ⚠ 工具调用失败
                  </Text>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
