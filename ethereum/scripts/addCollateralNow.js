#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');
const { execSync } = require('child_process');
const path = require('path');
const { HUB_ADDRESS, RPC_URL } = require('./deploymentConfig');

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const PROXY_DIR = path.join(__dirname, '../../frontend/report-proxy');
const XMR_FEED = '0x0003c70558bd921b1559d37b8e347797f121d1240e7386e68b2bee9b731b0833';
const ETH_FEED = '0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782';

function fetchReport(feedId) {
    const out = execSync(`node "${path.join(PROXY_DIR, 'fetchReportHex.js')}" ${feedId}`, {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });
    return out.trim();
}

async function main() {
    if (!process.env.PRIVATE_KEY) {
        console.error('PRIVATE_KEY not set');
        process.exit(1);
    }

    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log('💰 Adding Collateral to Vault');
    console.log('Wallet:', wallet.address);
    console.log('Hub:', HUB_ADDRESS);
    console.log('');

    const wethAbi = [
        'function deposit() external payable',
        'function approve(address,uint256) external returns (bool)',
        'function balanceOf(address) external view returns (uint256)'
    ];
    const hubAbi = [
        'function depositCollateral(uint256 amount) external',
        'function updateOraclePrices(bytes[] calldata updateData) external payable',
        'function getVault(address lpAddress) external view returns (tuple(address lpAddress, uint256 collateralShares, uint256 lockedCollateral, uint256 normalizedDebt, uint256 pendingDebt, uint16 maxMintBps, uint256 mintGriefingDeposit, uint256 mintReadyBond, uint16 mintFeeBps, uint16 burnRewardBps, uint256 liquidationNonce, uint256 mintNonce, uint256 minBurnAmount, bool active, uint256 deployedSDAIShares, uint16 maxCoLPRangeBps))',
        'function getVaultHealth(address) external view returns (uint256)'
    ];

    const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, wallet);
    const hub = new ethers.Contract(HUB_ADDRESS, hubAbi, wallet);

    // Check current vault status
    const vault = await hub.getVault(wallet.address);
    console.log('Current Vault:');
    console.log('  Collateral shares:', ethers.utils.formatEther(vault.collateralShares));
    console.log('  Locked collateral:', ethers.utils.formatEther(vault.lockedCollateral));
    console.log('  Normalized debt:', vault.normalizedDebt.toString());
    
    try {
        const health = await hub.getVaultHealth(wallet.address);
        console.log('  Health:', (health / 10).toFixed(1) + '%');
    } catch (e) {
        console.log('  Health: (unable to fetch)');
    }
    console.log('');

    // Step 1: Wrap ETH to wETH
    console.log('Step 1: Wrapping 0.005 ETH to wETH...');
    const wrapAmount = ethers.utils.parseEther('0.005');
    const wrapTx = await weth.deposit({ 
        value: wrapAmount,
        gasLimit: 100000
    });
    await wrapTx.wait();
    console.log('  Wrapped! TX:', wrapTx.hash);

    const balance = await weth.balanceOf(wallet.address);
    console.log('  wETH balance:', ethers.utils.formatEther(balance));
    console.log('');

    // Step 2: Update prices
    console.log('Step 2: Updating oracle prices...');
    const xmrReport = fetchReport(XMR_FEED);
    const ethReport = fetchReport(ETH_FEED);
    const priceTx = await hub.updateOraclePrices([xmrReport, ethReport], { gasLimit: 500000 });
    await priceTx.wait();
    console.log('  Prices updated:', priceTx.hash);
    console.log('');

    // Step 3: Approve wETH
    console.log('Step 3: Approving wETH...');
    const approveTx = await weth.approve(HUB_ADDRESS, balance, { gasLimit: 100000 });
    await approveTx.wait();
    console.log('  Approved!');
    console.log('');

    // Step 4: Deposit collateral
    console.log('Step 4: Depositing', ethers.utils.formatEther(balance), 'wETH...');
    const depositTx = await hub.depositCollateral(balance, { gasLimit: 300000 });
    await depositTx.wait();
    console.log('  Deposited! TX:', depositTx.hash);
    console.log('');

    // Check updated vault
    const updatedVault = await hub.getVault(wallet.address);
    console.log('Updated Vault:');
    console.log('  Collateral shares:', ethers.utils.formatEther(updatedVault.collateralShares));
    console.log('  Locked collateral:', ethers.utils.formatEther(updatedVault.lockedCollateral));
    console.log('  Normalized debt:', updatedVault.normalizedDebt.toString());
    
    try {
        const newHealth = await hub.getVaultHealth(wallet.address);
        console.log('  Health:', (newHealth / 10).toFixed(1) + '%');
    } catch (e) {
        console.log('  Health: (unable to fetch)');
    }
    
    console.log('');
    console.log('✅ Collateral added successfully!');
}

main().catch(console.error);
