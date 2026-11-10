// Read one verdict back from the registry (raw RPC view call, no signing).
// Usage: node agent/read-verdict.js USDT
const RPC = 'https://rpc.testnet.near.org';
const REGISTRY = process.env.REGISTRY_ID || 'sentinel-near.testnet';

async function main() {
  const token = process.argv[2] || 'USDT';
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'query', params: { request_type: 'call_function', account_id: REGISTRY, method_name: 'get_verdict', args_base64: Buffer.from(JSON.stringify({ token })).toString('base64'), finality: 'final' } }) });
  const j = await r.json();
  if (j.error) { console.error('FAILED:', JSON.stringify(j.error)); process.exit(1); }
  console.log(token, '->', Buffer.from(j.result.result).toString());
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
