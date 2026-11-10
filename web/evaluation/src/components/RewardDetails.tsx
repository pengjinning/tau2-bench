import { Collapse, Descriptions, List, Space, Tag, Typography } from 'antd'
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { RewardInfo } from '../api/types'

const { Text } = Typography

function check(met: boolean) {
  return met ? (
    <CheckCircleTwoTone twoToneColor="#52c41a" />
  ) : (
    <CloseCircleTwoTone twoToneColor="#ff4d4f" />
  )
}

/** RewardInfo 的明细面板：DB / 断言 / 动作 / 自然语言 / 传达信息检查。 */
export default function RewardDetails({
  rewardInfo,
}: {
  rewardInfo: RewardInfo | null | undefined
}): ReactNode {
  if (!rewardInfo) {
    return <Text type="secondary">无奖励信息</Text>
  }

  const items = [
    {
      key: 'db',
      label: (
        <Space>
          数据库检查
          {rewardInfo.db_check ? (
            check(rewardInfo.db_check.db_match)
          ) : null}
        </Space>
      ),
      children: rewardInfo.db_check ? (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="db_match">
            {String(rewardInfo.db_check.db_match)}
          </Descriptions.Item>
          <Descriptions.Item label="db_reward">
            {rewardInfo.db_check.db_reward}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Text type="secondary">无</Text>
      ),
    },
    ...(rewardInfo.env_assertions?.length ? [{
      key: 'env',
      label: `环境断言 (${rewardInfo.env_assertions.filter((a) => a.met).length}/${rewardInfo.env_assertions.length})`,
      children: <List size="small" dataSource={rewardInfo.env_assertions}
        renderItem={(assertion) => <List.Item>
          <Space align="start">{check(assertion.met)}
            <pre className="mono">{JSON.stringify(assertion.env_assertion, null, 2)}</pre>
          </Space>
        </List.Item>} />,
    }] : []),
    ...(rewardInfo.action_checks?.length
      ? [
          {
            key: 'actions',
            label: `动作检查 (${rewardInfo.action_checks.filter((a) => a.action_match).length}/${rewardInfo.action_checks.length})`,
            children: (
              <List
                size="small"
                dataSource={rewardInfo.action_checks}
                renderItem={(a) => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space>
                      {check(a.action_match)}
                      <Text className="mono" style={{ fontSize: 12 }}>
                        {a.action.name}
                      </Text>
                      {a.tool_type && <Tag>{a.tool_type}</Tag>}
                    </Space>
                  </List.Item>
                )}
              />
            ),
          },
        ]
      : []),
    ...(rewardInfo.nl_assertions?.length
      ? [
          {
            key: 'nl',
            label: `自然语言断言 (${rewardInfo.nl_assertions.filter((a) => a.met).length}/${rewardInfo.nl_assertions.length})`,
            children: (
              <List
                size="small"
                dataSource={rewardInfo.nl_assertions}
                renderItem={(a) => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space direction="vertical" size={0}>
                      <Space>
                        {check(a.met)}
                        <Text style={{ fontSize: 12 }}>{a.nl_assertion}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {a.justification}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ),
          },
        ]
      : []),
    ...(rewardInfo.communicate_checks?.length
      ? [
          {
            key: 'communicate',
            label: `信息传达 (${rewardInfo.communicate_checks.filter((c) => c.met).length}/${rewardInfo.communicate_checks.length})`,
            children: (
              <List
                size="small"
                dataSource={rewardInfo.communicate_checks}
                renderItem={(c) => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space direction="vertical" size={0}>
                      <Space>
                        {check(c.met)}
                        <Text style={{ fontSize: 12 }}>{c.info}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {c.justification}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <Descriptions size="small" bordered column={1} style={{ marginBottom: 12 }}>
        <Descriptions.Item label="总 Reward">
          <Tag
            color={
              rewardInfo.reward === 1
                ? 'success'
                : rewardInfo.reward > 0
                  ? 'processing'
                  : 'error'
            }
          >
            {rewardInfo.reward.toFixed(3)}
          </Tag>
        </Descriptions.Item>
        {rewardInfo.reward_breakdown && (
          <Descriptions.Item label="分解">
            <Space wrap>
              {Object.entries(rewardInfo.reward_breakdown).map(([k, v]) => (
                <Tag key={k}>
                  {k}: {v}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>
      {rewardInfo.reward_basis?.length ? <Space wrap style={{ marginBottom: 8 }}>
        <Text type="secondary">计分依据</Text>
        {rewardInfo.reward_basis.map((basis) => <Tag key={basis}>{basis}</Tag>)}
      </Space> : null}
      <Collapse size="small" items={items} />
    </div>
  )
}
