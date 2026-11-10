import type { Task } from '../../api/types'

/** 提取任务的用户情景摘要（结构化 instructions 或纯文本）。 */
export function taskSummary(task: Task): string {
  const instr = task.user_scenario?.instructions
  if (typeof instr === 'string') return instr
  return instr?.reason_for_call ?? instr?.task_instructions ?? ''
}
