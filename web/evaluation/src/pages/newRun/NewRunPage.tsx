import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { PlayCircleOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getOptions, getTasks, runDomain, stopRun, toErrorMessage } from '../../api/client'
import {
  PUBLISHED_LANGUAGES,
  type Results,
  type RunConfig,
  type Task,
} from '../../api/types'
import TaskSelector from './TaskSelector'
import { buildRunConfig, type FormValues } from '../../runConfig'

const { Text, Title } = Typography

const DOMAIN_HINTS: Record<string, string> = {
  mock: '最小示例域（仍会调用配置的模型）',
  airline: '航空客服域',
  retail: '零售客服域',
  telecom: '电信客服域',
  banking_knowledge: '银行知识检索域（需 --retrieval-config）',
  intake: '坐席信息采集域（elicitation，agent_directed 仅语音）',
}

const TEXT_AGENTS = ['llm_agent', 'llm_agent_gt', 'llm_agent_solo']

const initialValues: FormValues = {
  domain: 'retail',
  language: 'en',
  agent: 'llm_agent',
  llm_agent: 'zai/glm-5.3',
  user: 'user_simulator',
  llm_user: 'zai/glm-5.3',
  num_trials: 1,
  num_tasks: 5,
  task_ids: [],
  max_steps: 200,
  max_errors: 10,
  seed: 300,
  max_concurrency: 3,
  auto_review: false,
  verbose_logs: false,
  save_to: null,
  retrieval_config: 'alltools',
  elicitation_strategy: 'scaffolded',
  elicitation_rate: 1,
}

const languageOptions = PUBLISHED_LANGUAGES.map((l) => ({ value: l, label: l }))

const retrievalOptions = [
  'alltools',
  'alltools-qwen',
  'bm25',
  'bm25_grep',
  'grep_only',
  'full_kb',
  'no_knowledge',
  'golden_retrieval',
].map((v) => ({ value: v, label: v }))

