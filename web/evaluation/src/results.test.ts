import { describe, expect, it } from 'vitest'
import { readHistory, resultStats, writeHistory, type EvaluationRecord } from './results'
import type { Results } from './api/types'
import { buildRunConfig, type FormValues } from './runConfig'

function results(rewards: Array<number | null>): Results {
  return {
    tasks: [],
    simulations: rewards.map((reward, index) => ({
      id: String(index),
      task_id: 'task',
      reward_info: reward === null ? null : { reward },
    })),
  }
}

const values: FormValues = {
  domain: 'retail', language: 'en', agent: 'llm_agent',
  llm_agent: ' gpt-4.1 ', user: 'user_simulator', llm_user: 'gpt-4.1',
  num_trials: 1, num_tasks: 5, max_steps: 200, max_errors: 10,
  max_concurrency: 3, seed: 0, auto_review: false, verbose_logs: false,
}

describe('result metrics', () => {
  it('reports 100%, not 1%, when every scored simulation succeeds', () => {
    expect(resultStats(results([1, 1])).successRate).toBe(100)
  })
  it('does not round near-success rewards into successes', () => {
    expect(resultStats(results([1, 0.999, 0])).successRate).toBeCloseTo(100 / 3)
  })
  it('exposes missing rewards and costs instead of representing them as zero', () => {
    const stats = resultStats(results([1, null]))
    expect(stats).toMatchObject({ total: 2, evaluated: 1, missing: 1, successRate: 100, totalCost: null })
    expect(resultStats(results([null])).avgReward).toBeNull()
    expect(resultStats(results([])).successRate).toBeNull()
  })
})

describe('run config', () => {
  it('normalizes inputs and retains a zero seed', () => {
    expect(buildRunConfig(values)).toMatchObject({
      llm_agent: 'gpt-4.1', seed: 0, save_to: null, task_split_name: 'base',
    })
  })
  it('omits num_tasks when explicit tasks are selected', () => {
    expect(buildRunConfig({ ...values, task_ids: ['0'] })).toMatchObject({
      task_ids: ['0'], num_tasks: null,
    })
  })
  it('does not leak hidden domain-specific values', () => {
    expect(buildRunConfig({ ...values, retrieval_config: 'alltools', elicitation_rate: 1 }))
      .not.toHaveProperty('elicitation')
    expect(buildRunConfig(values)).not.toHaveProperty('retrieval_config')
  })
  it('uses the text-compatible intake strategy and correct complication rate', () => {
    expect(buildRunConfig({ ...values, domain: 'intake', elicitation_rate: 0 }))
      .toHaveProperty('elicitation', { strategy: 'scaffolded', rate: 0 })
  })
})

describe('history persistence', () => {
  it('round-trips full conversations, not only an index', () => {
    const records: EvaluationRecord[] = [{
      id: 'run', results: {
        ...results([1]),
        simulations: [{ id: 'sim', task_id: '0', messages: [{ role: 'user', content: 'hello' }] }],
      },
    }]
    let raw = ''
    writeHistory({ setItem: (_, value) => { raw = value } }, records)
    expect(readHistory({ getItem: () => raw })).toEqual(records)
  })
  it('keeps the newest twenty records', () => {
    let raw = ''
    writeHistory({ setItem: (_, value) => { raw = value } },
      Array.from({ length: 21 }, (_, i) => ({ id: String(i), results: results([]) })))
    expect(readHistory({ getItem: () => raw })).toHaveLength(20)
  })
  it.each(['{}', 'null', '[null]', '[{"id":"x","results":{"tasks":[],"simulations":[null]}}]'])(
    'rejects corrupted history: %s', (raw) => {
      expect(() => readHistory({ getItem: () => raw })).toThrow()
    },
  )
  it('propagates quota errors without dropping the result', () => {
    expect(() => writeHistory({ setItem: () => { throw new Error('quota') } }, []))
      .toThrow('quota')
  })
  it('recovers the last complete result from the previous implementation', () => {
    expect(readHistory({ getItem: () => null }, { getItem: () => JSON.stringify(results([1])) }))
      .toEqual([{ id: 'legacy-latest', results: results([1]) }])
  })
})
