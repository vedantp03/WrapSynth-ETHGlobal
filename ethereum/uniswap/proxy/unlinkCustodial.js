// ─── Custodial Unlink private transfers ──────────────────────────────────────
//
// A single server-held Unlink identity (derived from the proxy's PRIVATE_KEY)
// that shields tokens and sends them privately on a caller's behalf. This is the
// "seamless" demo model: the frontend posts a recipient `unlink1…` address + an
// amount, and the server does the shield (deposit) + private transfer with its
// own funded wallet — no per-user key, no wallet signature.
//
// Reuses the exact client-construction pattern proven in
// lp-server/unlinkDeposit.js.

import { createUnlinkAdmin } from '@unlink-xyz/sdk/admin';
import { buildDeriveSeedMessage, account } from '@unlink-xyz/sdk/crypto';
import { createUnlinkClient, evm } from '@unlink-xyz/sdk/client';
import { Wallet, JsonRpcProvider } from 'ethers';

const ENVIRONMENT   = process.env.UNLINK_ENVIRONMENT || 'base-sepolia';
const CHAIN_ID      = 84532;
const RPC_URL       = process.env.BASE_SEPOLIA_RPC || process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const TOKEN         = process.env.UNLINK_TOKEN_ADDRESS || process.env.TWSXMR_ADDRESS;
const DECIMALS      = Number(process.env.UNLINK_TOKEN_DECIMALS || 8);

let cached = null; // { client, unlinkAddress, evmAddress }

/** Build (once) and return the custodial client + identity. */
async function getCtx() {
  if (cached) return cached;

  const apiKey    = process.env.UNLINK_API_KEY;
  const projectId = process.env.UNLINK_PROJECT_ID;
  if (!apiKey)    throw new Error('Missing UNLINK_API_KEY (get one at https://app.unlink.xyz/developers/api-keys)');
  if (!projectId) throw new Error('Missing UNLINK_PROJECT_ID');
  if (!process.env.PRIVATE_KEY) throw new Error('Missing PRIVATE_KEY for the custodial wallet');
  if (!TOKEN)     throw new Error('Missing UNLINK_TOKEN_ADDRESS / TWSXMR_ADDRESS');

  const provider  = new JsonRpcProvider(RPC_URL, CHAIN_ID);
  const evmWallet = new Wallet(process.env.PRIVATE_KEY, provider);

  const admin = createUnlinkAdmin({ environment: ENVIRONMENT, apiKey });

  const message   = buildDeriveSeedMessage({ appId: projectId, chainId: CHAIN_ID });
  const signature = await evmWallet.signMessage(message);
  const unlinkAccount = account.fromEthereumSignature({ signature, appId: projectId, chainId: CHAIN_ID });
  const unlinkAddress = await unlinkAccount.getAddress();

  const client = createUnlinkClient({
    environment: ENVIRONMENT,
    account: unlinkAccount,
    evm: evm.fromEthers({ signer: evmWallet, provider }),
    register: (payload) => admin.users.register(payload),
    authorizationToken: {
      provider: () => admin.authorizationTokens.issue({ unlinkAddress }),
    },
  });

  await client.ensureRegistered();

  cached = { client, unlinkAddress, evmAddress: evmWallet.address };
  return cached;
}

// ─── Amount helpers (token base units; default 8 decimals) ───────────────────
function toBaseUnits(human, decimals = DECIMALS) {
  const s = String(human).trim();
  if (!s || isNaN(Number(s))) throw new Error('Invalid amount');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  if (frac.length > decimals) throw new Error(`Max ${decimals} decimal places`);
  const combined = `${whole}${(frac + '0'.repeat(decimals)).slice(0, decimals)}`.replace(/^0+(?=\d)/, '');
  return BigInt(combined || '0');
}

