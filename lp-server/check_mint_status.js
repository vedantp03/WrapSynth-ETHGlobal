import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://base-sepolia.blockscout.com/api/eth-rpc';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function getMintRequest(bytes32 requestId) external view returns (tuple(address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 vaultMintNonce, uint256 lpBond, uint256 status))',
], provider);

const requestId = '0x4029f526ad9f7768bd3954e00dc2d5cdd7dd14ba1137d958ec65a80a2873290a';
const request = await hub.getMintRequest(requestId);
console.log('Mint Request Status:');
console.log('  Status:', request.status.toString());
console.log('  LP Vault:', request.lpVault);
console.log('  Timeout:', request.timeout.toString());
console.log('  Current Block:', await provider.getBlockNumber());
