// Deploy the VerdictRegistry wasm to the testnet account and initialize it.
// Usage: node agent/deploy.js
// Requires: contract built (target/wasm32-unknown-unknown/release/sentinel_verdict_registry.wasm)
// and credentials at ~/.near-credentials/testnet/sentinel-near.testnet.json
// This deploys to TESTNET only. Never run against mainnet.
const fs = require('fs');
const path = require('path');
const { KeyPair, Account } = require('near-api-js');

const RPC = 'https://rpc.testnet.near.org';
const ACCOUNT_ID = 'sentinel-near.testnet';
const WASM = path.join(__dirname, '..', 'contract', 'target', 'wasm32-unknown-unknown', 'release', 'sentinel_verdict_registry.wasm');
const MAX_SWAP_USD_CENTS = 10000; // $100 policy cap

async function main() {
  if (!fs.existsSync(WASM)) { console.error('wasm not found — build the contract first: cargo build --target wasm32-unknown-unknown --release'); process.exit(1); }
  const cred = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.near-credentials', 'testnet', `${ACCOUNT_ID}.json`), 'utf8'));
  // near-api-js v7: Account(accountId, provider, signer) — accountId FIRST.
  const account = new Account(ACCOUNT_ID, RPC, cred.private_key);
  const code = fs.readFileSync(WASM);
  console.log(`deploying ${code.length} bytes to ${ACCOUNT_ID} ...`);
  const deployOut = await account.deployContract(code);
  console.log('deploy tx:', deployOut.transaction?.hash ?? JSON.stringify(deployOut).slice(0, 200));
  console.log('initializing registry (owner + $100 cap) ...');
  const initOut = await account.callFunctionRaw({
    contractId: ACCOUNT_ID,
    methodName: 'new',
    args: { owner: ACCOUNT_ID, max_swap_usd_cents: MAX_SWAP_USD_CENTS },
    gas: 30_000_000_000_000n,
    deposit: 0n,
  });
  console.log('init tx:', initOut.transaction?.hash ?? JSON.stringify(initOut).slice(0, 200));
  // read policy back via raw RPC view call
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'query', params: { request_type: 'call_function', account_id: ACCOUNT_ID, method_name: 'get_policy', args_base64: Buffer.from(JSON.stringify({})).toString('base64'), finality: 'final' } }) });
  const j = await r.json();
  console.log('policy on-chain:', Buffer.from(j.result.result).toString());
  console.log('registry live at https://testnet.nearblocks.io/address/' + ACCOUNT_ID);
}
main().catch((e) => { console.error('DEPLOY FAILED:', e.message); process.exit(1); });
