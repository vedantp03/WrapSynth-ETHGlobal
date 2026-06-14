import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://sepolia.base.org';
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'event MintInitiated(bytes32 indexed requestId, address indexed initiator, address indexed recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout)',
], provider);

const requestId = '0x66d80d5de48d55d65bf9e24c881d2823d60014aa09e8f356afd75760015fbaf4';

console.log('Looking for MintInitiated event for requestId:', requestId);

const filter = hub.filters.MintInitiated(requestId);
const events = await hub.queryFilter(filter, 42817100, 42817120);

if (events.length === 0) {
  console.log('No events found!');
} else {
  const event = events[0];
  console.log('\nEvent found in block:', event.blockNumber);
  console.log('Transaction:', event.transactionHash);
  console.log('\nEvent args:');
  console.log('  requestId:', ethers.hexlify(event.args.requestId));
  console.log('  initiator (indexed):', event.args.initiator);
  console.log('  recipient (indexed):', event.args.recipient);
  console.log('  lpVault (NOT indexed):', event.args.lpVault);
  console.log('  xmrAmount:', event.args.xmrAmount.toString());
}
