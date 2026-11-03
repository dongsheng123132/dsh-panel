// 多模型会审：同一个问题发给多个前沿模型，再让裁判模型汇总共识/分歧/结论。
// 计费：走虾盘云钱包，每个模型调用都扣余额；不同档位价格差两个数量级，所以档位必须显式。
const CHAT_PATH = '/v1/chat/completions'

// 档位只给"默认成员"，用户可以覆盖。倍率来自 /api/pricing 实测（2026-11-03）：
// econ x0.05–0.68 · std 中端 · deep 旗舰（opus / sol / grok）
export const TIERS = {
  econ: {
    label: '低价会审',
    models: ['claude-haiku-5-5', 'gpt-4o-mini', 'gemini-2.5-flash', 'glm-5.3-flash'],
    judge: 'gpt-5-mini',
    note: '单次成本 ≈ ¥0.01 量级，适合批量初筛'
  },
  std: {
    label: '标准会审',
    models: ['claude-haiku-5-5', 'gpt-5-mini', 'gemini-2.5-flash', 'glm-5.3-flash', 'deepseek-v4.1-flash', 'gpt-5.4-mini'],
    judge: 'claude-sonnet-5-5',
    note: '常见的"多家中价模型 + 一家强的裁判"'
  },
  deep: {
    label: '深度会审',
    models: ['claude-opus-5', 'claude-sonnet-5-5', 'gpt-6.1-sol', 'gemini-3-pro', 'grok-4.20-multi-agent'],
    judge: 'claude-opus-5',
    note: '旗舰全家桶，单次成本可能到 ¥0.1–0.5，用于重大问题'
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
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
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
  const msg = j?.choices?.[0]?.message?.content
  const usage = j?.usage || {}
  return {
    model,
    answer: typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.map((p) => p?.text || '').join('') : '',
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
    members.map((m) => chatOnce({ baseUrl, apiKey, model: m, messages, temperature, maxTokens, timeoutMs }))
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
      maxTokens: maxTokens ?? 2000,
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
