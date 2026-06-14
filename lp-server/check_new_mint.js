import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://sepolia.base.org';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function getMintRequest(bytes32 requestId) external view returns (tuple(address initiator, address recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout, uint256 vaultMintNonce, uint256 lpBond, uint256 status))',
], provider);

const requestId = '0xaf98754b8aff9945aa1705fe95312ddc7ecc47ac8f19edcda0bb3209359d34c9';
const request = await hub.getMintRequest(requestId);
console.log('New Mint Request:');
console.log('  LP Vault:', request.lpVault);
console.log('  Status:', request.status.toString());
console.log('  Initiator:', request.initiator);
console.log('\nExpected LP Server:', '0x492c0b9F298cC49FE2644a2EBc6eA8dF848c72FB');
console.log('Match:', request.lpVault.toLowerCase() === '0x492c0b9F298cC49FE2644a2EBc6eA8dF848c72FB'.toLowerCase());
