/**
 * 微语平台后端 (src/tau2/api_service/simulation_service.py) 的类型定义。
 * 字段与 src/tau2/data_model 中的 Pydantic 模型保持一致。
 */

// ---------------------------------------------------------------------------
// Registry (POST /api/v1/get_options)
// ---------------------------------------------------------------------------

export interface RegistryInfo {
  domains: string[]
  agents: string[]
  users: string[]
  task_sets: string[]
}

// ---------------------------------------------------------------------------
// Tasks (POST /api/v1/get_tasks)
// ---------------------------------------------------------------------------

export interface StructuredUserInstructions {
  domain: string
  reason_for_call: string
  known_info?: string | null
  unknown_info?: string | null
  task_instructions: string
}

export interface UserScenario {
  persona?: string | null
  instructions: StructuredUserInstructions | string
}

export interface Task {
  id: string
  description?: {
    purpose?: string | null
    relevant_policies?: string | null
    notes?: string | null
  } | null
  user_scenario: UserScenario
  ticket?: string | null
  evaluation_criteria?: {
    actions?: Array<{
      action_id: string
      name: string
      arguments?: Record<string, unknown>
      requestor?: string
    }> | null
    env_assertions?: Array<unknown> | null
    nl_assertions?: string[] | null
    communicate_info?: string[] | null
    reward_basis?: string[] | null
  } | null
}

export interface GetTasksResponse {
  tasks: Task[]
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface ToolCall {
  id?: string
  name: string
  arguments: Record<string, unknown>
  requestor?: string
}

export type ChatMessage =
  | { role: 'system'; content?: string | null; turn_idx?: number | null }
  | { role: 'user'; content?: string | null; turn_idx?: number | null }
  | {
      role: 'assistant'
      content?: string | null
      tool_calls?: ToolCall[] | null
      turn_idx?: number | null
    }
  | {
      role: 'tool'
      id: string
      content?: string | null
      error?: boolean
      turn_idx?: number | null
    }

// ---------------------------------------------------------------------------
// Reward & checks
// ---------------------------------------------------------------------------

export interface DBCheck {
  db_match: boolean
  db_reward: number
}

export interface ActionCheck {
  action: { action_id: string; name: string; arguments?: Record<string, unknown> }
  action_match: boolean
  action_reward: number
  tool_type?: string | null
}

export interface EnvAssertionCheck {
  env_assertion: unknown
  met: boolean
  reward: number
}

export interface NLAssertionCheck {
  nl_assertion: string
  met: boolean
  justification: string
}

export interface CommunicateCheck {
  info: string
  met: boolean
  justification: string
}

export interface RewardInfo {
  reward: number
  db_check?: DBCheck | null
  env_assertions?: EnvAssertionCheck[] | null
  action_checks?: ActionCheck[] | null
  nl_assertions?: NLAssertionCheck[] | null
  communicate_checks?: CommunicateCheck[] | null
  reward_basis?: string[] | null
  reward_breakdown?: Record<string, number> | null
}

// ---------------------------------------------------------------------------
// SimulationRun & Results
// ---------------------------------------------------------------------------

export interface SimulationRun {
  id: string
  task_id: string
  trial?: number | null
  timestamp?: string | null
  start_time?: string | null
  end_time?: string | null
  duration?: number | null
  termination_reason?: string | null
  agent_cost?: number | null
  user_cost?: number | null
  reward_info?: RewardInfo | null
  messages?: ChatMessage[] | null
  seed?: number | null
  mode?: string | null
  info?: Record<string, unknown> | null
}

export interface ResultsInfo {
  domain_tools_version?: string | null
  language?: string | null
  pack_extension?: string | null
}

export interface Results {
  timestamp?: string | null
  info?: ResultsInfo
  tasks: Task[]
  simulations: SimulationRun[]
  simulation_index?: Array<{
    id: string
    task_id: string | number
    trial: number
    reward: number | null
    termination_reason?: string | null
    agent_cost?: number | null
    duration?: number | null
  }> | null
}

// ---------------------------------------------------------------------------
// RunConfig (POST /api/v1/run_domain)
// ---------------------------------------------------------------------------

export interface ElicitationConfig {
  strategy: 'agent_directed' | 'scaffolded'
  /** 复杂来电概率，0~1；不可行类型保留为普通来电。 */
  rate?: number | null
}

export interface BaseRunConfig {
  domain: string
  language?: string
  task_set_name?: string | null
  task_split_name?: string | null
  task_ids?: string[] | null
  num_tasks?: number | null

  llm_user?: string
  llm_args_user?: Record<string, unknown>
  num_trials?: number
  max_errors?: number
  timeout?: number | null
  max_concurrency?: number
  workers?: number
  seed?: number | null
  log_level?: string | null
  verbose_logs?: boolean
  max_retries?: number
  retry_delay?: number
  auto_review?: boolean
  review_mode?: 'full' | 'user'
  review_model?: string
  hallucination_retries?: number
  retrieval_config?: string | null
  retrieval_config_kwargs?: Record<string, unknown> | null

  elicitation?: ElicitationConfig | null

  save_to?: string | null
}

export interface TextRunConfig extends BaseRunConfig {
  agent: string
  llm_agent: string
  llm_args_agent?: Record<string, unknown>
  user: string
  max_steps?: number
}

export type RunConfig = TextRunConfig

// ---------------------------------------------------------------------------
// 前端常量（默认值来自 src/tau2/config.py）
// ---------------------------------------------------------------------------

/** 已发布语言包（data/tau2/multilingual/）。 */
export const PUBLISHED_LANGUAGES = ['en', 'es', 'hi', 'ko', 'pt', 'zh'] as const

export const TERMINATION_REASON_LABELS: Record<string, string> = {
  user_stop: '用户结束',
  agent_stop: 'Agent 结束',
  max_steps: '达到最大轮数',
  timeout: '超时',
  too_many_errors: '连续错误过多',
  agent_error: 'Agent 错误',
  user_error: '用户模拟器错误',
  infrastructure_error: '基础设施错误',
  context_window_exceeded: '上下文窗口超限',
  unexpected_error: '未知错误',
}
