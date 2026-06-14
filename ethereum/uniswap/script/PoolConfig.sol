// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PoolConfig
/// @notice Canonical Base Sepolia addresses for the WrapSynth swap pools.
///         Single source of truth so funding/withdraw scripts don't re-hardcode.
library PoolConfig {
    // ── Uniswap V3 core (Base Sepolia, official deployments) ──────────────────
    address internal constant NPM     = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2; // NonfungiblePositionManager
    address internal constant ROUTER  = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4; // SwapRouter02
    address internal constant QUOTER  = 0xC5290058841028F1614F3A6F0F5816cAd0df5E27; // QuoterV2
    address internal constant FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24; // UniswapV3Factory
    address internal constant WETH    = 0x4200000000000000000000000000000000000006;

    // ── Active swap pair: REAL wsXMR / WETH (created 2026-06-13) ───────────────
    // token0 = WETH (0x4200… < 0x81Aa…), token1 = wsXMR. Initialized at 1 wsXMR = 0.21 ETH.
    address internal constant WSXMR            = 0x81AaB8b92b38d0ab60B99b4aF12edaEE92b9C0C4; // 8 decimals
    address internal constant WSXMR_WETH_POOL  = 0xf34e4c3289187aDd920E8c5db3590D482ed4E3E9;
    uint24  internal constant WSXMR_WETH_FEE   = 3000; // 0.3%, tick spacing 60

    // Full-range ticks for tick spacing 60 (nearest usable multiples of 60 to ±887272)
    int24 internal constant FULL_RANGE_TICK_LOWER = -887220;
    int24 internal constant FULL_RANGE_TICK_UPPER =  887220;
}
