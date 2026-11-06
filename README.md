# dsh-panel


**Maintainer / Author: He Fangsheng (贺方升 / 贺去病; Dosen) · [hequbing.com](https://www.hequbing.com)**
**A multi-model council for DeepSeek Harness: put one question to several frontier models, then have a chair model synthesise the consensus, the disagreements and the verdict.** Pay per use by topping up a Xiapan Cloud wallet with Alipay — no overseas API keys, no foreign card, no VPN.

Install is free; every review spends wallet balance. An `econ` review costs roughly ¥0.01; a `deep` review can reach ¥0.5, so the tier is always explicit.

## Why

One model gives you one answer and no way to tell whether it is right. Several independent answers plus a chair that names the disagreements separates "looks right" from "is right".

The practical twist: frontier overseas models (Opus / Sonnet / GPT-6 / Gemini 3 Pro / Grok) are painful to obtain — foreign card, separate billing, network hurdles. This plugin puts them behind a single wallet you fund with Alipay.

## Install

```bash
# from npm (recommended — npm 12 blocks github: installs by default)
dsh plugin --profile web add @hfshfg/dsh-panel

# or straight from the repository
dsh plugin --profile web add github:hfshfg/dsh-panel
```

## Tools

| Tool | Does |
|---|---|
| `dsh_panel_ask` | Runs a panel: `question` plus optional `context`, a `tier` of `econ` / `std` / `deep`, returns each member's answer and the chair's synthesis |
| `dsh_panel_models` | Shows tiers, the chat models this wallet can actually call (read from `/api/pricing`), wallet status and balance. **Free, not billed** |

## Tiers

| Tier | Members | Chair | Use for |
|---|---|---|---|
| `econ` | claude-haiku-5-5 · gpt-4o-mini · gemini-2.5-flash · glm-5.3-flash | gpt-5-mini | Cheap screening, routine calls |
| `std` | the above + gpt-5-mini · gpt-5.4-mini · deepseek-v4.1-flash | claude-sonnet-5-5 | Ordinary important decisions |
| `deep` | claude-opus-5 · claude-sonnet-5-5 · gpt-6.1-sol · gemini-3-pro · grok-4.20-multi-agent | claude-opus-5 | Decisions where being wrong is expensive |

Members and chair are overridable per call. Model ids are **not** bundled — `/api/pricing` is the source of truth.

## How this differs from neighbours

| Plugin | Does | Relationship |
|---|---|---|
| `dsh-cost` / `dsh-billing` | Tracks **what you spent** | Complementary: they keep the books, this makes the spend worth it |
| `dsh-switch` / `dsh-vision-router` | Routes a request **to one model** | Complementary: routing picks one, a panel asks many |
| **This plugin** | **Asks many, then a chair synthesises**, wallet-billed | Rare "jury" shape in the ecosystem |

## Known limitations

- **A funded wallet is required.** At zero or negative balance upstream answers `Invalid token` (not a broken key); top up and retry.
- **Cost jumps between tiers.** `deep` can be two orders of magnitude above `econ`; the plugin never downgrades silently.
- **One failing member does not sink the panel** — failures land in `failed`, the rest still produce a verdict; only a total failure errors.
- **The chair can be wrong too.** It summarises members, it is not ground truth; on sharp disagreement it says so explicitly.
- **No content moderation.**

## Configuration (`cordis.yml`)

| Key | Default | Meaning |
|---|---|---|
| `defaultTier` | `econ` | Tier used when none is passed |
| `apiKey` | – | Pin a key instead of resolving one |
| `timeoutMs` | `180000` | Per-model timeout |
| `maxTokens` | – | Answer token cap |

Endpoints come from `UCLAW_API_BASE_URL` / `UCLAW_PAY_BASE_URL`; nothing is hard-coded.

## License

MIT
