import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import express from 'express';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PORT = process.env.PORT || 3001;
const POLL_INTERVAL_MS = 20000; // 20 seconds (reduced from 12 to avoid rate limits)

if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY required');
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync('../deployment.json', 'utf8'));
const HUB_ADDRESS = deployment.contracts.wsXmrHub;
const ED25519_HELPER_ADDRESS = deployment.externalContracts.Ed25519Helper;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const ed25519Helper = new ethers.Contract(ED25519_HELPER_ADDRESS, [
  'function computeCommitment(bytes32 secret) external view returns (bytes32)',
  'function scalarMultBase(uint256 scalar) external view returns (uint256 x, uint256 y)',
  'function compressPublicKey(uint256 px, uint256 py) external pure returns (uint256)'
], provider);

const hub = new ethers.Contract(HUB_ADDRESS, [
  // Mint events & functions
  'event MintInitiated(bytes32 indexed requestId, address indexed initiator, address indexed recipient, address lpVault, uint256 xmrAmount, uint256 wsxmrAmount, uint256 feeAmount, bytes32 claimCommitment, bytes32 userPublicKey, uint256 timeout)',
  'function provideLPKey(bytes32 requestId, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
  'function setMintReady(bytes32 requestId) external payable',
  'function getVault(address lpAddress) external view returns (tuple(address lpAddress, uint256 collateralShares, uint256 lockedCollateral, uint256 normalizedDebt, uint256 pendingDebt, uint16 maxMintBps, uint256 mintGriefingDeposit, uint256 mintReadyBond, uint16 mintFeeBps, uint16 burnRewardBps, uint256 liquidationNonce, uint256 mintNonce, uint256 minBurnAmount, bool active, uint256 deployedSDAIShares, uint16 maxCoLPRangeBps))',
  'function updateOraclePrices(bytes[] calldata updateData) external payable',
  // Burn events & functions
  'event BurnRequested(bytes32 indexed requestId, address indexed user, address indexed lpVault, uint256 wsxmrAmount, uint256 xmrAmount, uint256 rewardCollateral, bytes32 claimCommitment)',
  'event BurnCommitted(bytes32 indexed requestId, uint256 deadline)',
  'event BurnFinalized(bytes32 indexed requestId, bytes32 secret, uint256 rewardPaid)',
  'function proposeHash(bytes32 requestId, bytes32 secretHash, bytes32 lpPublicSpendKey, bytes32 lpPublicViewKey) external',
  'function finalizeBurn(bytes32 requestId, bytes32 secret) external',
], wallet);

// State tracking
const pendingBurns = new Map(); // requestId -> { secret, secretHash, keys, state }
const processedMints = new Set(); // Track processed mint requestIds to avoid duplicates

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

app.get('/burns', (_req, res) => {
  const list = Array.from(pendingBurns.values());
  res.json({ burns: list, count: list.length });
});

console.log('=== WrapSynth LP Handler ===');
console.log('Wallet:', wallet.address);
console.log('Hub:', HUB_ADDRESS);
console.log('RPC:', RPC_URL);
console.log('');

// ========== MINT FUNCTIONS ==========

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
  
  // Step 3: Update oracle prices (required to avoid StalePrice error)
  console.log('  Step 3: Updating oracle prices...');
  try {
    const reportProxyUrl = process.env.REPORT_PROXY_URL || 'http://localhost:3001/reports';
    const xmrFeedId = '0x0003c70558bd921b1559d37b8e347797f121d1240e7386e68b2bee9b731b0833';
    const ethFeedId = '0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782';
    
    const response = await fetch(`${reportProxyUrl}?feedIDs=${xmrFeedId},${ethFeedId}`);
    const data = await response.json();
    
    if (data.reports && data.reports.length > 0) {
      const reportData = data.reports.map(r => r.fullReport);
      const updateTx = await hub.updateOraclePrices(reportData, { gasLimit: 500000 });
      await updateTx.wait();
      console.log('    ✅ Oracle prices updated');
    }
  } catch (e) {
    console.warn('    ⚠️  Could not update oracle prices:', e.message);
    console.log('    Continuing anyway - setMintReady may fail if prices are stale');
  }
  
  // Step 4: setMintReady
  console.log('  Step 4: Calling setMintReady...');
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

