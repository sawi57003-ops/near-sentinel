// Sentinel on NEAR — agent loop (testnet).
// Audits NEAR-ecosystem tokens with the same deterministic checklist as
// Sentinel on Base, publishes verdicts to the on-chain Verdict Registry,
// and fetches 1Click Intents quotes in DRY mode only (quotes, never swaps).
//   node loop.js --dry-run   (default: prints the plan, sends nothing)
//   node loop.js --live      (publishes verdicts; quotes stay dry)
// Safety: quotes are ALWAYS dry (dry:true). No mainnet, no real swaps,
// no spending. Testnet only; the registry account is funded by the faucet.
const fs = require('fs');
const path = require('path');
const { KeyPair, KeyPairSigner, Account } = require('near-api-js');

const ROOT = path.join(__dirname, '..');
const RPC = 'https://rpc.testnet.near.org';
const MAINNET_RPC = 'https://rpc.mainnet.near.org';
const QUOTE_ACCOUNT = 'sentinel.near'; // mainnet-format account for dry 1Click quotes (no funds move)
const CRED_FILE = path.join(process.env.HOME, '.near-credentials', 'testnet', 'sentinel-near.testnet.json');
const REGISTRY_ID = process.env.REGISTRY_ID || 'sentinel-near.testnet';
const LIVE = process.argv.includes('--live');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Universe: NEAR-ecosystem fungible tokens (NEP-141) that ARE on the 1Click
// Intents token list (verified 2026-11-10), with CoinGecko ids from that list.
// USDC/AURORA use their bridged Intents contract addresses, not the short ones.
const UNIVERSE = [
  { symbol: 'wNEAR', account: 'wrap.near', decimals: 24, coingecko: 'wrapped-near' },
  { symbol: 'USDT', account: 'usdt.tether-token.near', decimals: 6, coingecko: 'tether' },
  { symbol: 'USDC', account: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, coingecko: 'usd-coin' },
  { symbol: 'AURORA', account: 'aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near', decimals: 18, coingecko: 'aurora-near' },
  { symbol: 'stNEAR', account: 'meta-pool.near', decimals: 24, coingecko: 'staked-near' },
];

function scoreToken(t) {
  // t: {listed, supply, liqUsd, vol24Usd, refPrice, dexPrice} — 0-100, pass >= 70.
  let score = 0;
  const why = [];
  if (t.listed) { score += 20; why.push('intents-listed+20'); } else { why.push('NOT on Intents list+0'); return { score, why }; }
  if (t.supply != null && t.supply > 0n) { score += 10; why.push('supply>0+10'); } else why.push('supply 0/missing+0');
  const liq = t.liqUsd ?? 0;
  if (liq > 100000) { score += 20; why.push(`liq $${Math.round(liq)}+20`); }
  else if (liq > 10000) { score += 15; why.push(`liq $${Math.round(liq)}+15`); }
  else if (liq > 1000) { score += 10; why.push(`liq $${Math.round(liq)}+10`); }
  else why.push(`liq $${Math.round(liq)}+0`);
  const vol = t.vol24Usd ?? 0;
  if (vol > 100000) { score += 10; why.push(`vol24 $${Math.round(vol)}+10`); }
  else if (vol > 10000) { score += 5; why.push(`vol24 $${Math.round(vol)}+5`); }
  else why.push(`vol24 $${Math.round(vol)}+0`);
  if (t.refPrice != null && t.dexPrice != null) {
    const dev = Math.abs(t.dexPrice - t.refPrice) / t.refPrice;
    if (dev < 0.02) { score += 20; why.push(`price dev ${(dev * 100).toFixed(2)}%+20`); }
    else if (dev < 0.05) { score += 10; why.push(`price dev ${(dev * 100).toFixed(2)}%+10`); }
    else why.push(`price dev ${(dev * 100).toFixed(2)}%+0`);
    score += 10; why.push('ref price present+10');
  } else why.push('no ref/dex price+0');
  return { score, why };
}

async function rpcView(accountId, method, args = {}, rpcUrl = RPC) {
  const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'query', params: { request_type: 'call_function', account_id: accountId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), finality: 'final' } }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  if (!j.result || j.result.result === undefined) throw new Error('empty view result');
  return JSON.parse(Buffer.from(j.result.result).toString());
}

