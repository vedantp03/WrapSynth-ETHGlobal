// ─── Recipient-wallet helper (demo tool) ─────────────────────────────────────
//
// Acts as the OTHER party in an end-to-end Unlink demo. Given a second dev
// wallet's private key, it derives that wallet's Unlink (`unlink1…`) address so
// the custodial server can privately send to it, and lets that wallet withdraw
// its privately-received wsXMR out to any public EVM address.
//
// Uses the same Unlink project (API key) as the custodial server — the admin key
// can register + authorize any address under the project.
//
// Setup: add the recipient's key to ethereum/uniswap/proxy/.env:
//   RECIPIENT_PRIVATE_KEY=0x...            (a different dev wallet than PRIVATE_KEY)
//
// Usage (from ethereum/uniswap/proxy/):
//   node recipientWallet.js address                  # print the unlink1… address to send to
//   node recipientWallet.js balance                  # show this wallet's private balance
//   node recipientWallet.js withdraw <0xTo> <amount> # deliver received wsXMR to a public wallet
//
// You can also pass the key inline:  node recipientWallet.js address --key 0x...

import 'dotenv/config';
import { createUnlinkAdmin } from '@unlink-xyz/sdk/admin';
import { buildDeriveSeedMessage, account } from '@unlink-xyz/sdk/crypto';
import { createUnlinkClient, evm } from '@unlink-xyz/sdk/client';
import { Wallet, JsonRpcProvider } from 'ethers';

const ENVIRONMENT = process.env.UNLINK_ENVIRONMENT || 'base-sepolia';
const CHAIN_ID    = 84532;
const RPC_URL     = process.env.BASE_SEPOLIA_RPC || process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const TOKEN       = process.env.UNLINK_TOKEN_ADDRESS || process.env.TWSXMR_ADDRESS;
const DECIMALS    = Number(process.env.UNLINK_TOKEN_DECIMALS || 8);

function toBaseUnits(human, decimals = DECIMALS) {
  const s = String(human).trim();
  if (!s || isNaN(Number(s))) throw new Error('Invalid amount');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  if (frac.length > decimals) throw new Error(`Max ${decimals} decimal places`);
  return BigInt(`${whole}${(frac + '0'.repeat(decimals)).slice(0, decimals)}`.replace(/^0+(?=\d)/, '') || '0');
}
function formatBaseUnits(raw, decimals = DECIMALS) {
  const v = BigInt(raw || '0');
  const abs = (v < 0n ? -v : v).toString().padStart(decimals + 1, '0');
  const whole = abs.slice(0, abs.length - decimals);
  const frac = abs.slice(abs.length - decimals).replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''}`;
}

function getKey() {
  const idx = process.argv.indexOf('--key');
  const key = idx !== -1 ? process.argv[idx + 1] : process.env.RECIPIENT_PRIVATE_KEY;
  if (!key) throw new Error('Set RECIPIENT_PRIVATE_KEY in .env or pass --key 0x...');
  return key;
}

async function getClient() {
  const apiKey    = process.env.UNLINK_API_KEY;
  const projectId = process.env.UNLINK_PROJECT_ID;
  if (!apiKey)    throw new Error('Missing UNLINK_API_KEY');
  if (!projectId) throw new Error('Missing UNLINK_PROJECT_ID');
  if (!TOKEN)     throw new Error('Missing UNLINK_TOKEN_ADDRESS');

  const provider  = new JsonRpcProvider(RPC_URL, CHAIN_ID);
  const evmWallet = new Wallet(getKey(), provider);
  const admin     = createUnlinkAdmin({ environment: ENVIRONMENT, apiKey });

  const signature = await evmWallet.signMessage(buildDeriveSeedMessage({ appId: projectId, chainId: CHAIN_ID }));
  const unlinkAccount = account.fromEthereumSignature({ signature, appId: projectId, chainId: CHAIN_ID });
  const unlinkAddress = await unlinkAccount.getAddress();

  const client = createUnlinkClient({
    environment: ENVIRONMENT,
    account: unlinkAccount,
    evm: evm.fromEthers({ signer: evmWallet, provider }),
    register: (payload) => admin.users.register(payload),
    authorizationToken: { provider: () => admin.authorizationTokens.issue({ unlinkAddress }) },
  });
  await client.ensureRegistered();
  return { client, unlinkAddress, evmAddress: evmWallet.address };
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'address') {
    const { unlinkAddress, evmAddress } = await getClient();
    console.log('\nEVM wallet:    ', evmAddress);
    console.log('Unlink address:', unlinkAddress);
    console.log('\n→ Paste the Unlink address into the app to receive a private send.\n');
    return;
  }

  if (cmd === 'balance') {
    const { client, unlinkAddress } = await getClient();
    const raw = (await client.balanceOf(TOKEN)) ?? '0';
    console.log(`\n${unlinkAddress}\nPrivate balance: ${formatBaseUnits(String(raw))} wsXMR\n`);
    return;
  }

  if (cmd === 'withdraw') {
    const to = process.argv[3];
    const amount = process.argv[4];
    if (!/^0x[a-fA-F0-9]{40}$/.test(to || '') || !amount) {
      throw new Error('Usage: node recipientWallet.js withdraw <0xToAddress> <amount>');
    }
    const { client } = await getClient();
    console.log(`Withdrawing ${amount} wsXMR -> ${to} ...`);
    const tx = await client.withdraw({ recipientEvmAddress: to, token: TOKEN, amount: toBaseUnits(amount).toString() });
    const res = await tx.wait();
    console.log(`Status: ${res.status}${res.txHash ? `  tx: ${res.txHash}` : ''}\n`);
    return;
  }

  console.log(`Recipient-wallet helper. Commands:
  node recipientWallet.js address                  print the unlink1… address to receive at
  node recipientWallet.js balance                  show this wallet's private balance
  node recipientWallet.js withdraw <0xTo> <amount> deliver received wsXMR to a public wallet
Add RECIPIENT_PRIVATE_KEY to .env (a second dev wallet) or pass --key 0x...`);
}

main().catch((e) => { console.error('Error:', e.message || e); process.exit(1); });
