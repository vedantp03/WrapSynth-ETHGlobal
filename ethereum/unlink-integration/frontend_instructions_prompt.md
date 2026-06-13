# Agent Mission: Build Unlink Privacy Deposit Frontend Integration

## Context & Objective
You are building the client-side frontend integration for the **WrapSynth** protocol on **Base Sepolia**. This is a **Continuity Track** submission for the ETHGlobal NYC 2026 Unlink Bounty. 

Your goal is to create a React/Node.js frontend module that allows users to deposit wrapped Monero (wsXMR) or test tokens into our liquidity vault using the **Unlink SDK** for private state management. 

**Critical Rule:** This repository contains an existing production protocol (WrapSynth/wsXMR). You are **not** rewriting the protocol. You are adding a new `unlink-integration/` layer that uses Unlink's `depositWithApproval()` primitive to bridge EVM liquidity with off-chain privacy.

---

## 1. Environment Setup & Dependencies

First, ensure the following dependencies and environment variables are configured. Do not skip these steps.

### Required Packages
```bash
npm install @unlink-xyz/sdk ethers dotenv
# If using a React framework (e.g., Next.js/Vite):
npm install -D @types/ethers
```

### Environment Variables (.env)
Create or update `.env` with the following keys. The agent must verify these exist before running any code:
- `PRIVATE_KEY`: EVM wallet private key (Base Sepolia testnet)
- `BASE_SEPOLIA_RPC_URL`: JSON-RPC endpoint for Base Sepolia
- `UNLINK_API_KEY`: Unlink platform API key
- `UNLINK_PROJECT_ID`: Your Unlink project/app ID (Required for identity derivation)
- `TOKEN_ADDRESS`: Contract address of the token to deposit (e.g., tWXMR or WETH on Base Sepolia)

---

## 2. Core Implementation Logic (Step-by-Step)

You must implement the frontend integration following this exact atomic sequence. Do not skip initialization steps.

### Step A: Identity Derivation (Deterministic Unlink Account)
The user's Unlink identity is derived from their EVM signature, not generated randomly.
1. **Construct Message:** Use `buildDeriveSeedMessage()` from `@unlink-xyz/sdk/crypto` to create the challenge message using the `UNLINK_PROJECT_ID`.
2. **Sign:** Sign this message using the user's EVM wallet (`evmWallet.signMessage(message)`).
3. **Derive Account:** Pass the signature to `account.fromEthereumSignature(signature)` to generate the deterministic `unlinkAccount`.

### Step B: Client Construction (Admin-Authorized)
Initialize the Unlink client with the derived account and EVM provider.
```javascript
import { createUnlinkClient, evm } from '@unlink-xyz/sdk/client';
import { createUnlinkAdmin } from '@unlink-xyz/sdk/admin';

// Setup EVM
const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const evmWallet = evm.fromEthers(wallet);

// Initialize Admin (for setup/registration)
const admin = createUnlinkAdmin({ 
  apiKey: process.env.UNLINK_API_KEY,
  projectId: process.env.UNLINK_PROJECT_ID 
});

// Initialize Client with derived account
const unlinkClient = createUnlinkClient({
  account: unlinkAccount, // Derived from Step A
  evm: evmWallet,
  register: admin.users.register, // Auto-registration helper
  authorizationToken: { provider: () => admin.tokens.get() } // Session management
});
```

### Step C: Execution (Private Deposit)
Use the atomic `depositWithApproval` primitive. This handles ERC-20 allowances and relayer settlement tracking internally.
```javascript
// Ensure user is registered
await unlinkClient.ensureRegistered();

// Execute Deposit
const depositResult = await unlinkClient.depositWithApproval({
  token: process.env.TOKEN_ADDRESS, // e.g., tWXMR contract address
  amount: parseUnits('1.0', 18)    // Amount in wei/base units
});

console.log('Deposit Status:', depositResult.status); // Must be "processed"
```

---

## 3. Frontend UI Requirements (React Component)

Create a `UnlinkDepositPanel.jsx` (or `.tsx`) component that:
1. **Connects Wallet:** Uses `ethers` or `wagmi` to connect the user's MetaMask/WalletConnect.
2. **Shows Status:** Displays "Connecting...", "Deriving Identity...", "Approving Deposit...", and "Deposit Successful".
3. **Handles Errors:** Catches and displays common errors:
   - `invalid bech32m: decode: parse failed` (Ensure `unlinkAccount.getAddress()` is used correctly)
   - `INSUFFICIENT_ALLOWANCE` (Trigger auto-approval via `depositWithApproval`)
   - `UNLINK_PROJECT_ID_MISSING` (Validate env vars)
4. **Integrates with WrapSynth:** After a successful Unlink deposit, log the transaction hash and optionally interact with the `wsXmrHub` contract to verify vault receipt (if applicable).

---

## 4. Validation & Testing Criteria

Before considering this integration complete, you must verify:
- [ ] **Bech32m Format:** `unlinkAccount.getAddress()` returns a valid Unlink address (starts with `unl_`).
- [ ] **Atomic Deposit:** `depositWithApproval()` completes without manual ERC-20 approval steps.
- [ ] **Status Verification:** Console output shows deposit status as `"processed"`.
- [ ] **Continuity Track Compliance:** The code clearly comments that this is a *new* privacy layer on top of the existing WrapSynth protocol, not a replacement.

---

## 5. Known Pitfalls & Troubleshooting (Do Not Ignore)

1. **Project ID Requirement:** `UNLINK_PROJECT_ID` must be a valid UUID from the Unlink developer dashboard. Empty strings will cause derivation failures.
2. **Admin Token Lifecycle:** Authorization tokens expire. If building a long-lived session, ensure the `authorizationToken.provider` function re-issues tokens as needed.
3. **Import Mismatches:** 
   - ✅ Correct: `import { account, buildDeriveSeedMessage } from '@unlink-xyz/sdk/crypto';`
   - ❌ Wrong: Importing these from `/client` or `/sdk` directly.
4. **Base Sepolia Specifics:** Ensure all contract addresses and RPC URLs are for Base Sepolia (ChainID 84532), not Gnosis mainnet.

---

## 6. Deliverables

1. `frontend/unlink-integration/UnlinkDepositPanel.jsx` (or `.tsx`)
2. `frontend/unlink-integration/utils/unlinkClient.js` (The core client setup logic)
3. Updated `.env.example` with the new Unlink variables
4. A brief README in `frontend/unlink-integration/README.md` explaining how to run the demo

**Note:** Do not modify the core `ethereum/contracts/` or `deployment.json` unless explicitly asked. Focus on the frontend integration layer only.
