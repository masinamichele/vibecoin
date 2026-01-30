![Vibecoin logo](assets/vibecoin-full.png)

# Ꝟ Vibecoin - Educational Blockchain Implementation

A fully functional blockchain and cryptocurrency implementation built with Node.js and TypeScript for educational purposes. This project demonstrates core blockchain concepts including proof-of-work mining, cryptographic signatures, Merkle trees, and economic incentive mechanisms.

## Features

### Core Blockchain Functionality

- **Proof-of-Work Mining** - Configurable difficulty with multithreaded worker pool
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

- **Smart Contracts** - JavaScript-based smart contracts with full gas metering
- **Payable Functions** - Contracts can receive and manage the native currency (VIBE).
- **ERC-20 Style Tokens** - Fungible token standard with `transfer`, `approve`, and `allowance`
- **NFTs (ERC-721 Style)** - Non-fungible token standard for unique, textual assets with payable minting.
- **Multithreaded Mining** - Parallel nonce search using worker threads
- **Gas System** - Complete gas tracking with storage read/write costs
- **Configurable Parameters** - All blockchain parameters adjustable via config
- **Transaction Types** - Genesis, Transaction, Reward, Fee, Contract Deploy, Contract Call, and Withdrawal.
- **Auto-Mine Delay** - Grace period for voluntary miners before auto-mining triggers
- **Deflationary Mechanics** - Deploy fees and unused mining rewards burned permanently

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
├── Contracts: Deployed smart contracts registry
├── Faucet: Genesis supply holder
├── Drain: Deflationary burn address
└── Auto-mine: Threshold-based mining

Transaction
├── From/To: Wallet or Contract
├── Amount: Transfer value
├── Fee: Transaction cost
├── Signature: ECDSA signature
├── Type: Transaction classification
├── Contract: Smart contract reference (if applicable)
├── Gas Limit/Used: Gas tracking for contract calls
└── Verification: Signature validation

Wallet
├── Private Key: ECDSA secp256k1 key
├── Public Key/Address: Wallet identifier
├── Balance: Real-time tracking
└── Signing: Transaction authorization

Contract
├── Storage: Persistent state data
├── Views: Read-only functions
├── Functions: Executable code
├── Gas Metering: Automatic usage tracking
├── Creator: Contract deployer
├── Address: Unique contract identifier
└── Initialization: One-time setup function
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
  BlockchainDifficulty: 5, // PoW difficulty (leading zeros)
  MaxPendingTransactions: 10, // Auto-mine threshold
  AutoMineDelaySeconds: 10, // Grace period for miners
  GenesisCoinsAmount: 1000, // Initial supply

  // Economics
  RewardPerMinedTransaction: 0.1, // Mining reward per tx
  FixedTransactionFee: 0.05, // Fixed fee component
  DefaultFeePercentage: 0.01, // 1% variable fee

  // Smart Contracts
  ContractDeployBaseFee: 1, // Base cost to deploy
  ContractDeployPerByteFee: 0.001, // Cost per byte of code
  GasPrice: 0.000001, // VIBE per gas unit
  DefaultGasLimit: 1_000_000, // Default gas limit
  MaxGasLimit: 10_000_000, // Maximum gas allowed
  GasCostContractCall: 21_000, // Base call cost
  GasCostStorageRead: 200, // Reading from storage
  GasCostStorageWrite: 5_000, // Writing to storage

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
const chain = new Blockchain({ difficulty: 5 });
await chain.init();

// Create wallets
const alice = new Wallet({ name: 'Alice' });
const bob = new Wallet({ name: 'Bob' });
const miner = new Wallet({ name: 'Miner' });

