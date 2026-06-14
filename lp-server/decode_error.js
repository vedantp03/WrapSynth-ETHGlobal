import { ethers } from 'ethers';

const data = "0x24d552df5c378caa3659c5c29b2e6b5034aa4524b7e019332dd7f7faa9b8eac8ae8e638ea3ddb2d11e9f780ef379b098b3f593547a5bce1c0f57e7d9ee0862ad8f8384706a38db9062873aec8553da683651fb8778d2541a2ed5cb53ff64558f350c49c3";

const iface = new ethers.Interface([
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external'
]);

try {
  const decoded = iface.parseTransaction({ data });
  console.log('Function:', decoded.name);
  console.log('Args:');
  console.log('  requestId:', decoded.args[0]);
  console.log('  lpPublicSpendKey:', decoded.args[1]);
  console.log('  lpPublicViewKey:', decoded.args[2]);
} catch (e) {
  console.error('Decode failed:', e.message);
}
