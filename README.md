# Ꝟ Vibecoin - Educational Blockchain Implementation

A fully functional blockchain and cryptocurrency implementation built with Node.js and TypeScript for educational purposes. This project demonstrates core blockchain concepts including proof-of-work mining, cryptographic signatures, Merkle trees, and economic incentive mechanisms.

## Features

### Core Blockchain Functionality

- **Proof-of-Work Mining** - Configurable difficulty with multi-threaded worker pool
- **Merkle Tree Implementation** - Efficient transaction verification
- **Digital Signatures** - ECDSA (secp256k1) transaction signing and verification
- **Chain Validation** - Complete integrity checking across all blocks
- **Genesis Block** - Automated initial supply distribution

### Transaction System

- **Dual-Fee Model** - Fixed fee + percentage-based fee
- **Transaction Pool** - Pending transaction management with validation
- **Balance Tracking** - Real-time wallet balance calculation
- **Fee Distribution** - Separate reward and fee transactions for transparency

### Economic Mechanisms

- **Mining Rewards** - Configurable reward per transaction mined
- **Auto-Mining with Burn** - Automatic deflationary mechanism when pending pool reaches threshold
- **Voluntary Mining** - Miners can claim rewards by mining blocks before auto-mine triggers
- **Treasury System** - Initial supply managed through dedicated treasury wallet
- **Burn Address** - Deflationary token burning for unused mining rewards

### Advanced Features

- **Multi-threaded Mining** - Parallel nonce search using worker threads
- **Configurable Parameters** - All blockchain parameters adjustable via config
- **Transaction Types** - Genesis, Transaction, Reward, and Fee transactions clearly distinguished
- **Auto-Mine Delay** - Grace period for voluntary miners before auto-mining triggers

## Architecture

### Class Structure

```
Block
├── Data: Transaction[]
├── Merkle Root: Hash of all transactions
├── Previous Hash: Link to previous block
├── Nonce: Proof-of-work solution
├── Timestamp: Block creation time
└── Mining: Multi-threaded PoW solver

Blockchain
├── Blocks: Chain of validated blocks
├── Pending Pool: Unconfirmed transactions
├── Treasury: Genesis supply holder
├── Burn: Deflationary burn address
└── Auto-mine: Threshold-based mining

Transaction
├── From/To: Wallet addresses
├── Amount: Transfer value
├── Fee: Transaction cost
├── Signature: ECDSA signature
├── Type: Transaction classification
└── Verification: Signature validation

Wallet
├── Private Key: ECDSA secp256k1 key
├── Public Key/Address: Wallet identifier
├── Balance: Real-time tracking
└── Signing: Transaction authorization
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd vibecoin

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the blockchain
npm start
```

## Configuration

Edit `config.ts` to customize blockchain parameters:

```typescript
export default {
  // Currency
  CurrencyName: 'Vibecoin',
  CurrencyCode: 'VIBE',
  CurrencySymbol: 'Ꝟ',

  // Blockchain
  BlockchainDifficulty: 4, // PoW difficulty (leading zeros)
  MaxPendingTransactions: 10, // Auto-mine threshold
  AutoMineDelaySeconds: 30, // Grace period for miners
  GenesisCoinsAmount: 1000, // Initial supply

  // Economics
  RewardPerMinedTransaction: 0.1, // Mining reward per tx
  FixedTransactionFee: 0.05, // Fixed fee component
  DefaultFeePercentage: 0.01, // 1% variable fee

  // Mining
  BlockMinerPoolSize: 10, // Worker thread count
  MaxBlockNonce: 10_000_000, // Nonce range per worker
};
```

## Usage Examples

### Basic Transaction Flow

```typescript
import { Blockchain, Transaction, Wallet } from './classes';

// Initialize blockchain
const chain = new Blockchain({ difficulty: 4 });
await chain.init();

// Create wallets
const alice = new Wallet({ name: 'Alice' });
const bob = new Wallet({ name: 'Bob' });
const miner = new Wallet({ name: 'Miner' });

// Fund Alice from treasury
const fundingTx = new Transaction({
  from: chain.treasury,
  to: alice,
  amount: 100,
});
await chain.addTransaction(fundingTx);

// Mine the transaction (miner receives rewards)
await chain.minePendingTransactions(miner);

// Alice sends to Bob
const paymentTx = new Transaction({
  from: alice,
  to: bob,
  amount: 50,
});
await chain.addTransaction(paymentTx);

// Voluntary mining
await chain.minePendingTransactions(miner);
```

### Auto-Mining Mechanism

```typescript
// Add transactions up to threshold
for (let i = 0; i < 15; i++) {
  const tx = new Transaction({
    from: alice,
    to: bob,
    amount: 1,
  });
  await chain.addTransaction(tx);
}

// When threshold is reached (MaxPendingTransactions = 10):
// 1. Auto-mine timer starts (30 second delay)
// 2. Miners have grace period to claim rewards
// 3. If no miner acts, auto-mine burns rewards to deflate supply

// Miner can claim before auto-mine
await chain.minePendingTransactions(miner); // Cancels auto-mine
```

