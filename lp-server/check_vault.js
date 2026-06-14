import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://sepolia.base.org';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function getVault(address lpAddress) external view returns (tuple(address lpAddress, uint256 collateralShares, uint256 lockedCollateral, uint256 normalizedDebt, uint256 pendingDebt, uint16 maxMintBps, uint256 mintGriefingDeposit, uint256 mintReadyBond, uint16 mintFeeBps, uint16 burnRewardBps, uint256 liquidationNonce, uint256 mintNonce, uint256 minBurnAmount, bool active, uint256 deployedSDAIShares, uint16 maxCoLPRangeBps))',
  'function hasActiveVault(address lpAddress) external view returns (bool)',
], provider);

const userAddr = '0xDFdC570ec0586D5c00735a2277c21Dcc254B3917';
const serverAddr = '0x492c0b9F298cC49FE2644a2EBc6eA8dF848c72FB';

console.log('Checking user vault:', userAddr);
const hasUserVault = await hub.hasActiveVault(userAddr);
console.log('Has active vault:', hasUserVault);

if (hasUserVault) {
  const userVault = await hub.getVault(userAddr);
  console.log('User vault collateral:', ethers.formatEther(userVault.collateralShares), 'shares');
  console.log('User vault active:', userVault.active);
}

console.log('\nChecking server vault:', serverAddr);
const hasServerVault = await hub.hasActiveVault(serverAddr);
console.log('Has active vault:', hasServerVault);

if (hasServerVault) {
  const serverVault = await hub.getVault(serverAddr);
  console.log('Server vault collateral:', ethers.formatEther(serverVault.collateralShares), 'shares');
  console.log('Server vault active:', serverVault.active);
}
