// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolConfig} from "./PoolConfig.sol";

// Adds liquidity (an LP position) to the REAL wsXMR/WETH pool. Anyone can run this with
// their own PRIVATE_KEY in env — they get their own position NFT. Use it later, when more
// wsXMR is available, to deepen the pair.
//
// Env (all amounts in raw base units — wsXMR = 8 decimals, WETH = 18 decimals):
//   PRIVATE_KEY    required — the funder/LP
//   WSXMR_AMOUNT   required — wsXMR to add (e.g. 150000 = 0.0015 wsXMR)
//   WETH_AMOUNT    required — WETH to add  (e.g. 315000000000000 = 0.000315 WETH)
//   WRAP_ETH       optional — "true" to auto-wrap native ETH into WETH if the WETH
//                             balance is short (default: false; requires you to hold WETH)
//
// NOTE: the deployer is an EIP-7702 delegated account, so the public RPC rejects rapid
// multi-tx broadcasts. Run with --slow:
//   forge script script/FundPool.s.sol:FundPool --rpc-url base_sepolia --broadcast --slow -vvvv

interface IWETH9 {
    function deposit() external payable;
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline;
    }
    function mint(MintParams calldata params)
        external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

contract FundPool is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address me  = vm.addr(key);
        uint256 wsxmrAmount = vm.envUint("WSXMR_AMOUNT");
        uint256 wethAmount  = vm.envUint("WETH_AMOUNT");
        bool wrapEth = vm.envOr("WRAP_ETH", false);

        address wsxmr = PoolConfig.WSXMR;
        address weth  = PoolConfig.WETH;
        address npm   = PoolConfig.NPM;

        console.log("=== Fund wsXMR/WETH pool ===");
        console.log("Pool:", PoolConfig.WSXMR_WETH_POOL);
        console.log("LP  :", me);
        console.log("wsXMR to add:", wsxmrAmount);
        console.log("WETH  to add:", wethAmount);
        console.log("wsXMR balance:", IERC20(wsxmr).balanceOf(me));
        console.log("WETH  balance:", IERC20(weth).balanceOf(me));

        require(IERC20(wsxmr).balanceOf(me) >= wsxmrAmount, "Insufficient wsXMR");

        vm.startBroadcast(key);

        // Optionally top up WETH from native ETH so the LP only needs to hold ETH.
        uint256 wethBal = IERC20(weth).balanceOf(me);
        if (wethBal < wethAmount) {
            require(wrapEth, "Insufficient WETH (set WRAP_ETH=true to wrap native ETH)");
            IWETH9(weth).deposit{value: wethAmount - wethBal}();
        }

        IERC20(weth).approve(npm, wethAmount);
        IERC20(wsxmr).approve(npm, wsxmrAmount);

        // Full-range position so it never falls out of range. amount*Min=0 — the pool pulls
        // each token in its current ratio (leftover dust stays in the LP's wallet).
        (uint256 tokenId, uint128 liquidity, uint256 a0, uint256 a1) =
            INonfungiblePositionManager(npm).mint(INonfungiblePositionManager.MintParams({
                token0: weth,
                token1: wsxmr,
                fee: PoolConfig.WSXMR_WETH_FEE,
                tickLower: PoolConfig.FULL_RANGE_TICK_LOWER,
                tickUpper: PoolConfig.FULL_RANGE_TICK_UPPER,
                amount0Desired: wethAmount,
                amount1Desired: wsxmrAmount,
                amount0Min: 0,
                amount1Min: 0,
                recipient: me,
                deadline: block.timestamp + 3600
            }));

        vm.stopBroadcast();

        console.log("=== SUCCESS ===");
        console.log("Position tokenId:", tokenId);
        console.log("Liquidity added:", liquidity);
        console.log("WETH  used:", a0);
        console.log("wsXMR used:", a1);
        console.log("Pool wsXMR reserve:", IERC20(wsxmr).balanceOf(PoolConfig.WSXMR_WETH_POOL));
        console.log("Pool WETH  reserve:", IERC20(weth).balanceOf(PoolConfig.WSXMR_WETH_POOL));
    }
}
