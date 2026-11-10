# τ²-bench 中文使用指南(智谱 GLM 默认配置版)

本仓库在官方 τ²-bench 基础上,将所有文本类 LLM 默认值切换为**智谱 GLM**(`zai/glm-5.3` 与 `zai/glm-5.3-flash`),并默认路由到**国内版端点** `open.bigmodel.cn`。本文档说明配置与运行步骤。

> 环境问题排查记录(代理、portaudio、portable-ruby 等)见 [readme.zn.md](./readme.zn.md)。

---

## 目录

1. [项目简介](#项目简介)
2. [安装](#安装)
3. [配置智谱 API Key](#配置智谱-api-key)
4. [文本评测(半双工)](#文本评测半双工)
5. [语音评测(全双工)](#语音评测全双工)
6. [τ-Entity(intake 域)](#τ-entityintake-域)
7. [运行 examples(自定义 Agent 示例)](#运行-examples自定义-agent-示例)
8. [结果查看与裁判](#结果查看与裁判)
9. [智谱模型路由规则](#智谱模型路由规则)
10. [常用命令速查](#常用命令速查)
11. [常见问题](#常见问题)
12. [微语 Agent 评测平台前端](#微语-agent-评测平台前端)

---

## 微语 Agent 评测平台前端

微语是基于 TypeScript、React 和 Ant Design 的评测工作台，位于
[web/evaluation](./web/evaluation/README.md)，支持配置文本评测、选择本地化任务、
调用后端 API、查看奖励检查与对话，以及保存和导出历史结果。

```bash
# 仓库根目录启动后端（API Key 保持在后端 .env 中）
UV_FROZEN=1 uv run uvicorn tau2.api_service.simulation_service:app --host 127.0.0.1 --port 8001

# 另一个终端启动前端（Node.js ^20.19.0 / ^22.13.0 / >=24）
cd web/evaluation
npm ci
npm run dev
```

开发代理指向 `127.0.0.1:8001`。生产部署需要同源反向代理和访问控制，
不要将无鉴权的评测接口直接公开。包括 mock 域在内的真实运行会调用模型并产生费用；
测试命令与部署说明见[前端文档](./web/evaluation/README.md)。

---

## 项目简介

τ-bench 是一个评估对话式客服 Agent 的仿真框架,支持:

- **文本半双工**(turn-based):逐轮对话 + 工具调用
- **语音全双工**(streaming):实时音频流,支持 OpenAI、Gemini、xAI 等 realtime provider

可用域:`mock` · `airline`(航空) · `retail`(零售) · `telecom`(电信) · `banking_knowledge`(银行知识检索) · `intake`(τ-Entity 实体采集)

默认模型(本仓库定制):

| 用途 | 模型 |
|---|---|
| Agent / 用户模拟器 | `zai/glm-5.3` |
| τ-Entity 用户模拟器 | `zai/glm-5.3` |
| NL 断言裁判 | `zai/glm-5.3-flash` |
| 环境接口 | `zai/glm-5.3` |
| 语义通信评分 | `zai/glm-5.3` |
| 语音用户模拟器决策 | `zai/glm-5.3-flash` |

---

## 安装

要求:Python `>=3.12, <3.14`,[uv](https://docs.astral.sh/uv/getting-started/installation/) 包管理器。

```bash
git clone https://github.com/sierra-research/tau2-bench
cd tau2-bench

uv sync                        # 核心(含 scaffolded intake 文本运行)
uv sync --extra voice          # + 语音/audio-native 功能
uv sync --extra knowledge      # + banking_knowledge 域(检索管线)
uv sync --extra gym            # + gymnasium RL 接口
uv sync --extra dev            # + pytest/ruff(贡献代码必需)
uv sync --all-extras           # 全部
```

macOS 语音功能还需系统依赖:

```bash
brew install portaudio ffmpeg
```

> 中国大陆网络下 `uv sync` 建议带镜像:
> `UV_FROZEN=1 UV_DEFAULT_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple uv sync --extra voice`
> 详见 [readme.zn.md](./readme.zn.md)。

验证安装:

```bash
uv run tau2 check-data
```

---

## 配置智谱 API Key

### 1. 获取 Key

从[智谱 AI 开放平台](https://open.bigmodel.cn)注册并创建 API Key。

### 2. 写入 .env

```bash
cp .env.example .env
```

编辑 `.env`,添加国内版 key:

```bash
ZHIPUAI_API_KEY=你的key
```

框架会自动:
- 将 `ZHIPUAI_API_KEY` 复用为 LiteLLM 的 `ZAI_API_KEY`
- 将请求端点路由到 `https://open.bigmodel.cn/api/paas/v4`(国内版)

### 3. (可选)国际版或其他端点

若使用国际版 [Z.ai](https://z.ai) 的 key,改设:

```bash
ZAI_API_KEY=你的国际版key      # 端点自动为 https://api.z.ai/api/paas/v4
```

自定义端点:

```bash
ZAI_API_BASE=https://你的端点/api/paas/v4
```

完整路由规则见 [智谱模型路由规则](#智谱模型路由规则)。

### 4. 其他 Provider Key(按需)

| 变量 | 用途 |
|---|---|
| `ELEVENLABS_API_KEY` | 语音合成(TTS) |
| `DEEPGRAM_API_KEY` | 语音转写 |
| `GEMINI_API_KEY` | Gemini Live 语音 Agent / 语音保真裁判 |
| `XAI_API_KEY` | xAI 语音 Agent |
| `OPENAI_API_KEY` | 语音转写(whisper/gpt-4o-transcribe)、banking_knowledge 的 openai_embeddings 检索配置 |
| `OPENROUTER_API_KEY` | banking_knowledge 的 qwen_embeddings 检索配置 |
| `TAU2_VOICE_ID_<LANG>_<PERSONA>` | 语音 persona 音色 ID(见下文语音部分) |

---

## 文本评测(半双工)

### 最小示例(mock 域)

```bash
uv run tau2 run --domain mock --num-tasks 2 --dry-run
```

`--dry-run` 只打印运行计划,不发起任何 provider 调用。

### 常规运行

```bash
uv run tau2 run --domain airline --num-trials 1 --num-tasks 5
```

不带 `--agent-llm`/`--user-llm` 时,默认使用 `zai/glm-5.3`(智谱)。

显式指定模型与参数:

```bash
uv run tau2 run --domain retail \
  --agent-llm zai/glm-5.3 \
  --user-llm zai/glm-5.3 \
  --num-tasks 5 --save-to retail-run
```

### 多语言(τ-i18n)

```bash
uv run tau2 run --domain retail --language zh --num-tasks 5
```

`--language` 可选:`en` `es` `pt` `hi` `zh` `ko`。`zh` 即中文语言包(本地化任务、数据库与用户 persona)。

### 发布版文本基准(text-v1)

```bash
uv run tau2 run --benchmark text --save-to text-run --dry-run
```

text-v1 = 6 语言 × 3 域(airline/retail/telecom)× 每域 50 个冻结任务,单 trial 共 900 通"电话"。

⚠️ 发布版基准的用户模拟器默认 `zai/glm-5.3`(本仓库定制);官方榜以 `openai/gpt-5.5` 为用户模拟器,结果**不可直接对比**。如需对齐官方设置:

```bash
uv run tau2 run --benchmark text --user-llm openai/gpt-5.5 \
  --user-llm-args '{"reasoning_effort":"low"}'
```

(需要 `OPENAI_API_KEY`。)

---

## 语音评测(全双工)

语音评测通过 realtime provider(WebSocket)驱动被测 Agent,需要对应 provider 的 key;用户模拟器仍走智谱文本 API。

### 1. 创建自己的音色(必需)

内置音色 ID 是 Sierra 内部的,外部不可用,需先用 ElevenLabs 创建:

```bash
uv run python -m tau2.voice.scripts.setup_voices --language all
# 输出若干 TAU2_VOICE_ID_<LANG>_<PERSONA> 行,粘贴到 .env
```

### 2. 运行

```bash
# 冒烟测试(12 通)
uv run tau2 run --audio-native --domain retail --num-tasks 2 --dry-run

# 发布版 voice-v2(τ-i18n,6 语言 × 3 域,900 通)
uv run tau2 run --audio-native --audio-native-model gpt-realtime-2 \
  --reasoning-effort minimal --save-to voice-run --dry-run

# 英文 voice-v1(英文语音榜,278 通)
uv run tau2 run --audio-native --benchmark voice-v1 --dry-run
```

去掉 `--dry-run` 实际运行。被测 Agent 是 realtime provider 的模型(如 `gpt-realtime-2`),**不是**智谱;智谱只负责用户模拟器与裁判。

### 语音相关参数

| 参数 | 说明 |
|---|---|
| `--audio-native-provider` | `openai`(默认) `gemini` `xai` `nova` `qwen` `deepgram` `livekit` 等 |
| `--audio-native-model` | provider 侧模型,如 `gpt-realtime-2` |
| `--reasoning-effort` | realtime 模型推理力度 |
| `--benchmark voice` / `voice-v1` / `none` | 发布版语音基准选择 |

---

## τ-Entity(intake 域)

τ-Entity 评估外呼场景下对姓名、地址等实体的精确采集,200+ 任务:

```bash
# Agent-directed(默认,仅语音)
uv run tau2 run --domain intake --audio-native --benchmark none --num-tasks 2

# scaffolded 消融(支持文本)
uv run tau2 run --domain intake --elicitation-strategy scaffolded --num-tasks 2
```

详见 [docs/elicitation.md](./docs/elicitation.md)。

---

## 运行 examples(自定义 Agent 示例)

[examples/agents/](./examples/agents/) 下有三个可直接运行的自定义 Agent 示例(本仓库已把示例默认模型改为 `zai/glm-5.3-flash`,配合智谱 key 开箱即用):

### 1. `minimal_text_agent.py` — 最小示例(从这里开始)

单文件演示:继承 `HalfDuplexAgent` 实现两个必需方法 → 写工厂函数 → 注册到 registry → 在 mock 域跑一个任务:

```bash
uv run python examples/agents/minimal_text_agent.py
```

输出示例(实测,智谱国内端点):

```
Task: create_task_1
Reward: 1.0
Messages: 8
```

### 2. `react_agent.py` — ReAct 模式

显式"先思考后行动"的 Agent:每轮先 **THINK**(无工具 LLM 调用推理),再 **ACT**(带工具 LLM 调用决策),可提升工具调用准确率:

```bash
uv run python examples/agents/react_agent.py
```

### 3. `custom_agent_eval.py` — 手动组装(进阶)

不经过 registry,手动构建 environment / agent / user / orchestrator 并直接调 `run_simulation()`,演示结果检查(消息、reward、评估细节)与自定义行为(日志、调用计数):

```bash
uv run python examples/agents/custom_agent_eval.py
```

### Agent 接口要点

每个文本 Agent 继承 `HalfDuplexAgent` 并实现两个方法:

```python
class MyAgent(HalfDuplexAgent[MyState]):
    def get_init_state(self, message_history=None) -> MyState:
        """返回初始状态(系统提示 + 历史)。"""

    def generate_next_message(self, message, state) -> tuple[AssistantMessage, MyState]:
        """根据输入消息与当前状态,返回(回复, 新状态)。"""
```

构造函数接收 `tools: list[Tool]`(域工具)与 `domain_policy: str`(域政策文档);LLM 侧直接用 `tau2.utils.llm_utils.generate()`。完整开发指南见 [src/tau2/agent/README.md](./src/tau2/agent/README.md),示例说明见 [examples/agents/README.md](./examples/agents/README.md)。

---

## 结果查看与裁判

结果保存在 `data/simulations/<name>/`:

```bash
uv run tau2 view --file data/simulations/retail-run     # 分数与对话
uv run tau2 judges suite data/simulations/voice-run     # 语音裁判(voice-v2 提交必需)
```

裁判是**诊断性质**,不影响任务 reward。详见 [docs/judge-validation.md](./docs/judge-validation.md)。

---

## 智谱模型路由规则

模型名保持 `zai/` 前缀(LiteLLM 仅识别此前缀);端点按环境变量自动解析:

| `.env` 配置 | 请求端点 | 使用的 Key |
|---|---|---|
| 只设 `ZHIPUAI_API_KEY` | `https://open.bigmodel.cn/api/paas/v4`(国内) | 国内 key |
| 只设 `ZAI_API_KEY` | `https://api.z.ai/api/paas/v4`(国际) | 国际 key |
| 两者都设 | `https://api.z.ai/api/paas/v4` | 国际 key |
| `ZAI_API_BASE` 显式设置 | 用户指定 | 对应 key |
| 都未设置 | `https://open.bigmodel.cn/api/paas/v4` | 无(调用时报错) |

实现位于 [src/tau2/utils/llm_utils.py](./src/tau2/utils/llm_utils.py),在模块导入时通过环境变量完成路由。

**成本统计**:安装的 LiteLLM 价格表较旧、缺 glm-5.3 条目,已在 llm_utils.py 用 `litellm.register_model` 注册官方定价(输入 ¥1.4/M tokens,输出 ¥4.4/M tokens,源:docs.z.ai),成本字段可正常统计。

**GLM 推理**:zai provider 不认 `reasoning_effort` 参数(会被安全丢弃);如需开启 GLM 思考模式:

```bash
--user-llm-args '{"thinking": {"type": "enabled"}}'
```

---

## 常用命令速查

```bash
# 概览(域、命令、示例)
uv run tau2 intro

# 数据目录检查
uv run tau2 check-data

# 干跑任意命令,先看计划
uv run tau2 run ... --dry-run

# 浏览已保存结果
uv run tau2 view

# 冻结任务子集
uv run tau2 tasks

# 交互式环境 CLI(测试域内工具)
make env-cli
```

---

## 常见问题

**Q: 报 `ZAI_API_KEY`/认证错误?**
A: 确认 `.env` 里设置了 `ZHIPUAI_API_KEY`(国内)或 `ZAI_API_KEY`(国际),且在仓库根目录运行命令(`load_dotenv()` 从当前目录读取)。

**Q: 想复现官方榜单数字?**
A: 官方用户模拟器为 `openai/gpt-5.5`,本仓库默认已换为智谱。对齐官方:`--user-llm openai/gpt-5.5 --user-llm-args '{"reasoning_effort":"low"}'`。

**Q: 语音运行报连接超时?**
A: realtime provider 需要能访问对应端点(如 OpenAI),检查代理设置;国内网络下 `socks://` scheme 无效,需用 `socks5h://`(详见 [readme.zn.md](./readme.zn.md))。

**Q: `pyaudio` 编译失败?**
A: `brew install portaudio` 后重试;完整排查见 [readme.zn.md](./readme.zn.md)。

**Q: 如何贡献代码 / 跑测试?**
A: `uv sync --extra dev` 后 `make test`、`make check-all`(pre-commit 强制)。测试分层见根 [README.md](./README.md)。

---

## 更多文档

- [README.md](./README.md) — 官方英文总览
- [docs/getting-started.md](./docs/getting-started.md) — 安装与首次运行
- [docs/running-the-benchmark.md](./docs/running-the-benchmark.md) — 基准运行细节
- [docs/cli-reference.md](./docs/cli-reference.md) — 全命令参考
- [docs/glossary.md](./docs/glossary.md) — pack / cell / frame / pin 等术语
- [readme.zn.md](./readme.zn.md) — 环境问题排查记录(中文)