function formatBaseUnits(raw, decimals = DECIMALS) {
  const v = BigInt(raw || '0');
  const abs = (v < 0n ? -v : v).toString().padStart(decimals + 1, '0');
  const whole = abs.slice(0, abs.length - decimals);
  const frac = abs.slice(abs.length - decimals).replace(/0+$/, '');
  return `${v < 0n ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Custodial identity + current shielded balance. */
export async function getInfo() {
  const { client, unlinkAddress, evmAddress } = await getCtx();
  const raw = await client.balanceOf(TOKEN);
  const balanceRaw = raw == null ? '0' : String(raw);
  return {
    unlinkAddress,
    evmAddress,
    token: TOKEN,
    decimals: DECIMALS,
    balanceRaw,
    balance: formatBaseUnits(balanceRaw),
  };
}

/**
 * Privately send `amount` of the token to a recipient `unlink1…` address,
 * auto-shielding the shortfall from the custodial wallet first if needed.
 */
export async function sendPrivate({ recipientAddress, amount }) {
  if (!recipientAddress || !recipientAddress.startsWith('unlink1')) {
    throw new Error('recipientAddress must be a valid unlink1… address');
  }
  const { client } = await getCtx();
  const need = toBaseUnits(amount);
  if (need <= 0n) throw new Error('amount must be greater than 0');

  const have = BigInt((await client.balanceOf(TOKEN)) ?? '0');

  let shielded = false;
  let shieldStatus = null;
  if (have < need) {
    const shortfall = (need - have).toString();
    console.log(`[Unlink] shielding shortfall ${formatBaseUnits(shortfall)} (${TOKEN})`);
    const dep = await client.depositWithApproval({ token: TOKEN, amount: shortfall });
    const depRes = await dep.wait();
    shielded = true;
    shieldStatus = depRes.status;
    if (depRes.status === 'failed') {
      throw new Error('Shield (deposit) failed on-chain; nothing was sent.');
    }
  }

  console.log(`[Unlink] private transfer ${formatBaseUnits(need.toString())} -> ${recipientAddress}`);
  const tx = await client.transfer({ recipientAddress, token: TOKEN, amount: need.toString() });
  const res = await tx.wait();
  if (res.status === 'failed') {
    // Funds remain shielded; a retry will skip the (now-unneeded) shield step.
    throw new Error('Private transfer failed; funds are still shielded — you can retry the send.');
  }

  const balanceAfter = String((await client.balanceOf(TOKEN)) ?? '0');
  return {
    success: true,
    shielded,
    shieldStatus,
    transferStatus: res.status,
    txId: res.txId,
    txHash: res.txHash || null,
    amount: formatBaseUnits(need.toString()),
    recipientAddress,
    balanceRaw: balanceAfter,
    balance: formatBaseUnits(balanceAfter),
  };
}

/** Manually shield (deposit) tokens from the custodial wallet into the pool. */
export async function shield({ amount }) {
  const { client } = await getCtx();
  const amt = toBaseUnits(amount);
  if (amt <= 0n) throw new Error('amount must be greater than 0');
  const tx = await client.depositWithApproval({ token: TOKEN, amount: amt.toString() });
  const res = await tx.wait();
  if (res.status === 'failed') throw new Error('Shield (deposit) failed on-chain.');
  const balanceAfter = String((await client.balanceOf(TOKEN)) ?? '0');
  return { success: true, status: res.status, balanceRaw: balanceAfter, balance: formatBaseUnits(balanceAfter) };
}

/** Withdraw (unshield) tokens out to a public EVM address. */
export async function withdraw({ recipientEvmAddress, amount }) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipientEvmAddress || '')) {
    throw new Error('recipientEvmAddress must be a valid 0x… address');
  }
  const { client } = await getCtx();
  const amt = toBaseUnits(amount);
  if (amt <= 0n) throw new Error('amount must be greater than 0');
  const tx = await client.withdraw({ recipientEvmAddress, token: TOKEN, amount: amt.toString() });
  const res = await tx.wait();
  if (res.status === 'failed') throw new Error('Withdraw failed on-chain.');
  const balanceAfter = String((await client.balanceOf(TOKEN)) ?? '0');
  return { success: true, status: res.status, txId: res.txId, balanceRaw: balanceAfter, balance: formatBaseUnits(balanceAfter) };
}
