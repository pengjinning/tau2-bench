import { useMemo, useState, type ReactNode } from 'react'
import {
  Card,
  Alert,
  Button,
  Col,
  Empty,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  MinusCircleTwoTone,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  TERMINATION_REASON_LABELS,
  type SimulationRun,
} from '../../api/types'
import ConversationView from '../../components/ConversationView'
import RewardDetails from '../../components/RewardDetails'
import { downloadResults, resultStats, type EvaluationRecord } from '../../results'

const { Text, Title } = Typography

function terminationTag(reason: string | null | undefined) {
  if (!reason) return <Tag>未知</Tag>
  const label = TERMINATION_REASON_LABELS[reason] ?? reason
  const color =
    reason === 'user_stop' || reason === 'agent_stop'
      ? 'green'
      : reason === 'max_steps' || reason === 'timeout'
        ? 'orange'
        : 'red'
  return <Tag color={color}>{label}</Tag>
}

function rewardColor(reward: number | null | undefined) {
  if (reward == null) return 'default'
  if (reward === 1) return 'success'
  if (reward > 0) return 'processing'
  return 'error'
}

export default function ResultsPage({ history }: { history: EvaluationRecord[] }): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const record = history.find((entry) => entry.id === selectedId) ?? history[0]
  const latest = record?.results
  const [selectedSim, setSelectedSim] = useState<SimulationRun | null>(null)

  const stats = useMemo(() => resultStats(latest ?? { tasks: [], simulations: [] }), [latest])

  function selectRecord(id: string) {
    setSelectedId(id)
    setSelectedSim(null)
  }

  const columns: ColumnsType<SimulationRun> = [
    {
      title: '任务',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 150,
      ellipsis: true,
      render: (id: string) => <Text className="mono">{id}</Text>,
    },
    {
      title: 'Trial',
      dataIndex: 'trial',
      key: 'trial',
      width: 70,
    },
    {
      title: 'Reward',
      dataIndex: ['reward_info', 'reward'],
      key: 'reward',
      width: 130,
      sorter: (a, b) =>
        (a.reward_info?.reward ?? 0) - (b.reward_info?.reward ?? 0),
      render: (reward: number | null) => (
        <Tag color={rewardColor(reward)}>
          {reward == null ? '—' : reward.toFixed(3)}
        </Tag>
      ),
    },
    {
      title: 'DB',
      dataIndex: ['reward_info', 'db_check', 'db_match'],
      key: 'db',
      width: 60,
      align: 'center',
      render: (ok: boolean | null) =>
        ok == null ? (
          <MinusCircleTwoTone twoToneColor="#bfbfbf" />
        ) : ok ? (
          <CheckCircleTwoTone twoToneColor="#52c41a" />
        ) : (
          <CloseCircleTwoTone twoToneColor="#ff4d4f" />
        ),
    },
    {
      title: '终止原因',
      dataIndex: 'termination_reason',
      key: 'termination_reason',
      width: 130,
      render: (reason: string | null) => terminationTag(reason),
    },
    {
      title: '耗时(s)',
      dataIndex: 'duration',
      key: 'duration',
      width: 90,
      render: (d: number | null) => (d != null ? d.toFixed(1) : '—'),
    },
    {
      title: 'Agent 花费',
      dataIndex: 'agent_cost',
      key: 'agent_cost',
      width: 100,
      render: (c: number | null) => (c != null ? `$${c.toFixed(4)}` : '—'),
    },
    {
      title: '消息数',
      key: 'messages',
      width: 90,
      render: (_, record) => record.messages?.length ?? 0,
    },
  ]

  if (!latest) {
    return (
      <Empty
        style={{ marginTop: 80 }}
        description="暂无评测结果，请先发起一次评测"
      />
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Title level={3}>评测结果</Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          aria-label="选择历史评测"
          style={{ width: 360, maxWidth: '100%' }}
          value={record.id}
          onChange={selectRecord}
          options={history.map((entry) => ({
            value: entry.id,
            label: `${entry.results.timestamp ?? entry.id} · ${entry.config?.domain ?? '评测'}`,
          }))}
        />
        <Button onClick={() => downloadResults(record)}>导出结果 JSON</Button>
        <Tag>{record.config?.domain}</Tag>
        <Text type="secondary">{record.config?.llm_agent}</Text>
      </Space>
      {stats.missing > 0 && <Alert type="warning" showIcon
        message={`${stats.missing} 次模拟没有奖励，成功率和平均 Reward 仅统计 ${stats.evaluated} 次已评分模拟。`}
        style={{ marginBottom: 16 }} />}

      {latest && (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="模拟总数"
                  value={stats.total}
                  suffix={
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      / 任务 {latest.tasks?.length ?? '—'} 个
                    </Text>
                  }
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="成功率 (reward = 1)"
                  value={stats.successRate ?? '—'}
                  precision={1}
                  suffix="%"
                  valueStyle={{ color: '#1677ff' }}
                />
                <Progress
                  percent={stats.successRate ?? 0}
                  showInfo={false}
                  size="small"
                  style={{ marginTop: 4 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="平均 Reward"
                  value={stats.avgReward ?? '—'}
                  precision={3}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={stats.missingCosts > 0 ? 'Agent 已知花费（部分缺失）' : 'Agent 总花费'}
                  value={stats.totalCost ?? '—'}
                  precision={4}
                  prefix="$"
                />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            title="模拟明细"
            style={{ marginTop: 16 }}
            extra={
              latest.info?.language ? (
                <Tag>语言 {latest.info.language}</Tag>
              ) : null
            }
          >
            <Table<SimulationRun>
              size="small"
              rowKey={(r) => r.id}
              dataSource={latest.simulations ?? []}
              columns={columns}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 850 }}
              onRow={(record) => ({
                onClick: () => setSelectedSim(record),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </>
      )}

      {selectedSim && (
        <Card
          size="small"
          style={{ marginTop: 16 }}
          title={
            <Space>
              <span className="mono">{selectedSim.id}</span>
              <Tag color={rewardColor(selectedSim.reward_info?.reward)}>
                reward {selectedSim.reward_info?.reward?.toFixed(3) ?? '—'}
              </Tag>
              {terminationTag(selectedSim.termination_reason)}
            </Space>
          }
          extra={
            <Button type="text" onClick={() => setSelectedSim(null)}>
              关闭
            </Button>
          }
        >
          <Row gutter={16}>
            <Col xs={24} lg={16}>
              <ConversationView messages={selectedSim.messages ?? []} />
            </Col>
            <Col xs={24} lg={8}>
              <RewardDetails rewardInfo={selectedSim.reward_info} />
            </Col>
          </Row>
        </Card>
      )}

      {history.length > 0 && (
        <Card size="small" title="历史记录（此浏览器，最近 20 次）" style={{ marginTop: 16 }}>
          <Table<EvaluationRecord>
            size="small"
            rowKey="id"
            dataSource={history}
            pagination={false}
            onRow={(entry) => ({
              onClick: () => selectRecord(entry.id),
              style: { cursor: 'pointer' },
            })}
            columns={[
              {
                title: '时间',
                dataIndex: ['results', 'timestamp'],
                key: 'timestamp',
                width: 220,
              },
              {
                title: '模拟数',
                key: 'count',
                width: 100,
                render: (_, r) =>
                  r.results.simulations.length,
              },
              {
                title: '平均 Reward',
                key: 'avg',
                render: (_, r) => {
                  return resultStats(r.results).avgReward?.toFixed(3) ?? '—'
                },
              },
            ]}
          />
        </Card>
      )}
    </div>
  )
}
