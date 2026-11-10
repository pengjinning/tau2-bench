import { test, expect, type Page } from '@playwright/test'

const result = {
  timestamp: '2026-11-03T14:00:00',
  info: { language: 'en' },
  tasks: [{ id: '0', user_scenario: { instructions: 'Test scenario' } }],
  simulations: [{
    id: 'sim-0', task_id: '0', trial: 0, termination_reason: 'user_stop',
    duration: 2, agent_cost: 0.01,
    reward_info: {
      reward: 1, db_check: { db_match: true, db_reward: 1 },
      env_assertions: [{ met: true, reward: 1, env_assertion: { name: 'check_state' } }],
      reward_basis: ['DB', 'ENV_ASSERTION'],
    },
    messages: [{ role: 'user', content: 'Hello\nsecond line' }],
  }],
}

async function mockMetadata(page: Page) {
  await page.route('**/health', (route) => route.fulfill({ json: { app_health: 'OK' } }))
  await page.route('**/api/v1/get_options', (route) => route.fulfill({
    json: {
      domains: ['retail', 'mock', 'intake'],
      agents: ['llm_agent', 'discrete_time_audio_native_agent'],
      users: ['user_simulator', 'dummy_user', 'voice_streaming_user_simulator'],
      task_sets: ['retail', 'mock', 'intake'],
    },
  }))
  await page.route('**/api/v1/get_tasks', (route) => route.fulfill({
    json: { tasks: Array.from({ length: 5 }, (_, i) => ({
      id: String(i), user_scenario: { instructions: `Scenario ${i}` },
    })) },
  }))
}

async function openReady(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始评测' })).toBeEnabled()
}

test('submitted payload equals preview; results show 100% and all check categories', async ({ page }) => {
  await mockMetadata(page)
  let payload: unknown
  await page.route('**/api/v1/run_domain', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: result })
  })
  await openReady(page)
  const preview = JSON.parse(await page.locator('pre').first().innerText())
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  const { run_id: _runId, ...submitted } = payload as Record<string, unknown>
  expect(typeof _runId).toBe('string')
  expect(submitted).toEqual(preview)
  await expect(page.locator('.ant-statistic').nth(1)).toContainText('100.0')
  await page.locator('tr[data-row-key="sim-0"]').click()
  await expect(page.locator('.message-bubble')).toHaveText('Hello\nsecond line')
  await expect(page.getByText('环境断言 (1/1)', { exact: true })).toBeVisible()
  await page.getByText('数据库检查', { exact: true }).click()
  await expect(page.getByText('db_match', { exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出结果 JSON' }).click()
  expect((await download).suggestedFilename()).toMatch(/^tau2-.*\.json$/)
})

test('history survives reload and older conversations can be reopened', async ({ page }) => {
  await mockMetadata(page)
  let run = 0
  await page.route('**/api/v1/run_domain', (route) => {
    run++
    return route.fulfill({ json: { ...result, timestamp: `run-${run}` } })
  })
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  await page.getByRole('button', { name: '新建评测' }).click()
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '历史结果' }).click()
  await expect(page.getByRole('cell', { name: 'run-1', exact: true })).toBeVisible()
  await page.getByRole('cell', { name: 'run-1', exact: true }).click()
  await page.locator('tr[data-row-key="sim-0"]').click()
  await expect(page.locator('.message-bubble')).toContainText('Hello')
})

test('navigation during a run does not unmount its state or allow duplicate submission', async ({ page }) => {
  await mockMetadata(page)
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  await page.route('**/api/v1/run_domain', async (route) => {
    calls++
    await pending
    await route.fulfill({ json: result })
  })
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  try {
    await expect(page.getByRole('button', { name: '评测运行中' })).toBeDisabled()
    await page.getByRole('button', { name: '历史结果' }).click()
    await page.getByRole('button', { name: '新建评测' }).click()
    await expect(page.getByRole('button', { name: '评测运行中' })).toBeDisabled()
  } finally {
    release()
  }
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  expect(calls).toBe(1)
})

test('failed metadata blocks evaluation and exposes a retry action', async ({ page }) => {
  await mockMetadata(page)
  await page.route('**/api/v1/get_options', (route) => route.fulfill({
    status: 500, json: { detail: 'Registry unavailable' },
  }))
  await page.goto('/')
  await expect(page.getByText('Registry unavailable', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始评测' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await page.route('**/api/v1/get_options', (route) => route.fulfill({
    json: { domains: ['retail'], agents: ['llm_agent'], users: ['user_simulator'], task_sets: ['retail'] },
  }))
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByRole('button', { name: '开始评测' })).toBeEnabled()
})

