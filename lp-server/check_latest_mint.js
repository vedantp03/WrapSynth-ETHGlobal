import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://sepolia.base.org';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'event MintInitiated(bytes32 indexed requestId, address indexed initiator, address indexed recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout)',
], provider);

const currentBlock = await provider.getBlockNumber();
console.log('Current block:', currentBlock);
console.log('Server listening from block: 42815768');
console.log('\nSearching for recent MintInitiated events...');

const filter = hub.filters.MintInitiated();
const events = await hub.queryFilter(filter, currentBlock - 100, currentBlock);

console.log(`Found ${events.length} events in last 100 blocks:`);
for (const event of events.slice(-3)) {
  console.log('\n  Block:', event.blockNumber);
  console.log('  RequestId:', ethers.hexlify(event.args.requestId));
  console.log('  LP Vault:', event.args.lpVault);
  console.log('  Initiator:', event.args.initiator);
}
