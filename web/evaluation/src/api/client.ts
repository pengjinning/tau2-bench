import axios from 'axios'
import type {
  GetTasksResponse,
  RegistryInfo,
  Results,
  RunConfig,
} from './types'
import { parseResults } from '../results'

export const api = axios.create({
  // 开发模式下 vite 将 /api 与 /health 代理到本地 FastAPI 服务；
  // 生产部署时可通过 VITE_API_BASE 覆盖。
  baseURL: import.meta.env.VITE_API_BASE ?? '',
  timeout: 15000,
})

/** 后端错误统一转换为可读信息。 */
export function toErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail: unknown = error.response?.data?.detail ?? error.response?.data
    if (typeof detail === 'string' && detail) return detail
    if (detail) return JSON.stringify(detail)
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export async function getHealth(): Promise<boolean> {
  const res = await api.get<{ app_health: string }>('/health', { timeout: 8000 })
  if (res.data?.app_health !== 'OK') throw new Error('后端健康检查返回异常')
  return true
}

export async function getOptions(): Promise<RegistryInfo> {
  const res = await api.post<RegistryInfo>('/api/v1/get_options')
  return res.data
}

export async function getTasks(
  domain: string,
  language: string,
  agent: string,
  signal?: AbortSignal,
): Promise<GetTasksResponse> {
  const res = await api.post<GetTasksResponse>('/api/v1/get_tasks', {
    domain, language, agent, task_split_name: 'base',
  }, { signal, timeout: 60000 })
  return res.data
}

/** 运行一次评测；后端同步执行，可能需要较长时间。带 run_id 的运行可通过 stopRun 停止。 */
export async function runDomain(
  config: RunConfig,
  runId?: string,
): Promise<Results> {
  const payload = runId ? { ...config, run_id: runId } : config
  const res = await api.post<unknown>('/api/v1/run_domain', payload, { timeout: 0 })
  return parseResults(res.data)
}

export interface StopRunResult {
  stop_requested: boolean
}

/** 请求优雅停止：不再开始新任务，进行中的模拟完成后返回部分结果。 */
export async function stopRun(runId: string): Promise<StopRunResult> {
  const res = await api.post<StopRunResult>('/api/v1/stop_run', { run_id: runId })
  return res.data
}