test('backend failure is visible and leaves the form available for retry', async ({ page }) => {
  await mockMetadata(page)
  await page.route('**/api/v1/run_domain', (route) => route.fulfill({
    status: 422, json: { detail: 'Invalid model' },
  }))
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByText('Invalid model', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始评测' })).toBeEnabled()
})

test('quota failure retains results in memory and warns before exporting', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 'tau2.evaluation.history.v1') throw new DOMException('Storage full', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await mockMetadata(page)
  await page.route('**/api/v1/run_domain', (route) => route.fulfill({ json: result }))
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  await expect(page.getByText(/结果已保留在当前页面/)).toBeVisible()
  await expect(page.getByRole('button', { name: '导出结果 JSON' })).toBeEnabled()
})

test('required model validation and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMetadata(page)
  await openReady(page)
  await page.getByRole('textbox', { name: 'Agent 模型' }).fill(' ')
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth))
    .toBeLessThanOrEqual(1)
})

test('changing language reloads the same task population used by the run', async ({ page }) => {
  await mockMetadata(page)
  await openReady(page)
  await page.locator('.ant-select').filter({
    has: page.getByRole('combobox', { name: /语言 \(language\)/ }),
  }).locator('.ant-select-selector').click()
  const option = page.locator('.ant-select-item-option').filter({ hasText: /^zh$/ })
  await expect(option).toBeVisible()
  const [request] = await Promise.all([
    page.waitForRequest((req) =>
      req.url().endsWith('/api/v1/get_tasks') && req.postDataJSON().language === 'zh'),
    option.click(),
  ])
  expect(request.postDataJSON()).toEqual({
    domain: 'retail', language: 'zh', agent: 'llm_agent', task_split_name: 'base',
  })
  await expect(page.getByRole('button', { name: '开始评测' })).toBeEnabled()
})

test('corrupt history is reported without replacing stored data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tau2.evaluation.history.v1', '{bad-json'))
  await mockMetadata(page)
  await openReady(page)
  await expect(page.getByRole('alert').filter({ hasText: /JSON/ })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('tau2.evaluation.history.v1'))).toBe('{bad-json')
})

test('stop button requests graceful stop and shows partial results', async ({ page }) => {
  await mockMetadata(page)
  const partial = { ...result, simulations: result.simulations.slice(0, 1) }
  let stopRequested = false
  await page.route('**/api/v1/run_domain', async (route) => {
    // Simulate the backend: run until stop is requested, then return partials.
    const deadline = Date.now() + 20000
    while (!stopRequested && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    await route.fulfill({ json: stopRequested ? partial : result })
  })
  await page.route('**/api/v1/stop_run', async (route) => {
    const body = route.request().postDataJSON()
    expect(typeof body.run_id).toBe('string')
    stopRequested = true
    await route.fulfill({ json: { run_id: body.run_id, stop_requested: true } })
  })
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('button', { name: '停止' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '停止' }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: /停\s*止/ }).click()
  await expect(page.getByText('已请求停止：等待进行中的模拟结束后返回已完成部分…')).toBeVisible()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('模拟总数').locator('..')).toContainText('1')
})

test('stop request failure is surfaced without breaking the run', async ({ page }) => {
  await mockMetadata(page)
  let released = false
  await page.route('**/api/v1/run_domain', async (route) => {
    const deadline = Date.now() + 20000
    while (!released && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    await route.fulfill({ json: result })
  })
  await page.route('**/api/v1/stop_run', (route) => {
    released = true
    return route.fulfill({ status: 500, json: { detail: 'Stop service unavailable' } })
  })
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('button', { name: '停止' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '停止' }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: /停\s*止/ }).click()
  await expect(page.getByText(/停止请求失败/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible({ timeout: 15000 })
})

test('unknown run id reports a benign stop outcome', async ({ page }) => {
  await mockMetadata(page)
  let released = false
  await page.route('**/api/v1/run_domain', async (route) => {
    const deadline = Date.now() + 20000
    while (!released && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    await route.fulfill({ json: result })
  })
  await page.route('**/api/v1/stop_run', (route) => {
    released = true
    return route.fulfill({ json: { run_id: 'x', stop_requested: false } })
  })
  await openReady(page)
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('button', { name: '停止' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '停止' }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: /停\s*止/ }).click()
  await expect(page.getByText('停止请求未生效：该运行可能已经结束。')).toBeVisible()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible({ timeout: 15000 })
})
