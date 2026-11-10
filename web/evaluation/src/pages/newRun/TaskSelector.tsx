import { useMemo, useState, type ReactNode } from 'react'
import { Empty, Form, Input, List, Popover, Select, Tag, Typography } from 'antd'
import type { Task } from '../../api/types'
import { taskSummary } from './taskUtils'

const { Text, Paragraph } = Typography

interface TaskSelectorProps {
  tasks: Task[]
  loading?: boolean
}

/** 任务选择器：过滤输入 + 多选下拉（task_ids），并展示已选任务摘要。 */
export default function TaskSelector({
  tasks,
  loading,
}: TaskSelectorProps): ReactNode {
  const [keyword, setKeyword] = useState('')
  const watchedIds = Form.useWatch('task_ids')

  const { options, matched } = useMemo(() => {
    const all = tasks.map((t) => ({ value: t.id, label: t.id }))
    const lower = keyword.trim().toLowerCase()
    const matchedTasks = lower
      ? tasks.filter(
          (t) =>
            t.id.toLowerCase().includes(lower) ||
            taskSummary(t).toLowerCase().includes(lower),
        )
      : tasks
    return {
      options: all,
      matched: matchedTasks.map((t) => ({ value: t.id, label: t.id })),
    }
  }, [tasks, keyword])

  const selectedTasks = useMemo(
    () => tasks.filter((t) => Array.isArray(watchedIds) && watchedIds.includes(t.id)),
    [tasks, watchedIds],
  )

  return (
    <div>
      <Form.Item
        name="task_ids"
        label="指定任务 (task_ids)"
        tooltip="留空则按任务数量取默认顺序的前 N 个；指定 ID 后数量配置被忽略"
        style={{ marginBottom: 8 }}
      >
        <Select
          mode="multiple"
          allowClear
          loading={loading}
          disabled={loading}
          placeholder={
            keyword
              ? `过滤结果 ${matched.length} / ${tasks.length} 个任务`
              : `可选 ${tasks.length} 个任务`
          }
          options={keyword ? matched : options}
          optionFilterProp="label"
          maxTagCount="responsive"
        />
      </Form.Item>

      <Input
        size="small"
        placeholder="按任务 ID 或用户情景描述过滤下拉列表"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {selectedTasks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary">未指定任务，将按默认顺序取前 N 个；数量留空运行全部</Text>
          }
        />
      ) : (
        <List
          size="small"
          bordered
          style={{ maxHeight: 220, overflow: 'auto' }}
          dataSource={selectedTasks}
          renderItem={(task) => (
            <List.Item style={{ padding: '6px 10px' }}>
              <Popover
                placement="left"
                title={
                  <span className="mono">
                    {task.id} <Tag style={{ marginLeft: 8 }}>详情</Tag>
                  </span>
                }
                content={
                  <div style={{ maxWidth: 460 }}>
                    <Paragraph type="secondary">
                      {task.description?.purpose ?? '（无任务描述）'}
                    </Paragraph>
                    <pre style={{ fontSize: 12 }}>
                      {JSON.stringify(task.user_scenario?.instructions, null, 2)}
                    </pre>
                  </div>
                }
              >
                <div style={{ cursor: 'pointer' }}>
                  <Text className="mono" strong>
                    {task.id}
                  </Text>
                  <div>
                    <Text
                      type="secondary"
                      ellipsis
                      style={{ maxWidth: 480, display: 'inline-block' }}
                    >
                      {taskSummary(task)}
                    </Text>
                  </div>
                </div>
              </Popover>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}
