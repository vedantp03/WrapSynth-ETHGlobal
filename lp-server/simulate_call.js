import { ethers } from 'ethers';
import fs from 'fs';
import 'dotenv/config';

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const hub = new ethers.Contract(HUB_ADDRESS, [
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
  'function getMintRequest(bytes32 requestId) external view returns (tuple(address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 vaultMintNonce, uint256 lpBond, uint256 status))',
], wallet);

const requestId = '0x5c378caa3659c5c29b2e6b5034aa4524b7e019332dd7f7faa9b8eac8ae8e638e';
const lpPublicSpendKey = '0xa3ddb2d11e9f780ef379b098b3f593547a5bce1c0f57e7d9ee0862ad8f838470';
const lpPublicViewKey = '0x6a38db9062873aec8553da683651fb8778d2541a2ed5cb53ff64558f350c49c3';

console.log('Checking mint request state...');
const request = await hub.getMintRequest(requestId);
console.log('Status:', request.status.toString());
console.log('LP Vault:', request.lpVault);
console.log('Wallet:', wallet.address);
console.log('Match:', request.lpVault.toLowerCase() === wallet.address.toLowerCase());
console.log('Timeout:', request.timeout.toString());
console.log('Current block:', await provider.getBlockNumber());

console.log('\nAttempting provideLPKey...');
try {
  const tx = await hub.provideLPKey(requestId, lpPublicSpendKey, lpPublicViewKey);
  console.log('Success! Tx:', tx.hash);
} catch (e) {
  console.error('Error:', e.message);
  if (e.data) console.error('Data:', e.data);
  if (e.error) console.error('Inner error:', e.error);
}
