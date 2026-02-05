<div align="center">

![Vibecoin logo](assets/vibecoin-full.png)

</div>

# Ꝟ Vibecoin - Educational Blockchain Implementation

Vibecoin is an advanced, educational blockchain and cryptocurrency implemented from scratch in TypeScript. It serves as a comprehensive demonstration of enterprise-grade blockchain architecture, featuring a modular, object-oriented design that supports multiple consensus algorithms and a rich smart contract ecosystem.

## Core Features

- **Switchable Consensus Models**: Seamlessly operates on Proof of Work (PoW), Proof of Stake (PoS), or Proof of Authority (PoA), allowing for a deep, comparative understanding of different consensus mechanisms.
- **Advanced Smart Contract System**: A powerful, JavaScript-based smart contract engine with automatic gas metering for all operations, including deeply nested storage access.
- **Standardized Token Contracts**: Includes built-in helpers for creating ERC-20 style fungible tokens and ERC-721 style non-fungible tokens (NFTs) with payable minting functions.
- **Robust Economic Model**: Features a dual-fee structure (fixed + percentage), mining/forging rewards, and deflationary mechanics through transaction fee burning.
- **Cryptographically Secure**: Utilizes industry-standard cryptographic primitives, including SHA-256 for hashing, ECDSA with the `secp256k1` curve for digital signatures, and Merkle Trees for efficient and secure transaction verification.
- **Professional Architecture**: Built with a clean, object-oriented design, a clear separation of concerns, and modern TypeScript features like path aliases for maximum maintainability and extensibility.

## Architecture & Concepts

### Consensus Mechanisms

The blockchain's architecture is designed around a `BaseBlockchain` class, allowing for different consensus models to be implemented as subclasses.

- **Proof of Work (PoW)**: The classic consensus model where miners compete to solve a computational puzzle (finding a nonce). The first to solve it gets to add the block and claim the reward. This implementation is multi-threaded for efficient nonce searching.
- **Proof of Stake (PoS)**: A more energy-efficient model where users "stake" their currency to become validators. A validator is chosen to forge the next block via a weighted random selection based on their stake size.
- **Proof of Authority (PoA)**: A reputation-based model used in private or consortium chains. A pre-approved set of authorities take turns creating blocks in a deterministic, round-robin schedule.

### Economic Model

The network is sustained by a carefully designed economic model that incentivizes participation and ensures security.

- **Dual-Fee System**: Standard transactions incur a small, fixed fee plus a percentage-based fee, providing a flexible cost structure.
- **Gas Metering**: All smart contract operations (function calls, storage reads/writes) consume "gas." This prevents infinite loops and compensates validators for computational work. Gas fees for failed transactions are still charged, creating a strong incentive for users to submit valid code.
- **Rewards**: The creator of a valid block (a miner in PoW, a validator in PoS/PoA) receives the block reward plus all transaction and gas fees from the transactions included in the block.

### Smart Contract System

Vibecoin includes a sophisticated smart contract engine built on modern JavaScript principles.

- **Automatic Gas Metering**: Using a recursive `Proxy` implementation, every read from and write to a contract's `storage` object—no matter how deeply nested—is automatically metered for gas.
- **State Management**: Contracts are stateful, but the system includes a robust snapshot-and-revert mechanism to ensure that failed transactions do not leave the contract in a corrupt state.
- **Standard Contracts**:
  - **ERC-20**: A helper for creating standard fungible tokens with functions like `transfer`, `approve`, and `transferFrom`. Supports both fixed-supply and mintable models.
  - **ERC-721**: A helper for creating NFTs with unique data, ownership tracking, and approval mechanisms. Includes support for payable `mint` functions.

## Getting Started

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd vibecoin

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Usage

The main `index.ts` file contains a comprehensive demonstration of the blockchain's features. To run it:

```bash
# Run the main demonstration script
npm start
```

## Usage Example

The following example demonstrates how to initialize a `ProofOfWork` chain, create wallets, and deploy and interact with a smart contract.

```typescript
import { Blockchain, Wallet } from '#classes';
import { Token } from '#contracts';
import config from '#config';

// 1. Initialize the desired blockchain implementation
const chain = new Blockchain.ProofOfWork({ difficulty: 5 });
await chain.init();

// 2. Create wallets
const alice = new Wallet({ name: 'Alice' });
const bob = new Wallet({ name: 'Bob' });
const miner = new Wallet({ name: 'Miner' });

// 3. Fund wallets from the faucet
await chain.addTransaction(new Transaction({ from: chain.faucet, to: alice, amount: 100 }));
await chain.addTransaction(new Transaction({ from: chain.faucet, to: bob, amount: 100 }));
await chain.createBlock(miner); // Mine the funding transactions

// 4. Deploy a mintable ERC-20 Token contract
const myToken = Token.createContract(alice, {
  name: 'MyToken',
  symbol: 'MTK',
  decimals: 8,
});
await chain.deployContract(myToken);
await chain.createBlock(miner);
console.log(`Deployed 'MyToken' contract, owned by Alice.`);

// 5. Alice, as the owner, mints new tokens
await chain.$(alice, myToken)('mint')(bob.address, 5000);
await chain.createBlock(miner);
console.log(`Alice minted 5000 MTK for Bob.`);

// 6. Check Bob's new token balance
const bobsBalance = myToken.views.balanceOf(bob.address);
console.log(`Bob's MyToken balance: ${bobsBalance}`); // 5000
```

## Limitations

- **Single Node**: No peer-to-peer networking. The entire simulation runs in a single process.
- **No Persistence**: The blockchain state is lost when the process exits. A database or file storage system would be required for persistence.
- **Limited Scalability**: All state (balances, contract storage) is held in memory, which is not scalable for a large, long-running chain.
- **Simple Contracts**: The JavaScript-based contract engine, while powerful, does not have the same security guarantees or formal verification capabilities as production systems like the EVM.
- **No Contract Upgradeability**: Deployed contracts are immutable.
- **No Inter-Contract Calls**: Contracts cannot call functions on other contracts.

## Future Enhancements

Potential additions for learning:

- [x] Payable contract functions
- [x] ERC-20 and ERC-721 style tokens
- [x] Multiple consensus algorithms (PoW, PoS, PoA)
- [ ] Inter-contract calls
- [ ] Contract events and logs
- [ ] Peer-to-peer networking (e.g., with libp2p)
- [ ] Blockchain persistence (e.g., with LevelDB)
- [ ] Dynamic difficulty adjustment for PoW
- [ ] Transaction history queries
- [ ] Advanced smart contract patterns (e.g., proxies)

## Educational Purpose

This project is designed for learning blockchain fundamentals by building them from the ground up.

- ✅ **Cryptographic Concepts**: Hashing (SHA-256), digital signatures (ECDSA), and data structures (Merkle Trees).
- ✅ **Consensus Mechanisms**: A practical, side-by-side implementation of Proof of Work, Proof of Stake, and Proof of Authority.
- ✅ **Economic Incentives**: A complete model for fees, rewards, deflation, and staking.
- ✅ **Smart Contract Execution**: A deep dive into gas metering, state management, and contract lifecycle.

**Not for production use** - This is an educational implementation lacking many security features, optimizations, and hardening required for a real-world cryptocurrency.

## License

MIT License - Free for educational use.

## Disclaimer

This `README.md` file was generated by an AI assistant to provide a comprehensive overview of the project. While it aims to be accurate, the underlying source code was written by a human developer and stands as the ground truth.

## Acknowledgments

Built using core Node.js modules only. Inspired by Bitcoin and Ethereum architectures.

---

**Ꝟ Vibecoin** - Learning blockchain by building it from scratch.