async function main() {
  console.log('=== Sentinel on NEAR audit', new Date().toISOString(), LIVE ? '(LIVE)' : '(DRY RUN) ===');

  // --- 1. READ: Intents token list + CoinGecko + Dexscreener + on-chain supply ---
  let intentsTokens = new Set();
  try {
    const t = await (await fetch('https://1click.chaindefuser.com/v0/tokens')).json();
    for (const x of (t.tokens || t || [])) if (x.assetId) intentsTokens.add(x.assetId);
    console.log(`Intents token list: ${intentsTokens.size} assets`);
  } catch (e) { console.log('intents token list failed:', e.message); }

  let cg = {};
  try {
    const ids = UNIVERSE.map((u) => u.coingecko).join(',');
    cg = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)).json();
  } catch (e) { console.log('coingecko failed:', e.message); }

  const results = [];
  for (const u of UNIVERSE) {
    // Dexscreener: only pairs where THIS token is the base token on NEAR,
    // highest liquidity first; then sanity-check the price vs CoinGecko —
    // a >50% gap means a bad/stale pair, treat the DEX price as unreliable.
    let dex = null;
    try {
      const d = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${u.account}`)).json();
      const pairs = (d.pairs || []).filter((x) => x.chainId === 'near' && x.baseToken?.address?.toLowerCase() === u.account.toLowerCase());
      const p = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (p) dex = { liqUsd: Number(p.liquidity?.usd || 0), vol24Usd: Number(p.volume?.h24 || 0), priceUsd: Number(p.priceUsd || 0) };
    } catch (e) { console.log(u.symbol, 'dexscreener failed:', e.message); }
    // total supply lives on MAINNET (these are mainnet token contracts)
    let supply = null;
    try { const s = await rpcView(u.account, 'ft_total_supply', {}, MAINNET_RPC); supply = BigInt(s); } catch (e) { console.log(u.symbol, 'ft_total_supply failed:', e.message); }
    const listed = intentsTokens.has(`nep141:${u.account}`);
    const refPrice = cg[u.coingecko]?.usd ?? null;
    let dexPrice = dex?.priceUsd ?? null;
    if (dexPrice != null && refPrice != null && Math.abs(dexPrice - refPrice) / refPrice > 0.5) {
      console.log(u.symbol, `dex price $${dexPrice} unreliable vs ref $${refPrice} — ignoring`);
      dexPrice = null;
    }
    const { score, why } = scoreToken({ listed, supply, liqUsd: dex?.liqUsd, vol24Usd: dex?.vol24Usd, refPrice, dexPrice });
    results.push({ symbol: u.symbol, account: u.account, score, passed: score >= 70, why, refPrice, dexPrice, liqUsd: dex?.liqUsd ?? 0, supply: supply?.toString() ?? null });
    await sleep(250);
  }
  for (const r of results) console.log(`${r.symbol.padEnd(7)} score=${String(r.score).padStart(3)} ${r.passed ? 'PASS' : 'FAIL'}  ref=$${r.refPrice} dex=$${r.dexPrice} liq=$${Math.round(r.liqUsd)}  [${r.why.join(', ')}]`);

  // --- 2. READ registry policy (spending cap) ---
  let policy = { owner: REGISTRY_ID, maxSwapUsdCents: 10000 };
  try { const p = await rpcView(REGISTRY_ID, 'get_policy'); policy = { owner: p[0], maxSwapUsdCents: Number(p[1]) }; } catch (e) { console.log('get_policy failed (contract not deployed yet?):', e.message); }
  console.log(`policy: owner=${policy.owner} max swap $${(policy.maxSwapUsdCents / 100).toFixed(2)}`);

  // --- 3. 1Click DRY quotes for PASS tokens (never executed) ---
  const quotes = [];
  const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  for (const r of results.filter((x) => x.passed && x.symbol !== 'wNEAR')) {
    // quote: swap $10 worth of wNEAR into the PASS token (dry only)
    const amountIn = '10000000000000000000000000'; // 10 wNEAR
    try {
      const q = await (await fetch('https://1click.chaindefuser.com/v0/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, depositType: 'ORIGIN_CHAIN', originAsset: 'nep141:wrap.near', destinationAsset: `nep141:${r.account}`, amount: amountIn, refundTo: QUOTE_ACCOUNT, refundType: 'ORIGIN_CHAIN', recipient: QUOTE_ACCOUNT, recipientType: 'DESTINATION_CHAIN', deadline }) })).json();
      if (q.quote) {
        const usd = Number(q.quote.amountInUsd || 0);
        const withinPolicy = usd * 100 <= policy.maxSwapUsdCents;
        quotes.push({ symbol: r.symbol, amountIn: q.quote.amountInFormatted, amountOut: q.quote.amountOutFormatted, amountOutUsd: q.quote.amountOutUsd, withinPolicy });
        console.log(`QUOTE (dry) 10 wNEAR -> ${r.symbol}: ${q.quote.amountOutFormatted} ${r.symbol} ($${q.quote.amountOutUsd}) withinPolicy=${withinPolicy}`);
      } else console.log(`QUOTE ${r.symbol} failed:`, JSON.stringify(q).slice(0, 200));
    } catch (e) { console.log(`QUOTE ${r.symbol} error:`, e.message); }
    await sleep(250);
  }

  // --- 4. report files (always written, even in dry-run) ---
  const report = { at: new Date().toISOString(), live: LIVE, network: 'testnet', registry: REGISTRY_ID, policy, results, quotes };
  fs.mkdirSync(path.join(ROOT, 'agent', 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'agent', 'reports', `${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ROOT, 'ui', 'verdicts.json'), JSON.stringify(report, null, 2));
  console.log('report written: agent/reports/ + ui/verdicts.json');

  if (!LIVE) { console.log('DRY RUN — no transactions sent. Re-run with --live to publish verdicts on-chain.'); return; }

  // --- 5. LIVE: publish verdicts to the registry contract ---
  const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  // near-api-js v7: Account(accountId, provider, signer) — accountId FIRST.
  const account = new Account(REGISTRY_ID, RPC, cred.private_key);
  for (const r of results) {
    const out = await account.callFunctionRaw({
      contractId: REGISTRY_ID,
      methodName: 'publish_verdict',
      args: { token: r.symbol, score: r.score, passed: r.passed, reasons: r.why },
      gas: 30_000_000_000_000n,
      deposit: 0n,
    });
    console.log(`publish_verdict ${r.symbol}: ${out.transaction?.hash ?? JSON.stringify(out).slice(0, 120)}`);
    await sleep(500);
  }
  console.log('LIVE RUN DONE — verdicts on-chain at', `https://testnet.nearblocks.io/address/${REGISTRY_ID}`);
}

main().catch((e) => { console.error('LOOP FAILED:', e.message); process.exit(1); });
