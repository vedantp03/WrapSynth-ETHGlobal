// ─── Unlink private send for wsXMR (custodial server) ────────────────────────
//
// Thin client over the custodial Unlink endpoints on the Uniswap proxy server
// (ethereum/uniswap/proxy/server.js). The server holds the Unlink identity and
// funded wallet and performs the shield (deposit) + private transfer on the
// caller's behalf — so this module is just `fetch` wrappers, no wallet signature
// and no per-user key.
//
//   GET  /api/unlink/info      -> { unlinkAddress, evmAddress, token, decimals, balanceRaw, balance }
//   POST /api/unlink/send      -> { recipientAddress, amount }
//   POST /api/unlink/withdraw  -> { recipientEvmAddress, amount }
//   POST /api/unlink/shield    -> { amount }

import { UNLINK_CONFIG } from './config.js';

const base = () => UNLINK_CONFIG.baseUrl.replace(/\/$/, '');

async function call(path, options) {
    const res = await fetch(base() + path, options);
    let data;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

/** Custodial identity + current shielded balance. */
export function getInfo() {
    return call('/api/unlink/info');
}

/** Privately send `amount` (human, e.g. "1.5") to a recipient `unlink1…` address. */
export function sendPrivate(recipientAddress, amount) {
    return call('/api/unlink/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientAddress, amount }),
    });
}

/** Withdraw `amount` (human) of shielded tokens to a public EVM address. */
export function withdraw(amount, recipientEvmAddress) {
    return call('/api/unlink/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEvmAddress, amount }),
    });
}

/** Manually shield `amount` (human) into the custodial private balance. */
export function shield(amount) {
    return call('/api/unlink/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
    });
}
