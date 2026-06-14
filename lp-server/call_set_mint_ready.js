import { ethers } from 'ethers';
import fs from 'fs';
import 'dotenv/config';

const RPC_URL = 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function setMintReady(bytes32 requestId) external payable',
  'function getVault(address lpAddress) external view returns (tuple(address lpAddress, uint256 collateralShares, uint256 lockedCollateral, uint256 normalizedDebt, uint256 pendingDebt, uint16 maxMintBps, uint256 mintGriefingDeposit, uint256 mintReadyBond, uint16 mintFeeBps, uint16 burnRewardBps, uint256 liquidationNonce, uint256 mintNonce, uint256 minBurnAmount, bool active, uint256 deployedSDAIShares, uint16 maxCoLPRangeBps))',
], wallet);

const requestId = '0x66d80d5de48d55d65bf9e24c881d2823d60014aa09e8f356afd75760015fbaf4';

console.log('Getting vault bond requirement...');
const vault = await hub.getVault(wallet.address);
const bond = vault.mintReadyBond;
console.log('Bond required:', ethers.formatEther(bond), 'ETH');

console.log('\nCalling setMintReady...');
const tx = await hub.setMintReady(requestId, { value: bond });
console.log('✅ Transaction sent:', tx.hash);
console.log('Waiting for confirmation...');
const receipt = await tx.wait();
console.log('✅ Confirmed in block:', receipt.blockNumber);
