# Mission Context: Unlink SDK Deposit Integration

## Objective
Implement a streamlined deposit flow using the Unlink SDK on **Base Sepolia**. The system derives a deterministic identity via EVM signature, initializes an admin-authorized client, and executes deposits using the atomic `depositWithApproval` primitive.

## Key Requirements & Configuration

### 1. Environment Variables (`.env`)
Ensure these are populated before running:
- `PRIVATE_KEY` – EVM wallet private key (Base Sepolia)
- `BASE_SEPOLIA_RPC_URL` – JSON-RPC endpoint for Base Sepolia
- `UNLINK_API_KEY` – Unlink platform API key (from developer dashboard)
- `UNLINK_PROJECT_ID` – Your Unlink project/app ID
- `UNLINK_TEST_TOKEN` or `TOKEN_ADDRESS` – Contract address of the token to deposit

### 2. Core Implementation Flow (`deposit.js`)
The script follows this atomic sequence:
1. **Init:** Setup EVM provider/wallet and validate `.env`.
2. **Identity Derivation:** Use `buildDeriveSeedMessage` + `evmWallet.signMessage()` to generate a signature, then derive the Unlink account via `account.fromEthereumSignature()`.
3. **Client Construction:** Initialize `createUnlinkClient` with:
   - The derived `unlinkAccount`.
   - `evm.fromEthers()` for on-chain interactions.
   - `register: admin.users.register` for auto-registration.
   - `authorizationToken.provider` for session management.
4. **Execution:** Call `client.ensureRegistered()` followed by `client.depositWithApproval({ token, amount })`. This method handles ERC-20 allowances and relayer settlement tracking internally.

### 3. Corrected SDK Imports
```javascript
import 'dotenv/config';
import { createUnlinkAdmin } from '@unlink-xyz/sdk/admin';
import { account, buildDeriveSeedMessage } from '@unlink-xyz/sdk/crypto';
import { createUnlinkClient, evm } from '@unlink-xyz/sdk/client';
import { Wallet, JsonRpcProvider } from 'ethers';
```

## Solutions & Troubleshooting Log

### Resolved Issues
- **Bech32m Format Error:** `invalid bech32m: decode: parse failed` when calling `admin.users.getBalances()`.
  - *Fix:* Used `unlinkAccount.getAddress()` to ensure correct formatting and accessed response data via `response.data`.
- **Complex Manual Approval:** Replaced verbose manual ERC-20 approval + REST polling with `client.depositWithApproval()`.
  - *Benefit:* Atomic flow, reduced boilerplate, and automatic relayer status tracking.
- **Import Mismatches:** `account` and `buildDeriveSeedMessage` must be imported from `@unlink-xyz/sdk/crypto`, not `/client`.

### Known Pitfalls
- **Project ID Requirement:** The signature derivation requires a valid `UNLINK_PROJECT_ID`. Empty strings may cause derivation failures.
- **Admin Token Lifecycle:** Authorization tokens have an expiration; if using long-running processes, ensure the `provider` function in the client config re-issues tokens as needed.

## Development Rules for Agents
1. **Step-by-Step Implementation:** Always implement integration flows step-by-step (Setup → Derive → Init → Execute). Do not skip initialization steps.
2. **Clarify SDK Behavior:** Before modifying client logic, verify the specific return types of `depositWithApproval` vs `deposit` in the latest Unlink SDK documentation.
3. **Document Before Committing:** Update `qwencontext.md` and `README.md` to reflect any new primitives or environmental changes *before* committing code changes.

## Next Steps for Bounty Qualification
- [ ] Populate `.env` with live Base Sepolia credentials.
- [ ] Execute a successful deposit of tWXMR (or equivalent test token).
- [ ] Verify the deposit status is `"processed"` in the console output.
- [ ] Commit changes to demonstrate the privacy layer integration for the Continuity track.