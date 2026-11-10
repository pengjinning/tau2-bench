import type { RunConfig } from './api/types'

export interface FormValues {
  domain: string
  language: string
  agent: string
  llm_agent: string
  user: string
  llm_user: string
  num_trials: number
  num_tasks?: number | null
  task_ids?: string[]
  max_steps: number
  max_errors: number
  seed?: number | null
  max_concurrency: number
  auto_review: boolean
  verbose_logs: boolean
  save_to?: string | null
  retrieval_config?: string | null
  elicitation_strategy?: 'agent_directed' | 'scaffolded'
  elicitation_rate?: number | null
}

/** Use the same payload for the preview and execution. */
export function buildRunConfig(values: FormValues): RunConfig {
  return {
    domain: values.domain,
    language: values.language,
    task_split_name: 'base',
    agent: values.agent,
    llm_agent: values.llm_agent?.trim(),
    user: values.user,
    llm_user: values.llm_user?.trim(),
    num_trials: values.num_trials,
    max_steps: values.max_steps,
    max_errors: values.max_errors,
    max_concurrency: values.max_concurrency,
    auto_review: values.auto_review,
    verbose_logs: values.verbose_logs,
    num_tasks: values.task_ids?.length ? null : (values.num_tasks ?? null),
    task_ids: values.task_ids?.length ? values.task_ids : null,
    seed: values.seed ?? null,
    save_to: values.save_to?.trim() || null,
    ...(values.domain === 'banking_knowledge'
      ? { retrieval_config: values.retrieval_config }
      : {}),
    ...(values.domain === 'intake'
      ? { elicitation: { strategy: 'scaffolded' as const, rate: values.elicitation_rate } }
      : {}),
  }
}
