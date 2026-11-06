# dsh-panel


作者 / 维护者：He Fangsheng (贺方升 / 贺去病; Dosen) · [hequbing.com](https://www.hequbing.com)
**给 DeepSeek Harness 装一个多 AI 专家会审台：同一个问题发给多家前沿模型，再由裁判模型汇总共识、分歧和结论。** 按次扣费，用支付宝给虾盘云钱包充值即可，不用申请任何海外 API Key。

装免费，用一次扣一次余额。**低价会审单次 ≈ ¥0.05（实测口径，见下） 量级**，深度会审可能到 ¥0.5——档位必须显式选。

## 为什么需要它

单个模型给你一个答案，你没法判断它对不对。多个模型独立作答 + 一个裁判汇总，能把"看起来对"和"真的对"分开。

更实际的一层：**海外前沿模型（Opus / Sonnet / GPT-6 / Gemini 3 Pro / Grok）的 Key 申请麻烦、要外币卡、要翻墙**。这个插件把它们聚在一个钱包后面，你只面对支付宝。

## 安装

```bash
# 从 npm 装（推荐：npm 12 起默认拦 github: 安装）
dsh plugin --profile web add @hfshfg/dsh-panel

# 或直接从仓库装
dsh plugin --profile web add github:hfshfg/dsh-panel
```

## 两个工具

| 工具 | 干什么 |
|---|---|
| `dsh_panel_ask` | 发起一场会审：`question` + 可选 `context`，选档位 `econ` / `std` / `deep`，返回每家原答 + 裁判综合 |
| `dsh_panel_models` | 看档位成员、当前钱包可调用的对话模型（读 `/api/pricing`）、钱包状态与余额。**免费，不计费** |

## 三档怎么选

| 档位 | 成员 | 裁判 | 适用 |
|---|---|---|---|
| `econ` 低价会审 | claude-haiku-5-5 · gpt-4o-mini · gemini-2.5-flash · glm-5.3-flash | gpt-5-mini | 批量初筛、日常小决策，单次 ≈ ¥0.05（实测口径，见下） |
| `std` 标准会审 | 上述 + gpt-5-mini · gpt-5.4-mini · deepseek-v4.1-flash | claude-sonnet-5-5 | 普通重要决策 |
| `deep` 深度会审 | claude-opus-5 · claude-sonnet-5-5 · gpt-6.1-sol · gemini-3-pro · grok-4.20-multi-agent | claude-opus-5 | 错了代价很大的决策 |

成员和裁判都能用参数覆盖；**模型清单不在代码里维护**，实际以 `/api/pricing` 为准。

## 与相近插件的区别

| 插件 | 做什么 | 关系 |
|---|---|---|
| `dsh-cost` / `dsh-billing` | 统计**花了多少钱** | 互补：它们管账，这个管花得值不值 |
| `dsh-switch` / `dsh-vision-router` | 把请求**路由到某个模型** | 互补：路由是选一个，会审是同时问多个 |
| **本插件** | **同时问多家 + 裁判汇总**，钱包按次计费 | 生态里少见的"多模型投票"型工具 |

## 已知限制

- **要钱包有余额**。余额为 0 或负数时上游报 `Invalid token`（不是密钥坏了），充值即可。
- **成本随档位跳变**。`deep` 档可能比 `econ` 贵两个数量级，插件不会替你降档；请显式选。
- **单个成员失败不拖垮整场**：失败的成员会出现在 `failed` 里，其余照常出结论；全部失败才报错。
- **裁判本身也会出错**：它汇总的是成员意见，不是真理。冲突激烈时它会明说"分歧无解"。
- **不做内容合规审查**，生成内容责任在调用方。

## 配置（`cordis.yml`）

| 配置 | 默认 | 含义 |
|---|---|---|
| `defaultTier` | `econ` | 不传 tier 时用哪档 |
| `apiKey` | – | 指定固定密钥，跳过自动解析 |
| `timeoutMs` | `180000` | 单次模型调用超时 |
| `maxTokens` | – | 单次回答 token 上限 |

接口地址走 `UCLAW_API_BASE_URL` / `UCLAW_PAY_BASE_URL`，不硬编码。

## 许可

MIT
