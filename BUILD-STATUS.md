# Sentinel on NEAR — build status (2026-11-10 ~19:10 WIB)

Deadline: 14 Nov 2026 23:59 UTC (15 Nov 06:59 WIB). Repo: https://github.com/sawi57003-ops/near-sentinel (PUBLIC, pushed 10 Nov ~20:29 — commit 9710107 + fresh-run update).

## Toolchain — VERIFIED WORKING
| Item | Result |
|---|---|
| node v24.22.1 / npm 10.9.4 | OK |
| cargo 1.99.1 / rustc 1.99.1 (`$HOME/.cargo/bin`) | OK |
| wasm32-unknown-unknown target | INSTALLED (`rustup target add` OK) |
| near-api-js 7.4.0 (pure JS) | OK — note v7 API: `Account(accountId, provider, signer)`, `callFunctionRaw`, `deployContract`; NO `keyStores`/`connect`/`viewFunction` |
| near-cli (npm) | FAILED — node-hid native build (gyp) fails. NOT NEEDED (near-api-js covers everything) |
| cargo-near | NOT attempted — NOT NEEDED (plain `cargo build --target wasm32-unknown-unknown --release`) |
| NEAR testnet RPC | OK via node fetch / python requests (env proxy). Direct curl does NOT work — always use node/python |
| NEAR mainnet RPC | OK (used for ft_total_supply) |
| 1Click quote API (dry) | OK — 201, e.g. 1 wNEAR -> 3.597095 USDT. Payload needs `recipientType: DESTINATION_CHAIN`, no `time` field |
| Testnet account `sentinel-near.testnet` | CREATED via helper API, funded 10 NEAR, balance now 9.9976 NEAR. Key at `~/.near-credentials/testnet/sentinel-near.testnet.json` (600) |

## Built + verified end-to-end (testnet)
- **Contract** `VerdictRegistry` (near-sdk 5, 163,180 bytes wasm): `publish_verdict` (owner-only), `get_verdict`, `get_all`, `get_policy`, `set_max_swap`. Deploy tx `FWfyt5PRNgJ6eiXsN43pPTuzxGqDf67pJ5BJK2THuNCF`, init tx `FZEepNJTXGvP267MnKs3MEXx3sxLNTP3Zy863WHZgFFg`, policy on-chain `["sentinel-near.testnet", 10000]` ($100 cap).
- **Agent loop** (`agent/loop.js`): audits 5 Intents-listed NEAR tokens (wNEAR 90, USDT 90, USDC 90, AURORA 85, stNEAR 85 — all PASS), publishes verdicts on-chain (5 txs, hashes in the live log), fetches dry 1Click quotes for PASS tokens (10 wNEAR -> 36.02 USDT / 35.98 USDC / 885.73 AURORA / 6.56 stNEAR, all within the $100 cap). Read-back verified: `get_all` = 5 verdicts, `get_verdict USDT` = score 90 PASS.
- **Dashboard** `ui/index.html` + `ui/verdicts.json` (written by each run). **README** written for AI screening judges (do X — see Y steps, Base-origin disclosure, NEAR-integration diff, tracks defi/security/agents). LICENSE MIT, .gitignore (no secrets in repo).

## Fixes applied during the build (lessons)
- Universe must use the REAL Intents contract addresses (USDC = `17208628...36133a1`, AURORA = `aaaaaa20...bridge.near`); REF is not on the Intents list — replaced by stNEAR.
- `ft_total_supply` must be read from MAINNET RPC (tokens are mainnet contracts); registry is on testnet.
- Dexscreener pairs must match `baseToken.address` + price sanity-check vs CoinGecko (>50% gap = unreliable).
- 1Click dry quotes need a mainnet-format recipient (`sentinel.near`); the testnet registry id is rejected with a 500.

## Demo-video plan (for Bre to record/post on X)
60–90 seconds, screen-recorded, no intro slides:
1. (0–15s) Terminal: `node agent/loop.js --dry-run` — show the 5 scores + PASS/FAIL table.
2. (15–40s) Dashboard `ui/index.html` — verdicts table + dry quotes; narrate: "AI audits the token, verdict goes on-chain, the agent can only quote inside its $100 cap."
3. (40–60s) NEARBlocks testnet page for `sentinel-near.testnet` — show the 5 `publish_verdict` transactions + `get_verdict` result.
4. (60–75s) One line on NEAR's role: "Verdicts live on NEAR, rebalances price through NEAR Intents — the agent never moves money without a fresh PASS."
Post text (draft for Bre): "Built Sentinel on NEAR at NEAR HACKATHON — an AI agent that audits NEAR tokens, publishes verdicts on-chain, and only quotes swaps inside its spending cap. @NEARProtocol #NEARHackathon" + repo link.
Record with ffmpeg + Xvfb on the VM, or Bre records on his phone from the dashboard.

## Fresh run (10 Nov 19:57 WIB — pre-submission refresh)
- Live run `node agent/loop.js --live` re-ran cleanly (exit 0): wNEAR 90, USDT 90, USDC 80, AURORA 85, stNEAR 75 — all PASS; 4 dry quotes (10 wNEAR → 36.21 USDT / 36.14 USDC / 892.94 AURORA / 6.56 stNEAR, all within $100 cap). 5 new `publish_verdict` txs: `8p3UbY5qRzAcK7Mm4Un7mD5gqfS8J4B3Yin9mEuNbcYx` (wNEAR), `9pk8TriLgS2igbyZzSmzSYduPEziedJeTTaKdJoUV8sp` (USDT), `CsaRCD2bYq9zQvVt7je4QcNQJAT89zWWf8KVqfXLe1r7` (USDC), `CfJud8QHLohuw8oNxMDU9cNBA15xQLepLgVEb1XnokuC` (AURORA), `CeBRk2HZox3NA1zEkfdAnsFUd3xkAXCDRJmgrpWCkxaj` (stNEAR). `ui/verdicts.json` refreshed (run 2026-11-10T12:57:02Z).
- Submission payload draft: `~/workspace/hackathon/near-sentinel-payload.md` (nearAddress `fngyuan24.near` filled; needs leadName/email/size/consent + demoUrl + projectUrl).

## Remaining (NOT done — needs Bre)
1. ~~Bre creates the NEAR payout account~~ — DONE 10 Nov ~19:51: **fngyuan24.near**, verified on-chain via mainnet RPC (exists, balance 0 NEAR, storage 182 bytes).
2. Bre posts the demo video on X himself (Muse never posts).
3. Bre confirms the exact submission payload (draft ready — see above) — then the parent sends ONE POST to https://nearhackathon.com/api/applications. NOTHING submitted yet.
4. ~~Make the repo public + push~~ — DONE 10 Nov ~20:29: repo public at https://github.com/sawi57003-ops/near-sentinel, commit 9710107 pushed + verified (remote HEAD matches local).

## Blockers
None open. Costs so far: $0 (testnet faucet NEAR only; all quotes dry).
