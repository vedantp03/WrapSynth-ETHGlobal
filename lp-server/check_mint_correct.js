import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://sepolia.base.org';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function getMintRequest(bytes32 requestId) external view returns (tuple(bytes32 requestId, address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 griefingDeposit, uint256 lpBond, uint256 normalizedDebtAmount, uint256 vaultMintNonce, uint8 status))',
], provider);

const requestId = '0x66d80d5de48d55d65bf9e24c881d2823d60014aa09e8f356afd75760015fbaf4';

console.log('Checking mint:', requestId);
const request = await hub.getMintRequest(requestId);
console.log('\nMint Request:');
console.log('  lpVault:', request.lpVault);
console.log('  initiator:', request.initiator);
console.log('  status:', request.status.toString());
