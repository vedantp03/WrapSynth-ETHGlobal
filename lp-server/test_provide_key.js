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
], wallet);

// Use the latest mint request
const requestId = '0xaf98754b8aff9945aa1705fe95312ddc7ecc47ac8f19edcda0bb3209359d34c9';
const lpPublicSpendKey = '0x288275dd25712e178d14935077c15a8d85bc16f4a80ddf512f825266420daf1b';
const lpPublicViewKey = '0x4ff92063479f6401eaf448e837b8a8018d114f9f50d58141571047b60037f4ad';

console.log('Wallet:', wallet.address);
console.log('Calling provideLPKey...');
console.log('  requestId:', requestId);
console.log('  lpPublicSpendKey:', lpPublicSpendKey);
console.log('  lpPublicViewKey:', lpPublicViewKey);

try {
  const tx = await hub.provideLPKey(requestId, lpPublicSpendKey, lpPublicViewKey);
  console.log('\n✅ SUCCESS! Tx hash:', tx.hash);
  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('✅ Confirmed in block:', receipt.blockNumber);
} catch (e) {
  console.error('\n❌ FAILED:', e.message);
  console.error('Error code:', e.code);
  if (e.error) console.error('Inner error:', e.error.message);
}
