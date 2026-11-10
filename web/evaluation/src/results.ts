import type { Results, RunConfig } from './api/types'

export interface EvaluationRecord {
  id: string
  config?: RunConfig
  results: Results
}

export function resultStats(results: Results) {
  const sims = results.simulations
  const rewards = sims.flatMap((sim) =>
    sim.reward_info == null ? [] : [sim.reward_info.reward],
  )
  const costs = sims.flatMap((sim) =>
    sim.agent_cost == null ? [] : [sim.agent_cost],
  )
  return {
    total: sims.length,
    evaluated: rewards.length,
    missing: sims.length - rewards.length,
    successRate: rewards.length
      ? (rewards.filter((reward) => reward === 1).length / rewards.length) * 100
      : null,
    avgReward: rewards.length
      ? rewards.reduce((sum, reward) => sum + reward, 0) / rewards.length
      : null,
    totalCost: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
    missingCosts: sims.length - costs.length,
  }
}

const STORAGE_KEY = 'tau2.evaluation.history.v1'

/** Invalid history is reported instead of silently replaced with an empty list. */
export function readHistory(
  storage: Pick<Storage, 'getItem'>,
  legacy?: Pick<Storage, 'getItem'>,
): EvaluationRecord[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) {
    const old = legacy?.getItem('tau2.latest')
    if (!old) return []
    const results: unknown = JSON.parse(old)
    return [{ id: 'legacy-latest', results: parseResults(results) }]
  }
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error('评测历史格式损坏，未覆盖原始数据。请导出备份或清理浏览器存储。')
  }
  return value
}

function isRecord(value: unknown): value is EvaluationRecord {
  if (!isObject(value) || typeof value.id !== 'string' || !isResults(value.results)) return false
  const config = value.config
  return config == null || (isObject(config) &&
    ['domain', 'language', 'llm_agent'].every((key) => optionalString(config[key])))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalNumber(value: unknown) {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

function optionalString(value: unknown) {
  return value == null || typeof value === 'string'
}

export function parseResults(value: unknown): Results {
  if (!isResults(value)) throw new Error('评测结果格式不正确，无法安全展示')
  return value
}

function isResults(value: unknown): value is Results {
  if (!isObject(value) || !Array.isArray(value.tasks) || !Array.isArray(value.simulations)) return false
  if (!optionalString(value.timestamp) || (value.info != null &&
      (!isObject(value.info) || !optionalString(value.info.language)))) return false
  return value.simulations.every((sim: unknown) => {
    if (!isObject(sim) || typeof sim.id !== 'string' || typeof sim.task_id !== 'string') return false
    if (![sim.duration, sim.agent_cost, sim.user_cost, sim.trial].every(optionalNumber)) return false
    if (!optionalString(sim.termination_reason)) return false
    if (sim.reward_info != null) {
      const reward = sim.reward_info
      if (!isObject(reward) || typeof reward.reward !== 'number' || !Number.isFinite(reward.reward)) return false
      if (reward.db_check != null && (!isObject(reward.db_check) ||
          typeof reward.db_check.db_match !== 'boolean' ||
          typeof reward.db_check.db_reward !== 'number')) return false
      for (const key of ['env_assertions', 'action_checks', 'nl_assertions', 'communicate_checks']) {
        if (reward[key] != null && (!Array.isArray(reward[key]) || !reward[key].every(isObject))) return false
      }
      if (reward.action_checks != null && !Array.isArray(reward.action_checks)) return false
      if (Array.isArray(reward.action_checks) && !reward.action_checks.every((check) =>
        isObject(check.action) && typeof check.action.name === 'string' && optionalString(check.tool_type))) return false
      for (const key of ['nl_assertions', 'communicate_checks']) {
        const checks = reward[key]
        if (Array.isArray(checks) && !checks.every((check) =>
          [check.nl_assertion, check.info, check.justification].every(optionalString))) return false
      }
      if (reward.reward_basis != null && (!Array.isArray(reward.reward_basis) ||
          !reward.reward_basis.every((basis) => typeof basis === 'string'))) return false
      if (reward.reward_breakdown != null && (!isObject(reward.reward_breakdown) ||
          !Object.values(reward.reward_breakdown).every((n) => typeof n === 'number' && Number.isFinite(n)))) return false
    }
    return sim.messages == null || (Array.isArray(sim.messages) && sim.messages.every((msg: unknown) =>
      isObject(msg) && ['system', 'user', 'assistant', 'tool'].includes(String(msg.role)) &&
      (msg.content == null || typeof msg.content === 'string') &&
      (msg.tool_calls == null || (Array.isArray(msg.tool_calls) && msg.tool_calls.every((call: unknown) =>
        isObject(call) && typeof call.name === 'string' && isObject(call.arguments)))),
    ))
  })
}

/** Persist full conversations; quota failures must be surfaced by the caller. */
export function writeHistory(storage: Pick<Storage, 'setItem'>, records: EvaluationRecord[]) {
  storage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 20)))
}

export function downloadResults(record: EvaluationRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record.results, null, 2)], {
    type: 'application/json',
  }))
  const link = document.createElement('a')
  link.href = url
  link.download = `tau2-${record.id}.json`
  link.click()
  URL.revokeObjectURL(url)
}
