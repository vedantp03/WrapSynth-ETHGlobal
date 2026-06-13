// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {wsXmrHub} from "../contracts/core/wsXmrHub.sol";
import {wsXMRLiquidityRouter} from "../contracts/router/wsXMRLiquidityRouter.sol";
import {IUniswapV3Factory} from "../contracts/interfaces/external/IUniswapV3Factory.sol";

/**
 * @title DeployCoLPRouter
 * @notice Deploys Co-LP liquidity router, creates Uniswap V3 pool, initializes it, and registers router on hub
 */
contract DeployCoLPRouter is Script {
    // New Base Sepolia deployment (WETH collateral)
    address constant HUB = 0x0454983E17b803a2C6ff0d98d5D58676525F4A92;
    address constant WSXMR = 0x81AaB8b92b38d0ab60B99b4aF12edaEE92b9C0C4;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant SDAI = 0xd25f4095f623916074255FE4294f6b8B4DEf5f24;
    address constant DEPLOYER = 0x492c0b9F298cC49FE2644a2EBc6eA8dF848c72FB;

    // Existing Base Sepolia Uniswap V3
    address constant UNI_V3_FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address constant UNI_V3_POSITION_MANAGER = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2;

    uint256 constant XMR_PRICE = 390 * 1e18;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        require(deployer == DEPLOYER, "Wrong private key");

        console.log("========================================");
        console.log("Deploying Co-LP Router on Base Sepolia");
        console.log("Deployer:", deployer);
        console.log("========================================");

        vm.startBroadcast(deployerKey);

        // Create pool if needed (sDAI/wsXMR - collateral vs wrapped XMR)
        address token0 = SDAI < WSXMR ? SDAI : WSXMR;
        address token1 = SDAI < WSXMR ? WSXMR : SDAI;
        address pool = IUniswapV3Factory(UNI_V3_FACTORY).getPool(token0, token1, 3000);

        if (pool == address(0)) {
            console.log("Creating Uniswap V3 pool...");
            pool = IUniswapV3Factory(UNI_V3_FACTORY).createPool(token0, token1, 3000);
            console.log("Pool created:", pool);
        } else {
            console.log("Pool exists:", pool);
        }

        // Deploy router first so we can use it to init the pool
        console.log("Deploying router...");
        wsXMRLiquidityRouter router = new wsXMRLiquidityRouter(
            HUB,
            UNI_V3_POSITION_MANAGER,
            SDAI,
            WSXMR,
            pool
        );
        console.log("Router:", address(router));

        // Initialize pool directly (router.initializePool is onlyDiamond)
        // SDAI is token0, WSXMR is token1
        // price = WSXMR/SDAI = (xmrPrice * 1e10) / collateralPrice
        (bool success, bytes memory data) = pool.call(abi.encodeWithSignature("slot0()"));
        if (success && data.length >= 32) {
            uint160 sqrtPriceX96 = abi.decode(data, (uint160));
            if (sqrtPriceX96 == 0) {
                console.log("Initializing pool...");
                // For token0=SDAI, token1=WSXMR:
                // price = WSXMR/SDAI = (xmrPrice * 1e10) / collateralPrice
                uint256 priceRatio = (XMR_PRICE * 1e10) / 1e18; // 390e10
                uint256 sqrtPrice = _sqrt(priceRatio);
                uint160 targetSqrtPriceX96 = uint160((sqrtPrice * (1 << 96)) / 1e5);
                (bool ok,) = pool.call(abi.encodeWithSignature("initialize(uint160)", targetSqrtPriceX96));
                require(ok, "Pool init failed");
                console.log("Pool initialized at $390 XMR");
            } else {
                console.log("Pool already initialized");
            }
        }

        // Register on hub (only deployer can do this)
        wsXmrHub(payable(HUB)).setLiquidityRouter(address(router));
        console.log("Router registered on hub");

        vm.stopBroadcast();

        console.log("========================================");
        console.log("Done! Check transactions on Basescan:");
        console.log("https://sepolia.basescan.org/address/", deployer);
        console.log("========================================");
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
