// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {INonfungiblePositionManager} from "../contracts/interfaces/external/INonfungiblePositionManager.sol";

interface IWETH9 {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC20Min {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface INPMCreate {
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
}

/**
 * @title CreateWsxmrWethPool
 * @notice Creates + initializes + seeds a wsXMR/WETH Uniswap V3 pool on Base Sepolia
 *         so the app's Swap tab can trade the real bridge token (wsXMR) for ETH.
 *
 *         Pool is initialized at 1 wsXMR = 0.21 ETH (= deposit ratio), full-range.
 *         Must be run by the wallet that holds the wsXMR to seed.
 */
contract CreateWsxmrWethPool is Script {
    // Base Sepolia (verified)
    address constant WSXMR = 0x81AaB8b92b38d0ab60B99b4aF12edaEE92b9C0C4; // 8 decimals
    address constant WETH = 0x4200000000000000000000000000000000000006; // 18 decimals
    address constant NPM = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2; // NonfungiblePositionManager
    uint24 constant FEE = 3000; // 0.3%, tick spacing 60

    // Full range for tick spacing 60 (nearest usable multiples of 60 to +/-887272)
    int24 constant TICK_LOWER = -887220;
    int24 constant TICK_UPPER = 887220;

    // token0 = WETH (0x4200... < 0x81Aa...), token1 = wsXMR
    // Defaults: 0.0015 wsXMR  <->  0.000315 WETH  =>  1 wsXMR = 0.21 ETH
    uint256 constant DEFAULT_WSXMR_AMOUNT = 150000;        // 0.0015 * 1e8 (token1)
    uint256 constant DEFAULT_WETH_AMOUNT = 315000000000000; // 0.000315 * 1e18 (token0)

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        uint256 wsxmrAmount = vm.envOr("WSXMR_AMOUNT", DEFAULT_WSXMR_AMOUNT);
        uint256 wethAmount = vm.envOr("WETH_AMOUNT", DEFAULT_WETH_AMOUNT);

        // token0 < token1 by address: WETH < wsXMR
        address token0 = WETH;
        address token1 = WSXMR;
        uint256 reserve0 = wethAmount;  // token0 reserve
        uint256 reserve1 = wsxmrAmount; // token1 reserve

        uint160 sqrtPriceX96 = _sqrtPriceX96(reserve1, reserve0);

        console.log("=== Create wsXMR/WETH Uniswap V3 pool (Base Sepolia) ===");
        console.log("Deployer:", deployer);
        console.log("wsXMR balance:", IERC20Min(WSXMR).balanceOf(deployer));
        console.log("wsXMR to seed (8 dec):", wsxmrAmount);
        console.log("WETH to seed (18 dec):", wethAmount);
        console.log("sqrtPriceX96:", sqrtPriceX96);
        require(IERC20Min(WSXMR).balanceOf(deployer) >= wsxmrAmount, "insufficient wsXMR");

        vm.startBroadcast(deployerKey);

        // Wrap ETH -> WETH so the wallet only needs native ETH
        IWETH9(WETH).deposit{value: wethAmount}();

        // Create + initialize pool (no-op if it already exists/initialized)
        address pool = INPMCreate(NPM).createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96);
        console.log("Pool:", pool);

        // Approve NPM to pull both tokens
        IWETH9(WETH).approve(NPM, wethAmount);
        IERC20Min(WSXMR).approve(NPM, wsxmrAmount);

        // Mint full-range position
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: FEE,
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            amount0Desired: wethAmount,
            amount1Desired: wsxmrAmount,
            amount0Min: 0,
            amount1Min: 0,
            recipient: deployer,
            deadline: block.timestamp + 1200
        });
        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) =
            INonfungiblePositionManager(NPM).mint(params);

        vm.stopBroadcast();

        console.log("=== SUCCESS ===");
        console.log("Position tokenId:", tokenId);
        console.log("Liquidity:", liquidity);
        console.log("WETH used:", amount0);
        console.log("wsXMR used:", amount1);
        console.log("Pool:", pool);
    }

    /// @dev sqrtPriceX96 = sqrt(reserve1/reserve0) * 2^96 = sqrt((reserve1 << 192) / reserve0)
    function _sqrtPriceX96(uint256 reserve1, uint256 reserve0) internal pure returns (uint160) {
        require(reserve0 > 0, "reserve0=0");
        uint256 ratioX192 = (reserve1 << 192) / reserve0;
        return uint160(_sqrt(ratioX192));
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
