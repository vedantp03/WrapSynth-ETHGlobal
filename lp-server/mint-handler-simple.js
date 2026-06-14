import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import express from 'express';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PORT = process.env.PORT || 3001;
const POLL_INTERVAL_MS = 12000; // 12 seconds

if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY required');
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const hub = new ethers.Contract(HUB_ADDRESS, [
  'event MintInitiated(bytes32 indexed requestId, address indexed initiator, address indexed recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout)',
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
  'function setMintReady(bytes32 requestId) external payable',
  'function getVault(address lpAddress) external view returns (tuple(address lpAddress, uint256 collateralShares, uint256 lockedCollateral, uint256 normalizedDebt, uint256 pendingDebt, uint16 maxMintBps, uint256 mintGriefingDeposit, uint256 mintReadyBond, uint16 mintFeeBps, uint16 burnRewardBps, uint256 liquidationNonce, uint256 mintNonce, uint256 minBurnAmount, bool active, uint256 deployedSDAIShares, uint16 maxCoLPRangeBps))',
], wallet);

// Express app for /reports endpoint
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const PROXY_DIR = path.join(__dirname, '..', 'frontend', 'report-proxy');

function fetchReport(feedId) {
  const out = execSync(`node "${path.join(PROXY_DIR, 'fetchReportHex.js')}" ${feedId}`, {
    cwd: PROXY_DIR,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' }
  });
  return out.trim();
}

app.get('/reports', async (req, res) => {
  const feedIDs = (req.query.feedIDs || '').split(',').filter(Boolean);
  if (feedIDs.length === 0) {
    return res.status(400).json({ error: 'Missing feedIDs query parameter' });
  }

  try {
    const reports = await Promise.all(
      feedIDs.map(async (id) => {
        const fullReport = fetchReport(id);
        return { feedID: id, fullReport };
      })
    );
    res.json({ reports });
  } catch (e) {
    console.error('Report fetch failed:', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', wallet: wallet.address, hub: HUB_ADDRESS });
});

console.log('=== Simple Mint Handler ===');
console.log('Wallet:', wallet.address);
console.log('Hub:', HUB_ADDRESS);
console.log('RPC:', RPC_URL);
console.log('');

async function generateEd25519Keys() {
  const ed = await import('@noble/ed25519');
  const { createHash } = await import('crypto');
  
  if (!ed.etc.sha512Sync) {
    ed.etc.sha512Sync = (...m) => createHash('sha512').update(Buffer.concat(m)).digest();
  }
  
  const spendPriv = ed.utils.randomPrivateKey();
  const viewPriv = ed.utils.randomPrivateKey();
  const spendPub = await ed.getPublicKey(spendPriv);
  const viewPub = await ed.getPublicKey(viewPriv);
  
  return {
    lpPublicSpendKey: '0x' + Buffer.from(spendPub).toString('hex'),
    lpPublicViewKey: '0x' + Buffer.from(viewPub).toString('hex'),
  };
}

async function processMint(requestId, lpPublicSpendKey, lpPublicViewKey) {
  const reqId = ethers.hexlify(requestId);
  
  console.log(`\n[${new Date().toISOString()}] Processing mint ${reqId}`);
  
  // Step 1: provideLPKey
  console.log('  Step 1: Calling provideLPKey...');
  try {
    const tx1 = await hub.provideLPKey(requestId, lpPublicSpendKey, lpPublicViewKey);
    console.log('    Tx:', tx1.hash);
    await tx1.wait();
    console.log('    ✅ provideLPKey confirmed');
  } catch (e) {
    console.error('    ❌ provideLPKey failed:', e.message);
    throw e;
  }
  
  // Step 2: Wait 20 seconds
  console.log('  Step 2: Waiting 20 seconds...');
  await new Promise(r => setTimeout(r, 20000));
  
  // Step 3: setMintReady
  console.log('  Step 3: Calling setMintReady...');
  try {
    const vault = await hub.getVault(wallet.address);
    const bond = vault.mintReadyBond;
    console.log('    Bond required:', ethers.formatEther(bond), 'ETH');
    
    const tx2 = await hub.setMintReady(requestId, { value: bond });
    console.log('    Tx:', tx2.hash);
    await tx2.wait();
    console.log('    ✅ setMintReady confirmed');
  } catch (e) {
    console.error('    ❌ setMintReady failed:', e.message);
    throw e;
  }
  
  console.log('  ✅ Mint processing complete!');
}

async function main() {
  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`HTTP server listening on http://localhost:${PORT}\n`);
  });

  let lastBlock = await provider.getBlockNumber();
  console.log(`Starting from block ${lastBlock}\n`);
  
  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      
      if (currentBlock <= lastBlock) {
        return;
      }
      
      console.log(`[${new Date().toISOString()}] Checking blocks ${lastBlock + 1} to ${currentBlock}...`);
      
      const filter = hub.filters.MintInitiated();
      const events = await hub.queryFilter(filter, lastBlock + 1, currentBlock);
      
      for (const event of events) {
        const { requestId, lpVault, initiator, xmrAmount } = event.args;
        const reqId = ethers.hexlify(requestId);
        
        console.log(`\n📥 MintInitiated detected!`);
        console.log(`  RequestId: ${reqId}`);
        console.log(`  LP Vault: ${lpVault}`);
        console.log(`  Initiator: ${initiator}`);
        console.log(`  XMR Amount: ${xmrAmount.toString()}`);
        
        if (lpVault.toLowerCase() !== wallet.address.toLowerCase()) {
          console.log(`  ⏭️  Not our vault, skipping`);
          continue;
        }
        
        console.log(`  ✅ This is our vault! Processing...`);
        
        try {
          const keys = await generateEd25519Keys();
          console.log(`  Generated keys:`);
          console.log(`    Spend: ${keys.lpPublicSpendKey}`);
          console.log(`    View: ${keys.lpPublicViewKey}`);
          
          await processMint(requestId, keys.lpPublicSpendKey, keys.lpPublicViewKey);
        } catch (err) {
          console.error(`  ❌ Processing failed:`, err.message);
        }
      }
      
      lastBlock = currentBlock;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Poll error:`, err.message);
    }
  }, POLL_INTERVAL_MS);
  
  console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds...\n`);
}

main().catch(console.error);
