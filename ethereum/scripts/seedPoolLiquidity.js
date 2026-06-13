const ethers = require('ethers');

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function deposit() payable', 'function transfer(address,uint256) returns (bool)'];
const WSXMR_ABI = ['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)'];

const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const SDAI_ADDRESS = '0x57cA07e0443c7Dc720CAd8AF63D8a6bBeDabD202';
const WSXMR_ADDRESS = '0x500735b66b9968E9Fc7D6c6d1Ae6CcF19A6a238b';
const NFPM_ADDRESS = '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2';
const POOL_ADDRESS = '0x79cF96e0FA6aBE3cF02994B35c68A69359857Ae9';

const NFPM_ABI = [
    'function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
    'function burn(uint256 tokenId) external payable',
];

const POOL_ABI = [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() external view returns (uint128)',
];

const TICK_SPACING = 60; // 0.3% fee tier

function nearestTick(tick, spacing) {
    return Math.floor(tick / spacing) * spacing;
}

function tickToPrice(tick) {
    return 1.0001 ** tick;
}

async function main() {
    console.log('Wallet:', wallet.address);

    const sdai = new ethers.Contract(SDAI_ADDRESS, ERC20_ABI, wallet);
    const wsxmr = new ethers.Contract(WSXMR_ADDRESS, WSXMR_ABI, wallet);
    const nfpm = new ethers.Contract(NFPM_ADDRESS, NFPM_ABI, wallet);
    const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

    const slot0 = await pool.slot0();
    const currentTick = slot0.tick;
    console.log('Current tick:', currentTick);
    console.log('Current liquidity:', (await pool.liquidity()).toString());

    // Price range: ±20% around current price
    const lowerTick = nearestTick(currentTick - 2000, TICK_SPACING);
    const upperTick = nearestTick(currentTick + 2000, TICK_SPACING);
    console.log('Range:', lowerTick, 'to', upperTick);

    const sdaiAmount = ethers.utils.parseEther('0.05');
    const wsxmrAmount = ethers.utils.parseUnits('0.05', 8); // 0.05 wsXMR

    // We need to get sDAI somehow - wrap ETH to wxDAI then maybe swap? 
    // For now, just check balance
    const sdaiBalance = await sdai.balanceOf(wallet.address);
    if (sdaiBalance.lt(sdaiAmount)) {
        console.log('Need sDAI balance, have', ethers.utils.formatEther(sdaiBalance));
        console.log('Exiting - get sDAI first');
        process.exit(1);
    }

    console.log('Approving sDAI...');
    await (await sdai.approve(NFPM_ADDRESS, sdaiAmount)).wait();
    console.log('Approving wsXMR...');
    await (await wsxmr.approve(NFPM_ADDRESS, wsxmrAmount)).wait();

    const token0 = SDAI_ADDRESS.toLowerCase() < WSXMR_ADDRESS.toLowerCase() ? SDAI_ADDRESS : WSXMR_ADDRESS;
    const token1 = SDAI_ADDRESS.toLowerCase() < WSXMR_ADDRESS.toLowerCase() ? WSXMR_ADDRESS : SDAI_ADDRESS;
    const amount0Desired = token0 === SDAI_ADDRESS ? sdaiAmount : wsxmrAmount;
    const amount1Desired = token1 === SDAI_ADDRESS ? sdaiAmount : wsxmrAmount;

    console.log('Minting position...');
    const tx = await nfpm.mint({
        token0,
        token1,
        fee: 3000,
        tickLower: lowerTick,
        tickUpper: upperTick,
        amount0Desired,
        amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: wallet.address,
        deadline: Math.floor(Date.now() / 1000) + 600,
    }, { gasLimit: 1000000 });
    const receipt = await tx.wait();
    console.log('Minted! Tx:', tx.hash);
    console.log('Gas used:', receipt.gasUsed.toString());

    const mintEvent = receipt.events.find(e => e.event === 'IncreaseLiquidity');
    if (mintEvent) {
        console.log('Token ID:', mintEvent.args.tokenId.toString());
        console.log('Liquidity:', mintEvent.args.liquidity.toString());
    }

    const newLiquidity = await pool.liquidity();
    console.log('Pool liquidity after:', newLiquidity.toString());
}

main().catch(e => { console.error(e); process.exit(1); });