### Balance Checking

```typescript
// Get wallet balance
console.log(chain.getBalance(alice));

// Get total supply
console.log(chain.getTotalSupply());

// Get burned amount (deflation)
console.log(chain.getBurnedAmount());

// Get circulating supply
console.log(chain.getCirculatingSupply());
```

## Economic Model

### Fee Structure

Each transaction costs:

- **Fixed Fee**: 0.05 VIBE (configurable)
- **Variable Fee**: 1% of transaction amount (configurable)
- **Total Cost**: `amount + 0.05 + (amount × 0.01)`

Example:

```
Transfer 100 VIBE
├── Amount: 100 VIBE
├── Fixed Fee: 0.05 VIBE
├── Variable Fee: 1 VIBE (1%)
└── Total Cost: 101.05 VIBE
```

### Mining Rewards

Miners receive:

- **Transaction Rewards**: 0.1 VIBE per transaction (configurable)
- **Collected Fees**: All fees from transactions in block

### Deflationary Mechanism

When pending pool reaches threshold:

1. **Grace Period**: 30 seconds for voluntary miners
2. **Auto-Mining**: If no miner acts, block is mined automatically
3. **Burn**: Rewards and fees sent to burn address (removed from circulation)
4. **Effect**: Reduces total supply, increases scarcity

## Technical Details

### Proof-of-Work

The blockchain uses SHA-256 based proof-of-work:

- Miners search for nonce where `hash(block)` starts with N zeros
- Difficulty = number of leading zeros required
- Multi-threaded search with 10 worker threads
- Each worker searches different nonce range

### Digital Signatures

ECDSA with secp256k1 curve (same as Bitcoin):

- Private key signs transaction hash
- Public key verifies signature
- Prevents unauthorized transactions
- Ensures non-repudiation

### Merkle Tree

Transactions organized in binary hash tree:

- Leaf nodes: individual transaction hashes
- Internal nodes: hash of child hashes
- Root: single hash representing all transactions
- Enables efficient verification without full transaction data

### Transaction Types

- **Genesis (G)**: Initial supply creation
- **Transaction (T)**: Regular peer-to-peer transfer
- **Reward (R)**: Mining reward to block miner
- **Fees (F)**: Fee collection to block miner

## Development

### Project Structure

```
vibecoin/
├── classes/
│   ├── Block.ts           # Block implementation
│   ├── Blockchain.ts      # Main blockchain logic
│   ├── Transaction.ts     # Transaction handling
│   ├── Wallet.ts          # Wallet management
│   └── index.ts           # Exports
├── block-miner.worker.ts  # Mining worker thread
├── config.ts              # Configuration
├── utils.ts               # Helper functions
└── index.ts               # Entry point
```

### Debug Logging

Enable debug output:

```bash
# All logs
DEBUG=vibe:* npm start

# Specific components
DEBUG=vibe:chain npm start
DEBUG=vibe:block,vibe:tx npm start
```

### Testing

```typescript
// Validate blockchain integrity
const isValid = chain.validateIntegrity();
console.log(`Blockchain valid: ${isValid}`);

// Check specific block
const block = chain.blocks[1];
console.log(`Block valid: ${block.validate()}`);
```

## Performance

- **Block Mining Time**: ~1-10 seconds (difficulty 5, 10 threads)
- **Transaction Throughput**: Limited by mining time
- **Memory Usage**: O(n) where n = total transactions
- **Validation Time**: O(n) where n = number of blocks

## Limitations

- **Single Node**: No peer-to-peer networking
- **No Persistence**: Blockchain lost on restart
- **Limited Scalability**: All transactions in memory
- **Fixed Block Size**: No transaction limit per block
- **No Smart Contracts**: Simple value transfer only

## Future Enhancements

Potential additions for learning:

- [ ] Peer-to-peer networking
- [ ] Blockchain persistence (file storage)
- [ ] Dynamic difficulty adjustment
- [ ] Transaction history queries
- [ ] Mining statistics dashboard
- [ ] NFT support
- [ ] Smart contract system
- [ ] Consensus algorithms (PoS, etc.)

## Educational Purpose

This project is designed for learning blockchain fundamentals:

- ✅ Cryptographic concepts (hashing, signatures)
- ✅ Consensus mechanisms (proof-of-work)
- ✅ Economic incentives (mining, fees)
- ✅ Data structures (Merkle trees, linked lists)
- ✅ Distributed systems concepts
- ✅ Transaction validation
- ✅ Balance tracking without accounts

**Not for production use** - This is an educational implementation lacking many security features, optimizations, and hardening required for real cryptocurrency.

## License

MIT License - Free for educational use

## Acknowledgments

Built using core Node.js modules only:

- `crypto` - Hashing and signatures
- `worker_threads` - Parallel mining
- `assert` - Validation

Inspired by Bitcoin and Ethereum architectures.

---

**Ꝟ Vibecoin** - Learning blockchain by building it from scratch.
