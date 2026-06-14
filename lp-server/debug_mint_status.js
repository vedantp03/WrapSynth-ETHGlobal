import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://sepolia.base.org';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function getMintRequest(bytes32 requestId) external view returns (tuple(address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 vaultMintNonce, uint256 lpBond, uint256 status))',
  'function lpPublicKeys(bytes32 requestId) external view returns (bytes32)',
], provider);

const requestId = '0x9d6cf824bdb7eecd9dc3d32e943fdc41e246ceceea7740c172f3f3139a6477d3';

console.log('Checking mint request:', requestId);
const request = await hub.getMintRequest(requestId);
console.log('\nMint Request:');
console.log('  Status:', request.status.toString(), '(0=PENDING, 1=KEY_PROVIDED, 2=READY, 3=FINALIZED)');
console.log('  LP Vault:', request.lpVault);
console.log('  Initiator:', request.initiator);
console.log('  Timeout:', request.timeout.toString());
console.log('  Current block:', await provider.getBlockNumber());

const existingKey = await hub.lpPublicKeys(requestId);
console.log('  Existing LP key:', existingKey);

if (existingKey !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
  console.log('\n❌ PROBLEM: LP key already provided!');
  console.log('   The contract rejects duplicate provideLPKey calls.');
}

if (request.status.toString() !== '0') {
  console.log('\n❌ PROBLEM: Status is not PENDING (0)');
  console.log('   provideLPKey requires status to be PENDING');
}
