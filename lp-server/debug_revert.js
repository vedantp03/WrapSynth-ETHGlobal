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
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
  'function getMintRequest(bytes32 requestId) external view returns (tuple(address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 vaultMintNonce, uint256 lpBond, uint256 status))',
], wallet);

const requestId = '0xaf98754b8aff9945aa1705fe95312ddc7ecc47ac8f19edcda0bb3209359d34c9';

console.log('Fetching mint request details...');
const request = await hub.getMintRequest(requestId);
console.log('LP Vault in request:', request.lpVault);
console.log('Server wallet:', wallet.address);
console.log('Match:', request.lpVault.toLowerCase() === wallet.address.toLowerCase());
console.log('Status:', request.status.toString());

if (request.lpVault.toLowerCase() !== wallet.address.toLowerCase()) {
  console.log('\n❌ PROBLEM: The mint request was created with LP vault', request.lpVault);
  console.log('   But the server wallet is', wallet.address);
  console.log('   The contract will reject provideLPKey with Unauthorized()');
  console.log('\n   The frontend needs to use the server address when calling initiateMint!');
}