// Fund Alice from faucet
const fundingTx = new Transaction({
  from: chain.faucet,
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

### Smart Contract Deployment and Usage

```typescript
import { Contract } from './classes';
import { createContractCode } from './classes/Contract';

// Create a simple counter contract
const counter = new Contract({
  name: 'Counter',
  creator: alice,
  code: createContractCode({
    storage: { count: 0, owner: null },
    views: {
      getCount() {
        return this.storage.count;
      },
    },
    functions: {
      __init__() {
        this.storage.owner = this.msg.sender;
      },
      increment(amount = 1) {
        if (this.msg.sender !== this.storage.owner) {
          throw new Error('Only owner can increment');
        }
        this.storage.count += amount;
      },
    },
  }),
});

// Deploy contract (costs deploy fee)
await chain.deployContract(counter);
await chain.minePendingTransactions(miner);

// Call contract function (costs gas)
await chain.$(alice, counter)('increment')(5);
await chain.minePendingTransactions(miner);

// Read contract state (off-chain, free)
console.log(counter.views.getCount()); // 5
console.log(counter.getReadonlyStorageSnapshot()); // { count: 5, owner: '...' }
```

### ERC-20 Style Token Example

The project includes a contract helper for creating a fungible token.

```typescript
import TokenContract from './contracts/Token.contract';

// 1. Create the token contract definition
const MyToken = TokenContract.createContract(alice, {
  name: 'MyToken',
  symbol: 'MYT',
  decimals: 8,
  totalSupply: 1_000_000,
});

// 2. Deploy the contract
await chain.deployContract(MyToken);
await chain.minePendingTransactions(miner);

// Alice now owns the total supply. Let's check her balance.
// Views are read-only functions that don't cost gas for off-chain reads.
console.log(MyToken.views.balanceOf(alice.address)); // 1,000,000

// 3. Alice transfers tokens to Bob
await chain.$(alice, MyToken)('transfer')(bob.address, 5000);
await chain.minePendingTransactions(miner);
console.log(MyToken.views.balanceOf(bob.address)); // 5000

// 4. Bob approves Alice to spend his tokens
await chain.$(bob, MyToken)('approve')(alice.address, 1000);
await chain.minePendingTransactions(miner);
console.log(MyToken.views.allowance(bob.address, alice.address)); // 1000

// 5. Alice transfers tokens from Bob to the miner
await chain.$(alice, MyToken)('transferFrom')(bob.address, miner.address, 500);
await chain.minePendingTransactions(miner);

console.log(MyToken.views.balanceOf(miner.address)); // 500
console.log(MyToken.views.allowance(bob.address, alice.address)); // 500
```

### NFT (ERC-721) Example with Payable Mint

This example shows how to create and manage unique, textual NFTs with a minting fee.

```typescript
import NftContract from './contracts/Nft.contract';

// 1. Create and deploy the NFT Collection
const myNfts = NftContract.createContract(alice, {
  name: 'My Textual NFTs',
  symbol: 'MTN',
});
await chain.deployContract(myNfts);
await chain.minePendingTransactions(eve);
console.log(`NFT Collection "${myNfts.views.name()}" deployed!`);

// 2. Mint the first NFT to Alice
await chain.$(alice, myNfts)('mint', { value: 10 })(alice.address, 'nft-001', 'Hello, this is my first NFT!');
await chain.minePendingTransactions(eve);
console.log(`Alice's NFT balance: ${myNfts.views.balanceOf(alice.address)}`);
console.log(`Owner of nft-001: ${myNfts.views.ownerOf('nft-001')}`);

// 3. Alice approves Bob to transfer nft-001
await chain.$(alice, myNfts)('approve')(bob.address, 'nft-001');
await chain.minePendingTransactions(eve);

// 4. Bob transfers the NFT from Alice to Charlie
await chain.$(bob, myNfts)('transferFrom')(alice.address, charlie.address, 'nft-001');
await chain.minePendingTransactions(eve);
console.log(`New owner of nft-001: ${myNfts.views.ownerOf('nft-001')}`);

// 5. Charlie approves Alice as an operator for all his assets
await chain.$(charlie, myNfts)('setApprovalForAll')(alice.address, true);
await chain.minePendingTransactions(eve);

// 6. Alice, as an operator, transfers the NFT back to Bob
await chain.$(alice, myNfts)('transferFrom')(charlie.address, bob.address, 'nft-001');
await chain.minePendingTransactions(eve);
console.log(`Final owner of nft-001: ${myNfts.views.ownerOf('nft-001')}`);
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
// 1. Auto-mine timer starts (10 second delay)
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

// Get drained/burned amount (deflation)
console.log(chain.getDrainedAmount());

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

### Smart Contract Costs

**Deployment:**

- **Base Fee**: 1 VIBE (burned to drain address)
- **Per-Byte Fee**: 0.001 VIBE per byte of code (burned to drain address)
- Larger contracts cost more to discourage spam

**Execution:**

- **Base Call Cost**: 21,000 gas
- **Storage Read**: 200 gas per operation
- **Storage Write**: 5,000 gas per operation
- **Gas Price**: 0.000001 VIBE per gas unit
- Gas costs go to the miner as fees

**NFT Minting:**

- **Mint Price**: A configurable price set on a per-collection basis.
- **Fee Forwarding**: The `mint` function is payable and automatically forwards the received VIBE to a designated `beneficiary` wallet.
- **Beneficiary Rule**: If the collection's beneficiary mints an NFT, the fee is sent to the `drain` address instead, ensuring a real economic cost and preventing exploits.

### Mining Rewards

Miners receive:

- **Transaction Rewards**: 0.1 VIBE per transaction (configurable)
- **Transaction Fees**: All fixed and variable fees from regular transactions
- **Gas Fees**: All gas costs from contract executions

### Deflationary Mechanism

When pending pool reaches threshold:

1. **Grace Period**: 10 seconds for voluntary miners
2. **Auto-Mining**: If no miner acts, block is mined automatically
3. **Burn**: Rewards and fees sent to drain address (removed from circulation)
4. **Contract Deploy Fees**: Always burned, never go to miners
5. **Beneficiary Mint Fees**: Fees from a collection's beneficiary minting their own NFTs are burned.
6. **Effect**: Reduces total supply, increases scarcity

## Smart Contracts

Vibecoin supports JavaScript-based smart contracts with automatic gas metering and state management.

### Contract Structure

```typescript
const myContract = new Contract({
  name: 'MyContract',
  creator: ownerWallet,
  code: createContractCode({
    storage: { value: 0, owner: null },
    views: {
      getValue() { return this.storage.value; }
    },

    // State-modifying functions
    functions: {
      __init__() { this.storage.owner = this.msg.sender; },
      setValue(newValue) {
        if (this.msg.sender !== this.storage.owner) throw new Error('Unauthorized');
        this.storage.value = newValue;
      },
    },
  }),
});
```

### Gas System

Every operation consumes gas:

- **Storage Read**: 200 gas per access
- **Storage Write**: 5,000 gas per modification
- **Base Call**: 21,000 gas per function invocation

Gas is tracked automatically using JavaScript Proxies. If a contract runs out of gas, execution reverts and the caller pays for gas consumed up to the limit.

### Contract Deployment

```typescript
// Deploy costs: base fee + per-byte fee
await chain.deployContract(myContract);
await chain.minePendingTransactions(miner);

// Deploy fee is burned (deflationary)
```

### Contract Execution

```typescript
// Call function (costs gas)
await chain.$(wallet, contract)('setValue', gasLimit)(42);
await chain.minePendingTransactions(miner);

// Gas fees go to the miner
```

### Reading Contract State

```typescript
// Off-chain read from a view is free and instant
const value = myContract.views.getValue();
console.log(value); // 42

// Reading from storage directly is also possible off-chain
const state = myContract.getReadonlyStorageSnapshot();
console.log(state); // { value: 42, owner: '0x...' }
```

### Context Variables

Inside contract functions:

- `this.storage` - Contract state (proxied for gas tracking)
- `this.views` - Access to read-only view functions
- `this.msg.sender` - Address of the caller

### Error Handling

```typescript
functions: {
  restrictedFunction() {
    if (this.msg.sender !== this.storage.owner) {
      throw new ChainError.OwnershipError('Not authorized');
    }
    // ... function logic
  }
}
```

Custom errors:

- `ChainError.OwnershipError` - Access control violations
- `ChainError.OutOfGasError` - Execution ran out of gas

## Technical Details

### Proof-of-Work

The blockchain uses SHA-256 based proof-of-work:

- Miners search for nonce where `hash(block)` starts with N zeros
- Difficulty = number of leading zeros required
- Multithreaded search with 10 worker threads
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
- **Fees (F)**: Fee collection to block miner (includes gas fees)
- **ContractDeploy (D)**: Smart contract deployment
- **ContractCall (C)**: Smart contract function execution

## Development

### Project Structure

```
vibecoin/
├── classes/
│   ├── Block.ts
│   ├── Blockchain.ts
│   ├── Transaction.ts
│   ├── Wallet.ts
│   ├── Contract.ts
│   └── index.ts
├── contracts/
│   ├── Token.contract.ts   # ERC-20 style token helper
│   └── Nft.contract.ts     # ERC-721 style NFT helper
├── block-miner.worker.ts
├── config.ts
├── utils.ts
└── index.ts
```

## Performance

- **Block Mining Time**: ~1-10 seconds (difficulty 5, 10 threads)
- **Transaction Throughput**: Limited by mining time
- **Contract Execution**: Gas-limited, depends on complexity
- **Memory Usage**: O(n) where n = total transactions + contract state
- **Validation Time**: O(n) where n = number of blocks

## Limitations

- **Single Node**: No peer-to-peer networking
- **No Persistence**: Blockchain lost on restart (can be added)
- **Limited Scalability**: All transactions and contracts in memory
- **Fixed Block Size**: No transaction limit per block
- **Simple Contracts**: JavaScript-based, not Turing-complete with safety guarantees
- **No Contract Upgradeability**: Deployed contracts are immutable
- **No Inter-Contract Calls**: Contracts cannot call other contracts (yet)

## Future Enhancements

Potential additions for learning:

- [ ] Inter-contract calls
- [ ] Contract events and logs
- [ ] Peer-to-peer networking
- [ ] Blockchain persistence (file storage)
- [ ] Dynamic difficulty adjustment
- [ ] Transaction history queries
- [ ] Mining statistics dashboard
- [ ] NFT support
- [ ] Advanced smart contract patterns
- [ ] Consensus algorithms (PoS, etc.)

## Educational Purpose

This project is designed for learning blockchain fundamentals:

- ✅ Cryptographic concepts (hashing, signatures)
- ✅ Consensus mechanisms (proof-of-work)
- ✅ Economic incentives (mining, fees, deflation)
- ✅ Data structures (Merkle trees, linked lists)
- ✅ Distributed systems concepts
- ✅ Transaction validation
- ✅ Balance tracking without accounts
- ✅ Smart contract execution and gas metering
- ✅ State management and storage costs

**Not for production use** - This is an educational implementation lacking many security features, optimizations, and hardening required for real cryptocurrency.

## License

MIT License - Free for educational use

## Disclaimer

This `README.md` file was generated by an AI assistant to provide a comprehensive overview of the project. While it aims to be accurate, the underlying source code was written by a human developer and stands as the ground truth.

## Acknowledgments

Built using core Node.js modules only:

- `crypto` - Hashing and signatures
- `worker_threads` - Parallel mining
- `assert` - Validation

Inspired by Bitcoin and Ethereum architectures.

---

**Ꝟ Vibecoin** - Learning blockchain by building it from scratch.
