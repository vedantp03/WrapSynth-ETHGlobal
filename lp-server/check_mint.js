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
  'function getMintRequest(bytes32 requestId) external view returns (tuple(address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 vaultMintNonce, uint256 lpBond, uint256 status))',
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
], wallet);

const requestId = '0x66d80d5de48d55d65bf9e24c881d2823d60014aa09e8f356afd75760015fbaf4';
const lpPublicSpendKey = '0x9dcbb5a825a669e8617036e3a23a4a14ffd51b71bdd81dc653c865b63314fa48';
const lpPublicViewKey = '0x4d51269af13ede558d05e401568b915207a237815053ccec943b8fcd17a02da9';

console.log('Checking mint:', requestId);
const request = await hub.getMintRequest(requestId);
console.log('Status:', request.status.toString());
console.log('LP Vault:', request.lpVault);
console.log('Server wallet:', wallet.address);
console.log('Match:', request.lpVault.toLowerCase() === wallet.address.toLowerCase());

console.log('\nAttempting to call provideLPKey with static call...');
try {
  await hub.provideLPKey.staticCall(requestId, lpPublicSpendKey, lpPublicViewKey);
  console.log('✅ Static call succeeded - transaction should work');
} catch (e) {
  console.error('❌ Static call failed:', e.shortMessage || e.message);
  
  // Try to decode the error
  if (e.data) {
    console.log('Error data:', e.data);
  }
}
