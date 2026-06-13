# ⛴️ WrapSynth - Wrapped Monero on EVM Chains Gnosis and Base (ETHGlobal NYC 2026)

## 📢 ETHGlobal NYC 2026 Bounty Submission: Continuity Track

To satisfy the **Continuity Track** requirements, this repository clearly distinguishes between our **Original Production State** and our **New Bounty Contribution**. 

### 🔹 Pre-Event: The Original Protocol (The Base)
> **Live since June 2, 2026:** Our protocol was already a fully operational trustless cross-chain ferry for Monero on Gnosis Chain mainnet. We launched with overcollateralized LP vaults and Ed25519 atomic swap commitments—no custodians, no federations.

- ✅ **wsXMR/sDAI Pool Live:** [View Pool](https://gnosisscan.io/address/0x3b3f640b137ed13c79d2d51c54329816a6fbd85d)
- ✅ **Verified on Mainnet:** All contracts verified on Gnosisscan (wsXmrHub, Facets, Router).
- ✅ **Audited & Stable:** Two rounds of security review; critical solvency invariants tested.

### 🔸 Post-Event: The Bounty Contribution (Unlink Integration)
> **What we built for the bounty:** We integrated the **Unlink SDK** to enable private deposits of wrapped Monero, bridging EVM liquidity with off-chain privacy primitives.

- 🚀 **New Primitives Added:** `deposit()` and `withdraw()` interfaces using Unlink's private state.
- 🔒 **Enhanced Privacy Layer:** Users can now deposit private Monero assets (converted via a bridge) into our vault with enhanced privacy guarantees compared to standard EVM transfers.
- 🧪 **Demo Code:** See [`unlink-integration/`](./unlink-integration/) for the client-side `deposit.js` and server-side withdrawal endpoints.

---

## 🚀 ETHGlobal NYC 2026 - Base Sepolia Deployment (This Fork)

We are currently deploying this protocol to **Base Sepolia testnet** for the hackathon demo, integrating:
- **Chainlink Data Streams** for real-time XMR/USD price feeds.
- **Uniswap API** integration for optimized liquidity routing.
- **Unichain Privacy** features for enhanced cross-chain privacy.

### 📍 Contract Addresses (Base Sepolia - ChainID 84532)

| Contract | Address |
|---|---|
| wsXMR Token | [`0x81AaB8b92b38d0ab60B99b4aF12edaEE92b9C0C4`](https://sepolia.basescan.org/address/0x81AaB8b92b38d0ab60B99b4aF12edaEE92b9C0C4) |
| wsXmrHub | [`0x0454983E17b803a2C6ff0d98d5D58676525F4A92`](https://sepolia.basescan.org/address/0x0454983E17b803a2C6ff0d98d5D58676525F4A92) |
| Liquidity Router | [`0x95adc386C3625a539785EF4b3C949f7c1497D268`](https://sepolia.basescan.org/address/0x95adc386C3625a539785EF4b3C949f7c1497D268) |
| wsXMR/sDAI UniV3 Pool | [`0x3b3f640b137ed13c79d2d51c54329816a6fbd85d`](https://gnosisscan.io/address/0x3b3f640b137ed13c79d2d51c54329816a6fbd85d) |

<details>
<summary>Facet addresses</summary>

| Facet | Address |
|---|---|
| RedStoneOracleFacet | [`0xa04bB8E8670c95Ae3017b959dcC7FAdA73A003dc`](https://gnosisscan.io/address/0xa04bB8E8670c95Ae3017b959dcC7FAdA73A003dc) |
| VaultFacet | [`0x81Ef0aF3Eb50Df7241eaC44364dD64A0B754E6cB`](https://gnosisscan.io/address/0x81Ef0aF3Eb50Df7241eaC44364dD64A0B754E6cB) |
| MintFacet | [`0x4e53Ad9223CcBd8953b53223fEB2161338B34D7C`](https://gnosisscan.io/address/0x4e53Ad9223CcBd8953b53223fEB2161338B34D7C) |
| BurnFacet | [`0x4F072A55CE4c3d3B5F247C67beF037d4Cc525dD7`](https://gnosisscan.io/address/0x4F072A55CE4c3d3B5F247C67beF037d4Cc525dD7) |
| LiquidationFacet | [`0x6FA84E83694002aBfA6fc198F430A14f96FdaA54`](https://gnosisscan.io/address/0x6FA84E83694002aBfA6fc198F430A14f96FdaA54) |
| YieldFacet | [`0xA676e2dC47F6B2639F54094190783bcbA8080947`](https://gnosisscan.io/address/0xA676e2dC47F6B2639F54094190783bcbA8080947) |

Full deployment manifest (external contracts, pool config, LP defaults): [`deployment.json`](./deployment.json)
</details>

---

## 🏗️ Architecture

### Hub + Facet (Diamond-style)

All protocol state and collateral live in a single contract, **wsXmrHub**, which dispatches calls to stateless logic facets via a selector → facet table:

- The Hub owns all state (`wsXmrStorage`), holds all collateral, and is the only address authorized to mint/burn wsXMR
- Facets contain logic only and access state through the Hub; only registered facets can mutate state
- Delegate-context is tracked with **EIP-1153 transient storage**, preventing facet logic from being invoked outside the hub's dispatch path

```
                      ┌────────────────────────────┐
                      │         wsXmrHub           │
                      │  state · collateral · token │
                      │  selector → facet dispatch  │
                      └──────────┬─────────────────┘
        ┌──────────┬─────────┬──┴──────┬───────────┬──────────┐
   VaultFacet  MintFacet  BurnFacet  Liquidation  YieldFacet  OracleFacet
   (LP vaults) (XMR→wsXMR)(wsXMR→XMR)  Facet     (sDAI yield) (RedStone)
```

### Key components

- **Ed25519 on-chain verification** — atomic swap secrets are Ed25519 scalars; the contract computes `scalarMultBase(secret)` and checks it against the user's commitment, binding settlement to the same key material used on the Monero side
- **WETH collateral** — LP vaults are denominated in an ERC4626 wrapper around WETH (MockSavingsDAI), so idle collateral earns yield; **YieldFacet** harvests and accounts for vault yield
- **Co-LP liquidity router** — `wsXMRLiquidityRouter` deploys vault collateral as Uniswap V3 concentrated liquidity paired against user-supplied wsXMR, putting backing capital to work instead of letting it sit idle
- **Oracle facet** — RedStone-style oracle with an off-chain price pusher keeping XMR/USD fresh on-chain
- **LP node** (`ethereum/lp-node/`, Rust) — monitors events, manages Monero RPC, prices quotes, runs arbitrage, and exposes a REST API for the frontend

---

## 📖 How It Works

### Minting (XMR → wsXMR)

1. **`initiateMint`** — user posts a claim commitment (Ed25519 point) and griefing deposit; the LP vault's capacity is reserved
2. User sends XMR to the LP's Monero address
3. **`setMintReady`** — LP confirms XMR receipt on-chain
4. **`finalizeMint`** — user reveals the secret scalar; the contract verifies `scalarMultBase(secret)` matches the commitment, mints wsXMR, and refunds the deposit

### Burning (wsXMR → XMR)

1. **`requestBurn`** — user locks wsXMR and posts a hash commitment with their Monero destination; LP collateral is reserved against the burn and a deadline starts
2. **`confirmMoneroLock`** — LP signals the XMR payment is underway
3. LP sends XMR; **`finalizeBurn`** settles with the secret reveal, burning the wsXMR and releasing the LP's collateral
4. Escape hatches:
   - **`abortBurn`** — clean unwind before settlement, returning wsXMR to the user
   - **`forceSettleBurn`** / **`claimSlashedCollateral`** — if the LP misses the deadline, the user seizes collateral at oracle price; bad outcomes hit the responsible vault, not the system

### For Liquidity Providers

1. Create a vault and deposit WETH via **VaultFacet** (minimum 150% collateral ratio; 180% target)
2. Optionally deploy collateral into the co-LP Uniswap V3 position via the router
3. Run the LP node to serve mint/burn flow automatically
4. Earn mint/burn fees + sDAI yield + LP fees; keep ratio above the 120% liquidation threshold

---

## 🔐 Security

### Review history

The protocol has been through **two rounds of security review**, with all critical and high-severity findings resolved and locked in by regression tests ([`AuditRegressionTest.t.sol`](./ethereum/test/AuditRegressionTest.t.sol)). Notable findings fixed:

- **Delegate-context reentrancy** in the hub dispatch path — closed using EIP-1153 transient-storage context flags
- **Yield harvesting unit mismatch** between sDAI shares and DAI amounts in vault accounting
- **Inverted bad-debt socialization** logic in liquidation flow
- **Burn flow redesign** — the original single-path burn was replaced with the `requestBurn` / `abortBurn` / `forceSettleBurn` state machine to remove griefing and stuck-funds paths

### Testing

- [`BurnSolvencyInvariantTest.t.sol`](./ethereum/test/BurnSolvencyInvariantTest.t.sol) — 633-line Foundry invariant suite asserting system solvency across randomized mint/burn/liquidation sequences
- Full lifecycle E2E suites (`E2EFullCycle`, `E2EComprehensive`, `E2EAdvancedScenarios`) plus Hardhat unit suites per facet
- Co-LP fork tests against Gnosis mainnet state (`test/coLP/`)
- Ed25519 compatibility tests against reference vectors

### Honest risk disclosure

⚠️ This is early-stage protocol software. Reviews to date do not eliminate risk:

- No formal verification yet
- Oracle liveness depends on the off-chain price pusher
- LP-side Monero payment confirmation is an off-chain step; the protocol's protection is economic (collateral slashing), not cryptographic proof of XMR transfer
- Use amounts you can afford to lose

---

## 🛠️ Development

### Prerequisites

Node.js v18+, Foundry, Rust (for the LP node), Hardhat (via npm).

```bash
# Clone the ETHGlobal NYC 2026 fork
git clone https://github.com/vedantp03/WrapSynth-ETHGlobal.git
cd WrapSynth-ETHGlobal/ethereum
npm install
cp .env.example .env   # add PRIVATE_KEY and GNOSIS_RPC_URL

# Compile + test
npx hardhat compile
npm test               # Hardhat suites
forge test             # Foundry invariant + E2E suites
```

> **Note:** This fork builds on the original [madschristensen99/wrapsynth](https://github.com/madschristensen99/wrapsynth) codebase. For the production deployment and original implementation, see the upstream repository.

### Run the LP node

```bash
cd ethereum/lp-node
cargo build --release
cargo run --release -- --config config.toml
```

### Solana (in development)

```bash
cd solana/anchor-program
anchor build && anchor test
```

---

## 📁 Repo Layout

```
wrapsynth/
├── deployment.json           # Live Gnosis mainnet deployment manifest
├── ethereum/
│   ├── contracts/
│   │   ├── core/             # wsXmrHub, wsXmrStorage
│   │   ├── facets/           # Vault, Mint, Burn, Liquidation, Yield, Oracle
│   │   ├── router/           # wsXMRLiquidityRouter (co-LP UniV3)
│   │   ├── Ed25519.sol       # On-chain Ed25519 scalar mult
│   │   └── wsXMR.sol         # ERC-20 (8 decimals, matching XMR)
│   ├── test/                 # Foundry invariant/E2E + Hardhat suites
│   └── lp-node/              # Rust LP node (events, Monero RPC, quotes, API)
├── solana/anchor-program/    # Solana port (Anchor)
├── frontend/                 # Web app
└── docs/                     # Sequence diagrams, seed storage design
```

---

## 🔮 Roadmap

- ✅ Gnosis mainnet deployment + verified contracts
- ✅ Live wsXMR/sDAI Uniswap V3 pool
- ✅ Co-LP concentrated liquidity router
- 🔄 Solana port (Meteora DLMM liquidity, JitoSOL collateral, Pyth oracle)
- 🔄 Additional LP onboarding + deeper liquidity
- ⏳ Hyperliquid wsXMR/USD market (HIP-3 proposal drafted)
- ⏳ Third-party audit + bug bounty ahead of broader scaling
- ⏳ Multi-chain expansion

---

## 📚 Documentation

- [Sequence diagrams](./docs/sequenceDiagrams.md) — mint/burn/liquidation flows
- [Seed storage design](./docs/SEED_STORAGE_IMPLEMENTATION.md)
- [LP node README](./ethereum/lp-node/)
- [Solana program](./solana/anchor-program/)

---

## ⚠️ Disclaimer

Experimental protocol software provided "as is." It has undergone security review but not formal third-party audit certification or formal verification. The developers assume no liability for losses. Interact at your own risk.

## 📄 License

MIT

---

Built with ❤️ for privacy and decentralization
