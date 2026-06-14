import { ethers } from 'ethers';
import fs from 'fs';
import 'dotenv/config';

// Try different RPC
const RPC_URL = 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const hub = new ethers.Contract(HUB_ADDRESS, [
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
], wallet);

const requestId = '0x66d80d5de48d55d65bf9e24c881d2823d60014aa09e8f356afd75760015fbaf4';
const lpPublicSpendKey = '0x9dcbb5a825a669e8617036e3a23a4a14ffd51b71bdd81dc653c865b63314fa48';
const lpPublicViewKey = '0x4d51269af13ede558d05e401568b915207a237815053ccec943b8fcd17a02da9';

console.log('Attempting provideLPKey...');
console.log('Request ID:', requestId);

try {
  const tx = await hub.provideLPKey(requestId, lpPublicSpendKey, lpPublicViewKey);
  console.log('✅ Transaction sent:', tx.hash);
  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('✅ Confirmed in block:', receipt.blockNumber);
} catch (e) {
  console.error('❌ Failed:', e.shortMessage || e.message);
  if (e.reason) console.error('Reason:', e.reason);
  if (e.code) console.error('Code:', e.code);
}