// ========== BURN FUNCTIONS ==========

function bytesToHex(bytes) {
  return '0x' + Buffer.from(bytes).toString('hex');
}

async function computeSecretHash(secretBytes) {
  const ed = await import('@noble/ed25519');
  const { createHash } = await import('crypto');
  
  if (!ed.etc.sha512Sync) {
    ed.etc.sha512Sync = (...m) => createHash('sha512').update(Buffer.concat(m)).digest();
  }
  
  const secretBigInt = BigInt('0x' + Buffer.from(secretBytes).toString('hex'));
  const ED25519_L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const secretReduced = secretBigInt % ED25519_L;
  const reducedBytes = Buffer.alloc(32);
  let tmp = secretReduced;
  for (let i = 0; i < 32; i++) {
    reducedBytes[31 - i] = Number(tmp & 0xffn);
    tmp = tmp >> 8n;
  }

  const publicKeyPoint = ed.ExtendedPoint.BASE.multiply(secretReduced);
  const publicKeyBytes = publicKeyPoint.toRawBytes();
  const publicKeyHex = bytesToHex(publicKeyBytes);

  const px = publicKeyHex.slice(0, 66);
  const py = '0x' + publicKeyHex.slice(66);

  const encoded = ethers.solidityPacked(['bytes32', 'bytes32'], [px, py]);
  const hash = ethers.keccak256(encoded);
  return { secretHash: hash, px, py };
}

async function processBurnPropose(requestId) {
  const reqId = ethers.hexlify(requestId);
  
  console.log(`\n[${new Date().toISOString()}] Processing burn ${reqId}`);
  
  // Generate secret using on-chain Ed25519Helper
  const secret = ethers.randomBytes(32);
  console.log('  Generated secret:', ethers.hexlify(secret));
  
  const secretHash = await ed25519Helper.computeCommitment(secret);
  console.log('  Computed secretHash:', secretHash);
  
  // Generate LP Ed25519 keys using on-chain helper
  // Generate spend key
  const lpSpendSecret = ethers.randomBytes(32);
  const [spendX, spendY] = await ed25519Helper.scalarMultBase(ethers.toBigInt(lpSpendSecret));
  const lpPublicSpendKey = ethers.zeroPadValue(ethers.toBeHex(await ed25519Helper.compressPublicKey(spendX, spendY)), 32);
  
  // Generate view key
  const lpViewSecret = ethers.randomBytes(32);
  const [viewX, viewY] = await ed25519Helper.scalarMultBase(ethers.toBigInt(lpViewSecret));
  const lpPublicViewKey = ethers.zeroPadValue(ethers.toBeHex(await ed25519Helper.compressPublicKey(viewX, viewY)), 32);
  
  console.log('  Generated LP keys (compressed)');
  console.log('    lpPublicSpendKey:', lpPublicSpendKey);
  console.log('    lpPublicViewKey:', lpPublicViewKey);
  
  // Validate all parameters before calling proposeHash
  if (!secretHash || secretHash === '0x' || secretHash.length !== 66) {
    throw new Error(`Invalid secretHash: ${secretHash}`);
  }
  if (!lpPublicSpendKey || lpPublicSpendKey === '0x' || lpPublicSpendKey.length !== 66) {
    throw new Error(`Invalid lpPublicSpendKey: ${lpPublicSpendKey}`);
  }
  if (!lpPublicViewKey || lpPublicViewKey === '0x' || lpPublicViewKey.length !== 66) {
    throw new Error(`Invalid lpPublicViewKey: ${lpPublicViewKey}`);
  }
  
  // Store for later finalization
  pendingBurns.set(reqId, {
    requestId: reqId,
    secret: ethers.hexlify(secret),
    secretHash,
    lpPublicSpendKey,
    lpPublicViewKey,
    state: 'proposing',
    createdAt: Date.now(),
  });
  
  // Call proposeHash
  console.log('  Calling proposeHash...');
  console.log('    requestId:', reqId);
  console.log('    secretHash:', secretHash);
  console.log('    lpPublicSpendKey:', lpPublicSpendKey);
  console.log('    lpPublicViewKey:', lpPublicViewKey);
  try {
    const tx = await hub.proposeHash(requestId, secretHash, lpPublicSpendKey, lpPublicViewKey);
    console.log('    Tx:', tx.hash);
    await tx.wait();
    console.log('    ✅ proposeHash confirmed');
    
    const burn = pendingBurns.get(reqId);
    burn.state = 'proposed';
    burn.proposeTxHash = tx.hash;
  } catch (e) {
    console.error('    ❌ proposeHash failed:', e.message);
    console.error('    Full error:', e);
    throw e;
  }
}

