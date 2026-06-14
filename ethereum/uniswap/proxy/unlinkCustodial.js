// ─── Custodial Unlink private transfers ──────────────────────────────────────
//
// Two server-held Unlink identities make the demo a self-contained loop:
//   • SENDER     (PRIVATE_KEY)            — holds the public token funds; shields
//                                            + privately transfers on /send.
//   • RECIPIENT  (RECIPIENT_PRIVATE_KEY)  — the account shown in the UI; its
//                                            private balance grows on /send and is
//                                            cashed out on /withdraw.
//
// So in the UI: "Send privately" tops up the recipient's private balance from the
// sender pool, and "Withdraw" moves the recipient's private balance out to a
// public wallet. If RECIPIENT_PRIVATE_KEY is unset, both roles collapse onto the
// sender identity.
//
// Reuses the client-construction pattern proven in lp-server/unlinkDeposit.js.

import { createUnlinkAdmin } from '@unlink-xyz/sdk/admin';
import { buildDeriveSeedMessage, account } from '@unlink-xyz/sdk/crypto';
import { createUnlinkClient, evm } from '@unlink-xyz/sdk/client';
import { Wallet, JsonRpcProvider, FallbackProvider } from 'ethers';

const ENVIRONMENT   = process.env.UNLINK_ENVIRONMENT || 'base-sepolia';
const CHAIN_ID      = 84532;
const TOKEN         = process.env.UNLINK_TOKEN_ADDRESS || process.env.TWSXMR_ADDRESS;
const DECIMALS      = Number(process.env.UNLINK_TOKEN_DECIMALS || 8);

// Base Sepolia public RPCs are flaky/rate-limited (the deposit leg makes several
// calls), which surfaces as "fetch failed". Use a FallbackProvider across a few
// endpoints (any configured one first) so a single flaky RPC doesn't break a send.
function makeProvider() {
  const urls = [
    process.env.BASE_SEPOLIA_RPC,
    process.env.BASE_SEPOLIA_RPC_URL,
    'https://base-sepolia-rpc.publicnode.com',
    'https://sepolia.base.org',
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  if (urls.length === 1) return new JsonRpcProvider(urls[0], CHAIN_ID);

  return new FallbackProvider(
    urls.map((url, i) => ({
      provider: new JsonRpcProvider(url, CHAIN_ID),
      priority: i + 1,
      stallTimeout: 2500,
      weight: 1,
    })),
    CHAIN_ID,
    { quorum: 1 },
  );
}

const cache = {}; // privateKey -> { client, unlinkAddress, evmAddress }

/** Build (once per key) a custodial client + identity for the given wallet key. */
async function buildCtx(privateKey) {
  if (cache[privateKey]) return cache[privateKey];

  const apiKey    = process.env.UNLINK_API_KEY;
  const projectId = process.env.UNLINK_PROJECT_ID;
  if (!apiKey)    throw new Error('Missing UNLINK_API_KEY (get one at https://app.unlink.xyz/developers/api-keys)');
  if (!projectId) throw new Error('Missing UNLINK_PROJECT_ID');
  if (!privateKey) throw new Error('Missing wallet private key');
  if (!TOKEN)     throw new Error('Missing UNLINK_TOKEN_ADDRESS / TWSXMR_ADDRESS');

  const provider  = makeProvider();
  const evmWallet = new Wallet(privateKey, provider);

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

  cache[privateKey] = { client, unlinkAddress, evmAddress: evmWallet.address };
  return cache[privateKey];
}

/** Sender = funded server wallet (holds the public token, funds private sends). */
function getSender() {
  if (!process.env.PRIVATE_KEY) throw new Error('Missing PRIVATE_KEY for the custodial wallet');
  return buildCtx(process.env.PRIVATE_KEY);
}

/** Recipient = the account shown/withdrawn in the UI. Falls back to the sender
 *  identity when RECIPIENT_PRIVATE_KEY is not configured. */
function getRecipient() {
  return buildCtx(process.env.RECIPIENT_PRIVATE_KEY || process.env.PRIVATE_KEY);
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

/** Recipient identity (UI-facing) + its current private balance. */
export async function getInfo() {
  const recipient = await getRecipient();
  const sender = await getSender();
  const raw = await recipient.client.balanceOf(TOKEN);
  const balanceRaw = raw == null ? '0' : String(raw);
  return {
    // The UI shows/withdraws the recipient account.
    unlinkAddress: recipient.unlinkAddress,
    evmAddress: recipient.evmAddress,
    senderUnlinkAddress: sender.unlinkAddress,
    token: TOKEN,
    decimals: DECIMALS,
    balanceRaw,
    balance: formatBaseUnits(balanceRaw),
  };
}

/**
 * Privately send `amount` of the token to a recipient `unlink1…` address,
 * auto-shielding the shortfall from the sender (server) wallet first if needed.
 */
export async function sendPrivate({ recipientAddress, amount }) {
  if (!recipientAddress || !recipientAddress.startsWith('unlink1')) {
    throw new Error('recipientAddress must be a valid unlink1… address');
  }
  const { client } = await getSender();
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

/** Manually shield (deposit) tokens from the sender (server) wallet into the pool. */
export async function shield({ amount }) {
  const { client } = await getSender();
  const amt = toBaseUnits(amount);
  if (amt <= 0n) throw new Error('amount must be greater than 0');
  const tx = await client.depositWithApproval({ token: TOKEN, amount: amt.toString() });
  const res = await tx.wait();
  if (res.status === 'failed') throw new Error('Shield (deposit) failed on-chain.');
  const balanceAfter = String((await client.balanceOf(TOKEN)) ?? '0');
  return { success: true, status: res.status, balanceRaw: balanceAfter, balance: formatBaseUnits(balanceAfter) };
}

/** Withdraw (unshield) the recipient's private balance out to a public EVM address. */
export async function withdraw({ recipientEvmAddress, amount }) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipientEvmAddress || '')) {
    throw new Error('recipientEvmAddress must be a valid 0x… address');
  }
  const { client } = await getRecipient();
  const amt = toBaseUnits(amount);
  if (amt <= 0n) throw new Error('amount must be greater than 0');

  const have = BigInt((await client.balanceOf(TOKEN)) ?? '0');
  if (have < amt) {
    throw new Error(`Insufficient private balance to withdraw: have ${formatBaseUnits(have.toString())}, need ${formatBaseUnits(amt.toString())} wsXMR. Send privately to this account first.`);
  }

  const tx = await client.withdraw({ recipientEvmAddress, token: TOKEN, amount: amt.toString() });
  const res = await tx.wait();
  if (res.status === 'failed') throw new Error('Withdraw failed on-chain.');
  const balanceAfter = String((await client.balanceOf(TOKEN)) ?? '0');
  return { success: true, status: res.status, txId: res.txId, balanceRaw: balanceAfter, balance: formatBaseUnits(balanceAfter) };
}
