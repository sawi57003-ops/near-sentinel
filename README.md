# Sentinel on NEAR

**AI-audited token verdicts on NEAR, with a spending-limit policy the agent cannot exceed.**

Sentinel is an AI agent that audits tokens and only lets money move toward tokens with a fresh **PASS** verdict. On Base it runs as an AI-audited B20 index vault (live on Base mainnet since 9 Nov 2026). This repository is the **NEAR integration**: the same agent, now auditing NEAR-ecosystem tokens, publishing its verdicts on-chain to a NEAR testnet **Verdict Registry** contract, and pricing rebalances through **NEAR Intents (1Click)** — quotes only, never executed.

## The problem

An AI agent with a wallet and no guardrails is a loss waiting to happen: it can buy an unaudited token, a drained pool, or a token whose price has de-pegged. Sentinel fixes that with two on-chain guardrails:

1. **Fresh verdicts, on-chain.** Every token gets a deterministic 0–100 audit score (Intents listing, supply, liquidity, 24h volume, price deviation vs a reference price). Score ≥ 70 = PASS. Verdicts are published to the registry contract with reasons, so anyone can verify what the agent saw.
2. **A spending cap, on-chain.** The registry stores `max_swap_usd_cents`. The agent reads the policy before every quote and refuses any swap above the cap. The cap can only be changed by the owner.

## What is new in this repository (NEAR integration, built 10–14 Nov 2026)

Per the hackathon rules, only the NEAR integration built in the window is judged. The Base product is the baseline (disclosed here); everything below is new in this repo:

- `contract/` — a minimal NEAR smart contract (Rust, near-sdk): `VerdictRegistry` with `publish_verdict`, `get_verdict`, `get_all`, `get_policy`, `set_max_swap`. Deployed to NEAR **testnet**.
- `agent/loop.js` — the agent loop, adapted from Sentinel's Base loop: audits 5 NEAR-ecosystem tokens (wNEAR, USDT, USDC, AURORA, stNEAR — all verified on the 1Click Intents token list), publishes verdicts on-chain, and fetches **dry** 1Click Intents quotes for PASS tokens.
- `ui/` — a static dashboard rendering the latest run (verdicts + dry quotes).
- The 1Click quotes are **dry only** (`dry: true`). Intents has no testnet; the agent never executes a swap and never spends anything.

## Tracks

- `defi` — trading agent that settles through NEAR Intents.
- `security` — spending limits + policy engine; the agent cannot exceed its cap.
- `agents` — an agent that earns/spends through Intents quotes with on-chain verdicts.

## Try it (do X — see Y)

Prerequisites: Node.js 20+, Rust with the `wasm32-unknown-unknown` target, a NEAR testnet account funded by the faucet.

```sh
npm install
```

**1. Run a dry audit** — no transactions, just the scores:

```sh
node agent/loop.js --dry-run
```

Do: run the command. See: a table of 5 tokens with scores, PASS/FAIL, and reasons, plus dry 1Click quotes for the PASS tokens.

**2. Deploy the registry and publish verdicts live (testnet):**

```sh
node agent/deploy.js
node agent/loop.js --live
```

Do: deploy, then run live. See: the deploy transaction hash, then one `publish_verdict` transaction per token, and the verdicts at `https://testnet.nearblocks.io/address/sentinel-near.testnet`.

**3. Read a verdict back from the chain:**

```sh
node -e "require('./agent/read-verdict.js')('USDT')"
```

Do: run it. See: the stored verdict for USDT (score, PASS/FAIL, timestamp, reasons).

**4. Open the dashboard:** open `ui/index.html` in a browser (it reads `ui/verdicts.json` written by the last run).

Do: open the file. See: the verdict table and the dry quotes.

## Architecture

```
contract/src/lib.rs   VerdictRegistry (near-sdk 5): verdicts + spending policy
agent/loop.js         audit -> publish verdicts -> dry Intents quotes -> report
agent/deploy.js       build wasm (already built) -> deploy -> init policy ($100 cap)
ui/index.html         static dashboard over ui/verdicts.json
```

## Safety

- Testnet only. No mainnet deployment, no real swaps, no spending. Quotes are `dry: true`.
- The agent's testnet key lives in `~/.near-credentials/testnet/` (never in the repo; see `.gitignore`).
- The spending cap is enforced in the agent loop and stored on-chain.

## Links

- NEAR Hackathon 2026: Build Beyond Boundaries — https://nearhackathon.com
- NEAR Intents docs — https://docs.near-intents.org/
- Sentinel on Base (baseline product): AI-audited B20 index vault, live on Base mainnet (contracts: SentinelOracle, SentinelAuditor, SentinelVault, SentinelStrategy; agent loop every 6h).

## License

MIT — see `LICENSE`.
