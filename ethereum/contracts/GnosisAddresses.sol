// SPDX-License-Identifier: LGPLv3
pragma solidity ^0.8.28;

/**
 * @title GnosisAddresses
 * @notice Gnosis Chain mainnet contract addresses
 * @dev Chainlink feed addresses must be configured for the target deployment chain.
 *      Gnosis Chain has limited Chainlink feeds; verify availability at docs.chain.link.
 */
library GnosisAddresses {
    // Base Sepolia WETH (real wrapped ETH)
    address public constant XDAI = 0x4200000000000000000000000000000000000006; // WETH
    address public constant SDAI = 0xd25f4095f623916074255FE4294f6b8B4DEf5f24; // MockSavingsDAI wrapping WETH

    // Uniswap V3 on Base Sepolia
    address public constant UNI_V3_FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address public constant UNI_V3_POSITION_MANAGER = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2;
    address public constant UNI_V3_SWAP_ROUTER_02 = 0x94cc0aaC535CCdb3cC7858eE06e4f6F8E9db13a7;
    address public constant UNI_V3_QUOTER_V2 = 0xC0816e52d6D6372098D1fC48F7b5c0942e0799bE;
    address public constant UNI_V3_TICK_LENS = 0x4D328952b5820DA806Bf31f3a94754B0c0e37C3C;
    address public constant UNI_V3_STAKER = address(0);
    address public constant UNI_V3_MULTICALL = address(0);
    
    // Backward compatibility alias
    address public constant UNISWAP_V3_ROUTER = UNI_V3_SWAP_ROUTER_02;

    // Chainlink Data Streams (Base Sepolia)
    address public constant VERIFIER_PROXY = 0x2ff561f946D3862B463dd38A8b53CfD881a9e294;
    bytes32 public constant XMR_USD_FEED_ID = 0x00035e3ddda6c0b6caaa19d64c2f9f93e7e76e72a443b7877c0c7b15773fce32;
    bytes32 public constant ETH_USD_FEED_ID = 0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782;
}
