import type { RegistryInfo, Results, Task } from '../../src/api/types'

/**
 * 中文 mock 数据，与英文内联 mock（tests/evaluation.spec.ts）结构一致，英文数据保持不变。
 * 文案参考 data/tau2/multilingual/zh 语言包与零售域本地化（retail.json）的用语风格。
 */

export const zhRegistry: RegistryInfo = {
  domains: ['retail', 'mock', 'intake'],
  agents: ['llm_agent', 'discrete_time_audio_native_agent'],
  users: ['user_simulator', 'dummy_user', 'voice_streaming_user_simulator'],
  task_sets: ['retail', 'mock', 'intake'],
}

export const zhTasks: Task[] = [
  {
    id: '0',
    description: {
      purpose: '验证一次通话内完成两件商品的换货流程',
      relevant_policies: null,
      notes: null,
    },
    user_scenario: {
      persona: 'jianguo_zh_v1',
      instructions: {
        domain: 'retail',
        reason_for_call:
          '您收到了订单 #W5836214，想把手上的机械键盘换成青轴同款，再把手环换成大一号的。',
        known_info: '您是王建国，收货邮编 100101。',
        unknown_info: '您想不起当时下单用的注册邮箱。',
        task_instructions: '您做事细致，希望一次通话把两件换货都办妥。',
      },
    },
  },
  {
    id: '1',
    description: null,
    user_scenario: {
      persona: 'jianguo_zh_v1',
      instructions: {
        domain: 'retail',
        reason_for_call: '您上周退回的羽绒服还没有收到退款，想查询退款进度。',
        known_info: '您是王建国，退货订单号 #W1740553。',
        unknown_info: '您不确定当时用的是哪张银行卡支付的。',
        task_instructions: '如果退款还没有发起，请客服帮忙催一下处理。',
      },
    },
  },
  {
    id: '2',
    description: null,
    user_scenario: {
      persona: 'jianguo_zh_v1',
      instructions: {
        domain: 'retail',
        reason_for_call: '您下周要出差，想把订单 #W3689051 的收货地址改到公司。',
        known_info: '您是王建国，新地址在北京市海淀区知春路 27 号。',
        unknown_info: null,
        task_instructions: '改地址前请客服跟您确认一遍新地址，不要改错。',
      },
    },
  },
  {
    id: '3',
    description: null,
    user_scenario: {
      persona: 'jianguo_zh_v1',
      instructions: {
        domain: 'retail',
        reason_for_call: '您下单时用的满 300 减 40 优惠券没有生效，想让人工核实。',
        known_info: '您是王建国，订单 #W5836214 实付金额比预期多了 40 元。',
        unknown_info: null,
        task_instructions: '您希望要么补回优惠券差价，要么整单按原价退掉重拍。',
      },
    },
  },
  {
    id: '4',
    description: null,
    user_scenario: {
      persona: 'jianguo_zh_v1',
      instructions: {
        domain: 'retail',
        reason_for_call: '您需要把上周购买的智能恒温器开一张单位抬头的发票。',
        known_info: '您是王建国，订单 #W1740553，抬头是“北京华信科技有限公司”。',
        unknown_info: '您记不清税号后四位。',
        task_instructions: '如果税号必填，您愿意稍后补充，先把申请登记上。',
      },
    },
  },
]

export const zhResult: Results = {
  timestamp: '2026-11-03T15:30:00',
  info: { language: 'zh' },
  tasks: [zhTasks[0], zhTasks[1]],
  simulations: [
    {
      id: 'sim-zh-0',
      task_id: '0',
      trial: 0,
      termination_reason: 'agent_stop',
      duration: 3.5,
      agent_cost: 0.012,
      reward_info: {
        reward: 1,
        db_check: { db_match: true, db_reward: 1 },
        env_assertions: [
          { met: true, reward: 1, env_assertion: { name: '换货订单已写入数据库' } },
        ],
        action_checks: [
          {
            action: {
              action_id: '0_4',
              name: 'exchange_delivered_order_items',
              arguments: { order_id: '#W5836214', item_ids: ['8046392929'] },
            },
            action_match: true,
            action_reward: 1,
            tool_type: 'write',
          },
        ],
        nl_assertions: [
          {
            nl_assertion: '客服在办理换货前与用户确认了新旧商品型号',
            met: true,
            justification: 'Agent 在调用换货工具前复述了青轴键盘型号，并得到用户确认。',
          },
        ],
        communicate_checks: [
          {
            info: '换货后的差价退款时效为 3-5 个工作日',
            met: true,
            justification: 'Agent 明确告知了差价退回原支付方式的时效。',
          },
        ],
        reward_basis: ['DB', 'ENV_ASSERTION', 'ACTION', 'NL_ASSERTION', 'COMMUNICATE'],
        reward_breakdown: { DB: 1, ENV_ASSERTION: 1, ACTION: 1, NL_ASSERTION: 1, COMMUNICATE: 1 },
      },
      messages: [
        {
          role: 'user',
          content: '您好，我这边有个情况想麻烦您处理一下。\n我想把手上的机械键盘换成青轴同款。',
          turn_idx: 0,
        },
        {
          role: 'assistant',
          content: '好的，您稍等，我先帮您核对一下订单。',
          tool_calls: [
            {
              id: 'call_1',
              name: 'get_order_details',
              arguments: { order_id: '#W5836214' },
              requestor: 'agent',
            },
          ],
          turn_idx: 0,
        },
        {
          role: 'tool',
          id: 'call_1',
          content: '{"order_id": "#W5836214", "items": [{"item_id": "8046392929", "name": "机械键盘"}]}',
          turn_idx: 0,
        },
        {
          role: 'assistant',
          content: '已经帮您办好了：键盘换成青轴同款，差价 39 元会在 3-5 个工作日内退回原支付方式。',
          turn_idx: 1,
        },
      ],
    },
    {
      id: 'sim-zh-1',
      task_id: '1',
      trial: 0,
      termination_reason: 'user_stop',
      duration: 2.2,
      agent_cost: 0.008,
      reward_info: {
        reward: 0.5,
        db_check: { db_match: true, db_reward: 1 },
        communicate_checks: [
          {
            info: '退款将在 5 个工作日内到账',
            met: false,
            justification: 'Agent 只回复了“快了”，没有给出具体的到账时间。',
          },
        ],
        reward_basis: ['DB', 'COMMUNICATE'],
        reward_breakdown: { DB: 1, COMMUNICATE: 0 },
      },
      messages: [
        { role: 'user', content: '您好，我想查一下上周那笔退款到账了没有。', turn_idx: 0 },
        { role: 'assistant', content: '帮您确认过了，退款正在处理中，快了。', turn_idx: 0 },
      ],
    },
  ],
}
