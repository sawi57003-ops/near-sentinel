// Create the Sentinel testnet account via the NEAR testnet helper (faucet-sponsored).
// Credentials are saved to ~/.near-credentials/testnet/<account>.json (mode 600) — never in the repo.
const fs = require('fs');
const path = require('path');
const { KeyPair, keyStores, connect } = require('near-api-js');

const ACCOUNT_ID = process.argv[2] || 'sentinel-near.testnet';
const HELPER = 'https://helper.testnet.near.org';
const RPC = 'https://rpc.testnet.near.org';

async function accountExists(id) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'query', params: { request_type: 'view_account', account_id: id, finality: 'final' } }) });
  const j = await r.json();
  return !j.error;
}

async function main() {
  if (await accountExists(ACCOUNT_ID)) {
    console.log(`Account ${ACCOUNT_ID} ALREADY EXISTS — not creating. Check ~/.near-credentials/testnet/${ACCOUNT_ID}.json for the key.`);
    return;
  }
  const kp = KeyPair.fromRandom('ed25519');
  const pub = kp.getPublicKey().toString();
  console.log(`Creating ${ACCOUNT_ID} with public key ${pub} ...`);
  const r = await fetch(`${HELPER}/account`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: ACCOUNT_ID, newAccountPublicKey: pub }) });
  const text = await r.text();
  console.log('helper status:', r.status, text.slice(0, 400));
  if (!r.ok) { console.error('ACCOUNT CREATION FAILED'); process.exit(1); }
  const dir = path.join(process.env.HOME, '.near-credentials', 'testnet');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${ACCOUNT_ID}.json`);
  fs.writeFileSync(file, JSON.stringify({ account_id: ACCOUNT_ID, public_key: pub, private_key: kp.toString() }, null, 2), { mode: 0o600 });
  console.log('credentials saved to', file);
  // verify balance
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey('testnet', ACCOUNT_ID, kp);
  const near = await connect({ networkId: 'testnet', keyStore: ks, nodeUrl: RPC, walletUrl: 'https://testnet.mynearwallet.com', helperUrl: HELPER, explorerUrl: 'https://testnet.nearblocks.io' });
  const acct = await near.account(ACCOUNT_ID);
  const bal = await acct.getAccountBalance();
  console.log('balance:', JSON.stringify(bal));
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
