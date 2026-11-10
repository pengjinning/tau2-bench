import { test, expect, type Page } from '@playwright/test'
import { zhRegistry, zhResult, zhTasks } from './fixtures/zh-fixtures'

// 与 evaluation.spec.ts 中的英文 mock 对应的中文数据流程测试：
// 语言切换为 zh 后，任务预览、提交的 RunConfig 与结果页展示均使用中文数据。

const enTasks = Array.from({ length: 5 }, (_, i) => ({
  id: String(i), user_scenario: { instructions: `Scenario ${i}` },
}))

async function mockChineseBackend(page: Page) {
  await page.route('**/health', (route) => route.fulfill({ json: { app_health: 'OK' } }))
  await page.route('**/api/v1/get_options', (route) => route.fulfill({ json: zhRegistry }))
  await page.route('**/api/v1/get_tasks', (route) => {
    const { language } = route.request().postDataJSON() as { language?: string }
    return route.fulfill({ json: { tasks: language === 'zh' ? zhTasks : enTasks } })
  })
}

async function selectLanguage(page: Page, language: string) {
  await page.locator('.ant-select').filter({
    has: page.getByRole('combobox', { name: /语言 \(language\)/ }),
  }).locator('.ant-select-selector').click()
  await page.locator('.ant-select-item-option').filter({ hasText: new RegExp(`^${language}$`) }).click()
}

test('zh run flows Chinese tasks and results end to end', async ({ page }) => {
  await mockChineseBackend(page)
  let payload: unknown
  await page.route('**/api/v1/run_domain', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: zhResult })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始评测' })).toBeEnabled()

  // 切到中文后重新拉取任务列表，任务摘要可按中文关键词过滤
  const zhRequest = page.waitForRequest((req) =>
    req.url().endsWith('/api/v1/get_tasks') && req.postDataJSON().language === 'zh')
  await selectLanguage(page, 'zh')
  expect((await zhRequest).postDataJSON()).toMatchObject({
    domain: 'retail', language: 'zh', agent: 'llm_agent', task_split_name: 'base',
  })
  await expect(page.getByPlaceholder('按任务 ID 或用户情景描述过滤下拉列表'))
    .toHaveValue('')
  await page.getByPlaceholder('按任务 ID 或用户情景描述过滤下拉列表').fill('退款')
  await expect(page.locator('.ant-select-selection-placeholder').filter({ hasText: '过滤结果' }))
    .toHaveText('过滤结果 1 / 5 个任务')

  // 提交的 RunConfig 带上 zh 语言
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  expect(payload).toMatchObject({ domain: 'retail', language: 'zh' })

  // 结果页：语言标签、中文对话与各检查分类
  await expect(page.getByText('语言 zh', { exact: true })).toBeVisible()
  await expect(page.locator('.ant-statistic').nth(1)).toContainText('50.0')
  await page.locator('tr[data-row-key="sim-zh-0"]').click()
  await expect(page.locator('.message-bubble').first())
    .toContainText('您好，我这边有个情况想麻烦您处理一下。')
  await expect(page.locator('.message-bubble').last())
    .toContainText('差价 39 元会在 3-5 个工作日内退回原支付方式')
  await expect(page.getByText('环境断言 (1/1)', { exact: true })).toBeVisible()
  await expect(page.getByText('动作检查 (1/1)', { exact: true })).toBeVisible()
  await page.getByText('自然语言断言 (1/1)', { exact: true }).click()
  await expect(page.getByText('客服在办理换货前与用户确认了新旧商品型号', { exact: true })).toBeVisible()
  await page.getByText('信息传达 (1/1)', { exact: true }).click()
  await expect(page.getByText('换货后的差价退款时效为 3-5 个工作日', { exact: true })).toBeVisible()

  // 部分得分的模拟：信息传达未满足
  await page.locator('tr[data-row-key="sim-zh-1"]').click()
  await page.getByText('信息传达 (0/1)', { exact: true }).click()
  await expect(page.getByText('退款将在 5 个工作日内到账', { exact: true })).toBeVisible()
  await expect(page.getByText(/没有给出具体的到账时间/)).toBeVisible()
})

test('zh history survives reload and reopens Chinese conversations', async ({ page }) => {
  await mockChineseBackend(page)
  await page.route('**/api/v1/run_domain', (route) => route.fulfill({ json: zhResult }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始评测' })).toBeEnabled()
  await page.getByRole('button', { name: '开始评测' }).click()
  await expect(page.getByRole('heading', { name: '评测结果' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '历史结果' }).click()
  await expect(page.getByRole('cell', { name: '2026-11-03T15:30:00', exact: true })).toBeVisible()
  await page.locator('tr[data-row-key="sim-zh-0"]').click()
  await expect(page.locator('.message-bubble').first()).toContainText('机械键盘换成青轴同款')
})
