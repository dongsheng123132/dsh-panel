// 多模型会审：同一个问题发给多个前沿模型，再让裁判模型汇总共识/分歧/结论。
// 计费：走虾盘云钱包，每个模型调用都扣余额；不同档位价格差两个数量级，所以档位必须显式。
const CHAT_PATH = '/v1/chat/completions'

// 档位只给"默认成员"，用户可以覆盖。倍率来自 /api/pricing 实测（2026-11-03）：
// econ x0.05–0.68 · std 中端 · deep 旗舰（opus / sol / grok）
// 成员全部经实测可用（2026-11-03 全量扫描 146 个对话模型：46 可用 / 84 无渠道）。
// 注意：Gemini 与 Grok 全系无渠道；GPT 只有 gpt-5.6-sol / gpt-6-astra / gpt-6.1-sol 可用。
// 用 xiapan-gateway-monitor 定期复扫，别照价目表写死。
export const TIERS = {
  econ: {
    label: '低价会审',
    models: ['deepseek-v4.1-flash', 'glm-5.3-flash', 'qwen3.8-flash', 'kimi-k3'],
    judge: 'claude-haiku-5-5',
    note: '单次成本 ≈ ¥0.01 量级，适合批量初筛'
  },
  std: {
    label: '标准会审',
    models: ['deepseek-v4.1-flash', 'glm-5.3', 'qwen3.8-flash', 'kimi-k3.1-pro', 'MiniMax-M3', 'claude-haiku-5-5'],
    judge: 'claude-sonnet-5-5',
    note: '多家中价模型 + 一家强的裁判'
  },
  deep: {
    label: '深度会审',
    models: ['gpt-6.1-sol', 'claude-sonnet-5-5', 'deepseek-v4-pro', 'glm-5.3', 'kimi-k3'],
    judge: 'claude-opus-5-5',
    note: 'GPT-6 + Claude 5 + 国产旗舰，跨厂商会审；单次成本可能到 ¥0.2–0.6'
  }
}

const SYSTEM = 'You are one member of a review panel. Answer the question directly and independently. Be concrete. State disagreements with any obvious conventional answer instead of agreeing politely. Do not ask follow-up questions.'

const JUDGE_SYSTEM = `You are the chair of a review panel. You receive several independent answers to the same question.
Produce, in Chinese:
1. 共识 —— points most members agree on, and whether they hold up
2. 分歧 —— where members conflict, each side's reason, and which side you take and why
3. 独到且正确的点 —— anything a single member caught that the others missed
4. 明显错误 —— anything wrong or unexecutable, and why
5. 结论 —— what the caller should actually do
Do not restate the question. Do not pad. If the panel is missing information, say what is missing.`

async function chatOnce({ baseUrl, apiKey, model, messages, temperature, maxTokens, timeoutMs }) {
  const r = await fetch(`${baseUrl}${CHAT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    // claude-haiku-5-5 等模型已不接受 temperature，未显式给出时不发
    body: JSON.stringify({ model, messages, ...(temperature !== undefined ? { temperature } : {}), max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeoutMs ?? 180000)
  })
  const text = await r.text()
  if (!r.ok) {
    const err = new Error(
      /quota|insufficient|余额/i.test(text) ? '余额不足，充值后重试'
        : /invalid.*(token|key)|401|403/i.test(text) ? '凭证失效（或余额为 0），先查余额再换密钥'
          : `上游失败 HTTP ${r.status}: ${text.slice(0, 200)}`
    )
    err.model = model
    err.status = r.status
    throw err
  }
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`模型 ${model} 返回非 JSON`) }
  const msg = j?.choices?.[0]?.message || {}
  const usage = j?.usage || {}
  const flat = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map((p) => p?.text || '').join('') : '')
  // 推理模型把正文放在 reasoning_content（content 为空）；预算不足时也会空，两者都要兜住
  const answer = flat(msg.content).trim() || flat(msg.reasoning_content)
  return {
    model,
    answer,
    truncated: j?.choices?.[0]?.finish_reason === 'length',
    usage: { prompt: usage.prompt_tokens ?? null, completion: usage.completion_tokens ?? null }
  }
}

export async function runPanel({ baseUrl, apiKey, question, context, tier, models, judge, temperature, maxTokens, timeoutMs }) {
  const conf = TIERS[tier] || TIERS.econ
  const members = (models?.length ? models : conf.models).slice(0, 8)
  const judgeModel = judge || conf.judge

  const userContent = context ? `${question}\n\n---\n背景材料：\n${context}` : question
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userContent }
  ]

  // 并行：一个模型挂了不该拖垮整场会审
  const settled = await Promise.allSettled(
    // 默认压到 800：不设上限时单成员可吐 3000+ token，4 家一次约 ¥0.25
    members.map((m) => chatOnce({ baseUrl, apiKey, model: m, messages, temperature, maxTokens: maxTokens ?? 800, timeoutMs }))
  )
  const answers = []
  const failures = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') answers.push(s.value)
    else failures.push({ model: members[i], error: s.reason?.message || String(s.reason) })
  })
  if (!answers.length) {
    const first = failures[0]
    throw new Error(`所有模型都失败了：${first ? `${first.model} → ${first.error}` : '未知原因'}`)
  }

  const panelText = answers
    .map((a, i) => `### 成员 ${i + 1}：${a.model}\n${a.answer}`)
    .join('\n\n')

  let chair = null
  let chairError = null
  try {
    chair = await chatOnce({
      baseUrl, apiKey, model: judgeModel, temperature,
      maxTokens: 2000,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: `问题：${question}\n\n各成员回答：\n${panelText}` }
      ],
      timeoutMs
    })
  } catch (e) {
    chairError = e.message
  }

  return {
    tier: tier || 'econ',
    tierLabel: conf.label,
    members: answers.map((a) => a.model),
    failed: failures,
    answers,
    judge: judgeModel,
    synthesis: chair?.answer || null,
    chairError,
    usage: answers.reduce(
      (acc, a) => ({ prompt: acc.prompt + (a.usage.prompt || 0), completion: acc.completion + (a.usage.completion || 0) }),
      { prompt: 0, completion: 0 }
    )
  }
}