export default function NewRunPage(props: {
  onDone: (results: Results, config: RunConfig) => void
  onRunningChange: (running: boolean) => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [options, setOptions] = useState<{
    domains: string[]
    agents: string[]
    users: string[]
  } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [stopState, setStopState] = useState<'idle' | 'requesting' | 'requested'>('idle')
  const activeRunId = useRef<string | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const submitLock = useRef(false)

  const selectedDomain = Form.useWatch('domain', form) ?? 'retail'
  const isBanking = selectedDomain === 'banking_knowledge'
  const isIntake = selectedDomain === 'intake'
  const selectedLanguage = Form.useWatch('language', form) ?? 'en'
  const selectedAgent = Form.useWatch('agent', form) ?? 'llm_agent'
  const watchedTaskIds = Form.useWatch('task_ids', form)
  const selectedTaskIds: string[] = useMemo(
    () => (Array.isArray(watchedTaskIds) ? watchedTaskIds : []),
    [watchedTaskIds],
  )

  // 拉取注册表选项
  useEffect(() => {
    let cancelled = false
    getOptions()
      .then((info) => {
        if (!cancelled) setOptions(info)
      })
      .catch((error) => {
        if (!cancelled) setOptionsError(toErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  // 域变化时拉取任务列表
  useEffect(() => {
    if (!selectedDomain) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 加载态标记，异步完成后更新
    setTasksLoading(true)
    form.setFieldValue('task_ids', [])
    const controller = new AbortController()
    getTasks(selectedDomain, selectedLanguage, selectedAgent, controller.signal)
      .then((res) => {
        if (!cancelled) {
          setTasks(res.tasks)
          setTasksError(null)
          if (res.tasks.length === 0) setTasksError('该域、语言和 Agent 下没有可用任务')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTasks([])
          setTasksError(toErrorMessage(error))
        }
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedDomain, selectedLanguage, selectedAgent, form, reload])

  const domainSelectOptions = useMemo(() => {
    if (options?.domains?.length) {
      return options.domains.map((d) => ({
        value: d,
        label: DOMAIN_HINTS[d] ? `${d}（${DOMAIN_HINTS[d]}）` : d,
      }))
    }
    return []
  }, [options])

  const agentSelectOptions = useMemo(() => {
    if (options?.agents?.length) {
      return options.agents
        .filter((a) => TEXT_AGENTS.includes(a))
        .map((a) => ({ value: a, label: a }))
    }
    return []
  }, [options])

  const userSelectOptions = useMemo(() => {
    if (options?.users?.length) {
      return options.users.filter((u) => u === 'user_simulator')
        .map((u) => ({ value: u, label: u }))
    }
    return []
  }, [options])

  const numTasksTooltip = useMemo(() => {
    if (selectedTaskIds.length > 0) {
      return `已手动选择 ${selectedTaskIds.length} 个任务，num_tasks 将被忽略`
    }
    return `可选任务总数: ${tasks.length}`
  }, [selectedTaskIds, tasks])

  async function handleSubmit(values: FormValues) {
    if (submitLock.current) return
    if (tasksLoading || !options || optionsError || tasksError) {
      setSubmitError('配置尚未正确加载，请重试加载后再提交。')
      return
    }
    submitLock.current = true
    setSubmitting(true)
    setStopState('idle')
    props.onRunningChange(true)
    setSubmitError(null)

    const config = buildRunConfig(values)
    const runId = crypto.randomUUID()
    activeRunId.current = runId

    try {
      const results: Results = await runDomain(config, runId)
      props.onDone(results, config)
    } catch (err) {
      setSubmitError(toErrorMessage(err))
    } finally {
      activeRunId.current = null
      setSubmitting(false)
      setStopState('idle')
      props.onRunningChange(false)
      submitLock.current = false
    }
  }

  async function handleStop() {
    const runId = activeRunId.current
    if (!runId || stopState !== 'idle') return
    setStopState('requesting')
    try {
      const outcome = await stopRun(runId)
      setStopState(outcome.stop_requested ? 'requested' : 'idle')
      if (!outcome.stop_requested) {
        setSubmitError('停止请求未生效：该运行可能已经结束。')
      }
    } catch (err) {
      setStopState('idle')
      setSubmitError(`停止请求失败：${toErrorMessage(err)}`)
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <Title level={3}>
        <ThunderboltOutlined /> 新建 Agent 评测
      </Title>
      <Text type="secondary">
        配置并发起一次微语（基于 τ-bench 框架）仿真评测（半双工文本模式）。后端将同步执行，
        大规模任务可能耗时较久，期间请勿关闭页面。
      </Text>
      <Alert type="info" showIcon style={{ marginTop: 16 }} message="评测会调用后端配置的模型并产生 API 费用；mock 域也不例外。密钥仅在后端配置。" />
      {(optionsError || tasksError) && (
        <Alert type="error" showIcon style={{ marginTop: 16 }}
          message="配置加载失败" description={optionsError ?? tasksError}
          action={<Button aria-label="重试" onClick={() => { setOptionsError(null); setReload((n) => n + 1) }}>重试</Button>} />
      )}

      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={(v) => void handleSubmit(v)}
        style={{ marginTop: 20 }}
        disabled={submitting}
      >
        <Row gutter={16}>
          <Col xs={24} xl={16}>
            <Card title="基本配置" size="small">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="domain"
                    label="评测域 (domain)"
                    rules={[{ required: true }]}
                  >
                    <Select options={domainSelectOptions} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="language" label="语言 (language)" rules={[{ required: true }]}>
                    <Select options={languageOptions} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name="num_trials"
                    label="每任务重复次数"
                    tooltip="num_trials：同一任务的重复实验次数"
                    rules={[{ required: true, type: 'number', min: 1, max: 20 }]}
                  >
                    <InputNumber min={1} max={20} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              {isBanking && (
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      name="retrieval_config"
                      label="检索配置 (retrieval_config)"
                      tooltip="banking_knowledge 域必填；alltools 需要沙箱与 OPENAI_API_KEY"
                      rules={[{ required: true }]}
                    >
                      <Select options={retrievalOptions} />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {isIntake && (
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item
                      name="elicitation_strategy"
                      label="信息采集策略"
                      tooltip="scaffolded 支持文本；agent_directed 需要语音运行"
                    >
                      <Select
                        options={[
                          { value: 'scaffolded', label: 'scaffolded（文本可用）' },
                          {
                            value: 'agent_directed',
                            label: 'agent_directed（仅语音，使用 CLI）',
                            disabled: true,
                          },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item
                      name="elicitation_rate"
                      label="复杂来电概率 (complication rate)"
                      tooltip="取值 0~1；不可行的复杂类型保留为普通来电，不影响执行并发数"
                    >
                      <Slider min={0} max={1} step={0.1} />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </Card>

            <Card title="Agent 与用户模拟器" size="small" style={{ marginTop: 16 }}>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="agent" label="Agent 实现" rules={[{ required: true }]}>
                    <Select options={agentSelectOptions} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="llm_agent"
                    label="Agent 模型"
                    tooltip="LiteLLM 模型标识，如 gpt-4.1 / zai/glm-5.3"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input placeholder="gpt-4.1" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="user" label="用户模拟器实现" rules={[{ required: true }]}>
                    <Select options={userSelectOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="llm_user" label="用户模拟器模型" rules={[{ required: true, whitespace: true }]}>
                    <Input placeholder="gpt-4.1" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="max_steps"
                    label="最大对话轮数 (max_steps)"
                    rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}
                  >
                    <InputNumber min={1} max={1000} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="max_errors"
                    label="最大连续工具错误数"
                    tooltip="连续工具错误达到该次数时终止模拟"
                    rules={[{ required: true, type: 'number', min: 1, max: 50 }]}
                  >
                    <InputNumber min={1} max={50} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card
              title="任务选择"
              size="small"
              style={{ marginTop: 16 }}
              extra={
                tasksLoading ? (
                  <Spin size="small" />
                ) : (
                  <Tag>{tasks.length} 个任务</Tag>
                )
              }
            >
              <TaskSelector tasks={tasks} loading={tasksLoading} />
              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col span={8}>
                  <Form.Item
                    name="num_tasks"
                    label="任务数量 (num_tasks)"
                    tooltip={numTasksTooltip}
                    dependencies={['task_ids']}
                    rules={[{
                      validator: (_, value: number | null) => {
                        if (selectedTaskIds.length > 0 || value == null) return Promise.resolve()
                        return Number.isInteger(value) && value >= 1 && value <= tasks.length
                          ? Promise.resolve()
                          : Promise.reject(new Error(`请输入 1 至 ${tasks.length}，留空运行全部任务`))
                      },
                    }]}
                  >
                    <InputNumber
                      min={1}
                      precision={0}
                      max={tasks.length || 100}
                      style={{ width: '100%' }}
                      disabled={submitting || tasksLoading || selectedTaskIds.length > 0}
                    />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item
                    name="save_to"
                    label="结果运行名称 (save_to，可选)"
                    tooltip="保存到后端 data/simulations/<运行名称>/results.json；留空自动生成名称"
                    rules={[{ pattern: /^[a-zA-Z0-9_-]+$/, message: '只允许字母、数字、下划线和连字符' }]}
                  >
                    <Input placeholder="my_eval" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="执行选项" size="small" style={{ marginTop: 16 }}>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="seed" label="随机种子 (seed)" rules={[{ type: 'integer', min: 0 }]}>
                    <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="max_concurrency"
                    label="最大并发数"
                    tooltip="同时运行的模拟数量"
                    rules={[{ required: true, type: 'number', min: 1, max: 64 }]}
                  >
                    <InputNumber min={1} max={64} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8} style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 30 }}>
                  <Form.Item name="auto_review" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch checkedChildren="评审" unCheckedChildren="评审" />
                  </Form.Item>
                  <Text type="secondary">自动 LLM 评审</Text>
                  <Form.Item name="verbose_logs" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch checkedChildren="日志" unCheckedChildren="日志" />
                  </Form.Item>
                  <Text type="secondary">详细日志</Text>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col xs={24} xl={8}>
            <Card title="配置预览 (RunConfig JSON)" size="small">
              <Form.Item noStyle shouldUpdate>
                {() => <ConfigPreview form={form} />}
              </Form.Item>
            </Card>

            {submitError && (
              <Alert
                type="error"
                style={{ marginTop: 16 }}
                message="评测失败"
                description={
                  <pre style={{ maxHeight: 240, overflow: 'auto' }}>
                    {submitError}
                  </pre>
                }
              />
            )}

            <Space.Compact block style={{ marginTop: 16 }}>
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                loading={submitting && stopState === 'idle'}
                disabled={submitting || !options || !!optionsError || !!tasksError || tasksLoading}
                onClick={() => form.submit()}
                style={{ flex: 1 }}
              >
                {submitting ? '评测运行中…' : '开始评测'}
              </Button>
              {submitting && (
                <ConfigProvider componentDisabled={false}>
                  <Popconfirm
                    title="停止本次评测"
                    description="不再开始新任务；进行中的模拟完成后返回部分结果。"
                    okText="停止"
                    cancelText="取消"
                    okButtonProps={{ danger: true, loading: stopState === 'requesting' }}
                    onConfirm={() => void handleStop()}
                    disabled={stopState === 'requested'}
                  >
                    <Button
                      danger
                      size="large"
                      htmlType="button"
                      icon={<StopOutlined />}
                      disabled={stopState === 'requested'}
                      style={{ height: 'auto' }}
                    >
                      {stopState === 'requested' ? '停止中…' : '停止'}
                    </Button>
                  </Popconfirm>
                </ConfigProvider>
              )}
            </Space.Compact>
            {submitting && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {stopState === 'requested'
                  ? '已请求停止：等待进行中的模拟结束后返回已完成部分…'
                  : '后端同步执行中，页面请保持打开…'}
              </Text>
            )}
          </Col>
        </Row>
      </Form>
    </div>
  )
}

function ConfigPreview({ form }: { form: { getFieldsValue: () => FormValues } }) {
  const values = form.getFieldsValue()
  const preview = buildRunConfig(values)
  return (
    <pre className="mono" style={{ maxHeight: 520, overflow: 'auto' }}>
      {JSON.stringify(preview, null, 2)}
    </pre>
  )
}
