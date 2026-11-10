# 微语 Agent 评测平台前端

微语是基于 **TypeScript + React 19 + Ant Design 5 + Vite** 的 Agent 评测平台前端
（底层为 τ-bench 评测框架），对接本仓库自带的 FastAPI 服务
（`src/tau2/api_service/simulation_service.py`），实现从配置、发起到结果分析的完整 Agent 评测流程。

## 功能

- **新建评测**：配置域（mock / airline / retail / telecom / banking_knowledge / intake…）、
  语言包、Agent 与用户模拟器模型、任务选择（默认顺序前 N 个或指定 task_ids）、
  重复次数、并发数、随机种子等；右侧实时预览最终提交的 `RunConfig` JSON。
  - banking_knowledge 域自动提供 `retrieval_config` 选项
  - intake 域使用支持文本的 scaffolded 策略与复杂来电概率（不是执行并发数）
- **发起评测**：调用 `POST /api/v1/run_domain` 同步执行（后端长时间运行，页面保持打开）。
  运行中可点击「停止」按钮：后端不再开始新任务，进行中的模拟完成后返回已完成的部分结果，
  未运行的任务可通过相同 `save_to` 名称续跑（checkpoint 断点续传）。
- **结果分析**：
  - 汇总卡片：模拟总数、成功率（reward = 1）、平均 Reward、Agent 总花费
  - 模拟明细表：每个 task × trial 的 reward、DB 校验、终止原因、耗时、花费
  - 点击任意一行查看完整对话时间线（用户/Agent/工具调用气泡）
    与 RewardInfo 明细（DB、环境断言、动作、自然语言断言、信息传达检查）
- **历史记录**：浏览器 localStorage 保存最近 20 次完整结果与配置，可切换回看对话、导出 JSON。
  超出浏览器存储配额或存储损坏时显示警告，当前结果仍保留在内存中；请导出后再关闭。
  会尝试读取旧版本 sessionStorage 中最后一次完整结果；旧的仅含索引的历史记录
  无法恢复对话，原有存储不会被删除。
- **停止按钮**：运行中显示「停止」按钮，确认后调用 `POST /api/v1/stop_run`。
  停止是**优雅停止**：后端不再领取新任务，进行中的模拟会跑到结束并计入结果，
  随后接口返回部分 `Results`，前端照常展示与保存。停止请求失败或运行已结束会有明确提示。
- **后端健康检测**：挂载时检查，支持手动刷新；接口错误可见并支持重试。

> 所有真实评测（包括 mock 域）都会调用所选模型，可能产生费用。自动 LLM 评审也会额外调用模型。
> API Key 仅在后端配置，不要放入前端环境变量。

## 快速开始

```bash
# 1. 启动后端（仓库根目录）
UV_FROZEN=1 uv run uvicorn tau2.api_service.simulation_service:app --host 127.0.0.1 --port 8001

# 2. 启动前端
cd web/evaluation
npm install
npm run dev                            # http://localhost:5173 (端口占用时自动顺延)
```

要求 Node.js `^20.19.0 || ^22.13.0 || >=24`。已有锁文件时使用 `npm ci` 安装。

开发模式下 Vite 已将 `/api/*` 与 `/health` 代理到 `http://127.0.0.1:8001`
（见 `vite.config.ts`）。生产部署推荐同源反向代理 `/api` 与 `/health`；
代理的读取超时应覆盖评测耗时。`VITE_API_BASE` 可在构建时指定后端地址，
但跨域访问需要部署侧明确配置允许的来源（后端没有默认开放 CORS）。

本服务是可信本地环境的执行入口，没有登录鉴权；不要直接暴露到公网。
`save_to` 是运行名称，结果写入后端的 `data/simulations/<名称>/results.json`，
留空时自动生成名称，并非“不保存”。完整原始响应也可通过前端导出。

> 注意：若 shell 设置了 `HTTP_PROXY`/`HTTPS_PROXY`（如 socks 代理），启动后端前
> 需要清空代理变量，否则 `httpx` 初始化会失败：
> `HTTP_PROXY= HTTPS_PROXY= sh scripts/start_tau2_server.sh`

## 构建与检查

```bash
npm run build    # tsc -b && vite build  → dist/
npm run lint     # ESLint (flat config)
npm test         # 指标、配置、存储单元测试
npx playwright install chromium   # 首次运行浏览器测试时
npm run test:e2e  # 使用模拟 API 的浏览器回归测试，不调用真实模型
# 已安装 Chrome 时也可运行：
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

浏览器测试的 mock 数据分中英文两份：英文内联在 `tests/evaluation.spec.ts`，
中文在 `tests/fixtures/zh-fixtures.ts`（对齐 `data/tau2/multilingual/zh` 语言包的用语），
由 `tests/zh-data.spec.ts` 覆盖 `--language zh` 的任务预览、RunConfig 提交与结果展示流程。

仓库根目录运行后端针对性测试：
`UV_FROZEN=1 uv run pytest tests/test_api_service.py -q`。
测试覆盖语言/默认 base 拆分任务预览，以及运行评测期间健康接口不被阻塞。

运行中可切换前端导航而不丢失状态；刷新或关闭会收到离页提示。刷新后**无法重连**到原运行，
但可用相同 `save_to` 名称重新发起，后端会从 checkpoint 续跑未完成的任务。
主动停止请使用「停止」按钮（优雅停止）；浏览器网络中断不等于服务端停止，
重试前请先确认后端是否仍在执行，避免重复计费。
成功率只统计有奖励的模拟，缺失奖励和缺失费用会明确提示，不会显示为零。

## 目录结构

```text
src/
├── api/
│   ├── client.ts          # axios 封装与后端接口调用
│   └── types.ts           # 与 tau2.data_model 对应的 TypeScript 类型
├── components/
│   ├── ConversationView.tsx   # 对话时间线（用户/Agent/工具消息）
│   └── RewardDetails.tsx      # RewardInfo 明细面板
├── pages/
│   ├── newRun/
│   │   ├── NewRunPage.tsx     # 评测配置表单 + RunConfig 预览
│   │   ├── TaskSelector.tsx   # 任务多选/过滤/摘要
│   │   └── taskUtils.ts
│   └── results/ResultsPage.tsx  # 结果统计、明细表、对话查看
├── App.tsx                # 侧栏导航 + 后端健康状态
└── main.tsx               # antd 中文 locale / React 19 兼容补丁
```

## 后端接口

| 方法 | 路径 | 说明 |
| ------ | ------ | ------ |
| GET | `/health` | 健康检查 |
| POST | `/api/v1/get_options` | 可用域 / Agent / 用户模拟器 / 任务集 |
| POST | `/api/v1/get_tasks` | `domain` + `language` + `agent` + `task_split_name` 的运行任务预览 |
| POST | `/api/v1/run_domain` | 提交 `RunConfig`，同步执行并返回 `Results`；可选 `run_id` 用于停止 |
| POST | `/api/v1/stop_run` | 对 `run_id` 请求优雅停止：不再开始新任务，进行中的模拟完成后返回部分结果 |

`RunConfig` 为文本（半双工）模式配置；语音全双工评测请使用 CLI（`tau2 run --audio-native`）。
只传 `domain` 的旧版 `get_tasks` 请求仍返回原始任务列表；带 `language` 的请求
使用与运行端相同的语言绑定、任务拆分和 Agent 任务过滤。
