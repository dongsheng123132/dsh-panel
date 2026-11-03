// dsh-panel —— 多 AI 专家会审，按次从虾盘云钱包扣费
// 插件形态：命名插件（name / inject / apply），无默认导出；工具注册在 ctx.tools
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createWallet } from './lib/wallet.mjs'
import { runPanel, TIERS } from './lib/panel.mjs'

export const name = 'hfshfg-panel'
export const inject = ['tools']

function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

export function createDefinitions(ctx, config = {}) {
  const wallet = createWallet(config)

  const hintFor = (message) => {
    const s = wallet.status()
    if (/余额不足/.test(message)) return `充值后重试：${s.rechargeUrl || '（未绑定钱包）'}`
    if (/凭证失效|401|403/.test(message)) {
      return '先跑 dsh_aigc_wallet 或 dsh_panel_models 看钱包状态：余额为 0 或负数时上游会报 Invalid token，充值即可；余额正常才说明密钥失效，用 adopt 换一把。'
    }
    return undefined
  }

  return [
    defineTool({
      name: 'dsh_panel_ask',
      description:
        'Ask several frontier models the same question, then have a chair model synthesise consensus, disagreements and a verdict. ' +
        'Billed per use: every member call and the chair call spend Xiapan Cloud wallet balance, so tier matters (econ ≈ ¥0.01, deep can reach ¥0.5). ' +
        'Use econ for screening, std for ordinary decisions, deep only for decisions where being wrong is expensive.',
      parameters: {
        question: { type: 'string', required: true, description: 'The decision or question to put to the panel. Be specific.' },
        context: { type: 'string', description: 'Optional background the panel needs (data, constraints, prior attempts).' },
        tier: { type: 'string', enum: ['econ', 'std', 'deep'], description: 'Cost tier; default econ (cheapest).' },
        models: { type: 'array', items: { type: 'string' }, description: 'Override panel members with explicit model ids.' },
        judge: { type: 'string', description: 'Override the chair model.' },
        temperature: { type: 'number', description: 'Sampling temperature, default 0.3.' }
      },
      output: { schema: { type: 'json' }, render: renderJson },
      async execute(args) {
        try {
          const s = await wallet.ensureKey()
          const result = await runPanel({
            baseUrl: wallet.baseUrl,
            apiKey: s.apiKey,
            question: args.question,
            context: args.context,
            tier: args.tier || config.defaultTier || 'econ',
            models: args.models,
            judge: args.judge,
            temperature: args.temperature ?? 0.3,
            maxTokens: config.maxTokens,
            timeoutMs: config.timeoutMs
          })
          return { ok: true, ...result }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, error: message, ...(hintFor(message) ? { hint: hintFor(message) } : {}) }
        }
      }
    }),

    defineTool({
      name: 'dsh_panel_models',
      description:
        'List the review tiers, their member models, and which chat models the wallet can actually call (read from /api/pricing, not a bundled list). Also reports wallet status and balance. Free: no generation is billed.',
      parameters: {
        filter: { type: 'string', description: 'Optional substring to filter model ids.' }
      },
      output: { schema: { type: 'json' }, render: renderJson },
      async execute(args) {
        try {
          const s = await wallet.ensureKey()
          const status = wallet.status()
          const balance = await wallet.balance(s.apiKey)

          let models = []
          try {
            const r = await fetch(`${wallet.baseUrl}/api/pricing`, {
              headers: { authorization: `Bearer ${s.apiKey}` },
              signal: AbortSignal.timeout(config.timeoutMs ?? 20000)
            })
            if (r.ok) {
              const j = await r.json()
              models = (j?.data || [])
                .map((m) => ({ id: m.model_name, ratio: m.model_ratio ?? null }))
                .filter((m) => !/image|audio|tts|video|embed|rerank|whisper|suno|realtime/i.test(m.id))
            }
          } catch { /* 定价接口失败不影响档位展示 */ }

          const f = (args.filter || '').trim().toLowerCase()
          const shown = f ? models.filter((m) => m.id.toLowerCase().includes(f)) : models
          return {
            ok: true,
            tiers: Object.fromEntries(
              Object.entries(TIERS).map(([k, v]) => [k, { label: v.label, models: v.models, judge: v.judge, note: v.note }])
            ),
            availableChatModels: shown.slice(0, 80),
            availableCount: shown.length,
            wallet: { ...status, balance },
            note: '模型清单来自 /api/pricing，不做本地维护；每次会审按实际 token 从钱包扣费。'
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, error: message, ...(hintFor(message) ? { hint: hintFor(message) } : {}) }
        }
      }
    })
  ]
}

export function apply(ctx, config = {}) {
  for (const definition of createDefinitions(ctx, config)) ctx.tools.register(definition)
}
