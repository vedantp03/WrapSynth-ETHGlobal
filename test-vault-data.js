// Quick test to read vault data directly from chain
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org')
});

const hubAddress = '0x0454983E17b803a2C6ff0d98d5D58676525F4A92';
const vaultAddress = '0x492c0b9F298cC49FE2644a2EBc6eA8dF848c72FB';

// Full ABI with all 18 fields - use raw ABI format
const getVaultAbi = [{
    inputs: [{ name: 'lpAddress', type: 'address' }],
    name: 'getVault',
    outputs: [{
        components: [
            { name: 'lpAddress', type: 'address' },
            { name: 'collateralShares', type: 'uint256' },
            { name: 'lockedCollateral', type: 'uint256' },
            { name: 'normalizedDebt', type: 'uint256' },
            { name: 'pendingDebt', type: 'uint256' },
            { name: 'maxMintBps', type: 'uint16' },
            { name: 'mintGriefingDeposit', type: 'uint256' },
            { name: 'mintReadyBond', type: 'uint256' },
            { name: 'mintFeeBps', type: 'uint16' },
            { name: 'burnRewardBps', type: 'uint16' },
            { name: 'liquidationNonce', type: 'uint256' },
            { name: 'mintNonce', type: 'uint256' },
            { name: 'minBurnAmount', type: 'uint256' },
            { name: 'active', type: 'bool' },
            { name: 'deployedCollateralShares', type: 'uint256' },
            { name: 'maxCoLPRangeBps', type: 'uint16' },
            { name: 'mintTimeoutBlocks', type: 'uint256' },
            { name: 'burnTimeoutBlocks', type: 'uint256' }
        ],
        name: '',
        type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
}];

async function testVaultData() {
    try {
        const vaultData = await publicClient.readContract({
            address: hubAddress,
            abi: getVaultAbi,
            functionName: 'getVault',
            args: [vaultAddress]
        });

        console.log('\n=== RAW VAULT DATA ===');
        console.log('Full tuple:', vaultData);
        console.log('\n=== INDIVIDUAL FIELDS ===');
        console.log('lpAddress:', vaultData[0]);
        console.log('collateralShares:', vaultData[1].toString());
        console.log('lockedCollateral:', vaultData[2].toString());
        console.log('normalizedDebt:', vaultData[3].toString());
        console.log('pendingDebt:', vaultData[4].toString());
        console.log('maxMintBps:', vaultData[5]);
        console.log('mintGriefingDeposit:', vaultData[6].toString());
        console.log('mintReadyBond:', vaultData[7].toString());
        console.log('mintFeeBps:', vaultData[8]);
        console.log('burnRewardBps:', vaultData[9]);
        console.log('liquidationNonce:', vaultData[10].toString());
        console.log('mintNonce:', vaultData[11].toString());
        console.log('minBurnAmount:', vaultData[12].toString());
        console.log('active:', vaultData[13]);
        console.log('deployedCollateralShares (index 14):', vaultData[14].toString());
        console.log('maxCoLPRangeBps:', vaultData[15]);
        console.log('mintTimeoutBlocks:', vaultData[16].toString());
        console.log('burnTimeoutBlocks:', vaultData[17].toString());
        
        console.log('\n=== CONVERTED VALUES ===');
        console.log('deployedCollateralShares in ETH:', Number(vaultData[14]) / 1e18);
        console.log('collateralShares in ETH:', Number(vaultData[1]) / 1e18);
        
    } catch (error) {
        console.error('Error reading vault data:', error);
    }
}

testVaultData();