async function processBurnFinalize(requestId) {
  const reqId = ethers.hexlify(requestId);
  const burn = pendingBurns.get(reqId);
  
  if (!burn) {
    console.log(`  ⚠️  No burn data found for ${reqId}, skipping finalize`);
    return;
  }
  
  console.log(`\n[${new Date().toISOString()}] Finalizing burn ${reqId}`);
  
  console.log('  Calling finalizeBurn...');
  try {
    const tx = await hub.finalizeBurn(requestId, burn.secret);
    console.log('    Tx:', tx.hash);
    await tx.wait();
    console.log('    ✅ finalizeBurn confirmed');
    
    burn.state = 'finalized';
    burn.finalizeTxHash = tx.hash;
  } catch (e) {
    console.error('    ❌ finalizeBurn failed:', e.message);
    burn.error = e.message;
  }
}

// ========== MAIN EVENT LOOP ==========

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
      
      // Check for MintInitiated events
      const mintFilter = hub.filters.MintInitiated();
      const mintEvents = await hub.queryFilter(mintFilter, lastBlock + 1, currentBlock);
      
      for (const event of mintEvents) {
        const { requestId, lpVault, initiator, xmrAmount } = event.args;
        const reqId = ethers.hexlify(requestId);
        
        // Check if already processed
        if (processedMints.has(reqId)) {
          console.log(`\n📥 MintInitiated ${reqId} - already processed, skipping`);
          continue;
        }
        
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
        
        // Mark as processed immediately to prevent duplicate processing
        processedMints.add(reqId);
        
        try {
          const keys = await generateEd25519Keys();
          console.log(`  Generated keys:`);
          console.log(`    Spend: ${keys.lpPublicSpendKey}`);
          console.log(`    View: ${keys.lpPublicViewKey}`);
          
          await processMint(requestId, keys.lpPublicSpendKey, keys.lpPublicViewKey);
        } catch (err) {
          console.error(`  ❌ Processing failed:`, err.message);
          // Remove from processed set if it failed, so it can be retried manually if needed
          processedMints.delete(reqId);
        }
      }
      
      // Check for BurnRequested events
      const burnFilter = hub.filters.BurnRequested();
      const burnEvents = await hub.queryFilter(burnFilter, lastBlock + 1, currentBlock);
      
      for (const event of burnEvents) {
        const { requestId, user, lpVault, wsxmrAmount, xmrAmount } = event.args;
        const reqId = ethers.hexlify(requestId);
        
        console.log(`\n🔥 BurnRequested detected!`);
        console.log(`  RequestId: ${reqId}`);
        console.log(`  LP Vault: ${lpVault}`);
        console.log(`  User: ${user}`);
        console.log(`  wsXMR Amount: ${wsxmrAmount.toString()}`);
        
        if (lpVault.toLowerCase() !== wallet.address.toLowerCase()) {
          console.log(`  ⏭️  Not our vault, skipping`);
          continue;
        }
        
        console.log(`  ✅ This is our vault! Processing...`);
        
        try {
          await processBurnPropose(requestId);
        } catch (err) {
          console.error(`  ❌ Processing failed:`, err.message);
        }
      }
      
      // Check for BurnCommitted events
      const committedFilter = hub.filters.BurnCommitted();
      const committedEvents = await hub.queryFilter(committedFilter, lastBlock + 1, currentBlock);
      
      for (const event of committedEvents) {
        const { requestId } = event.args;
        const reqId = ethers.hexlify(requestId);
        
        console.log(`\n✅ BurnCommitted detected: ${reqId}`);
        
        try {
          await processBurnFinalize(requestId);
        } catch (err) {
          console.error(`  ❌ Finalize failed:`, err.message);
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
