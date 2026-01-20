import { Block } from './Block';
import { Transaction, TransactionType } from './Transaction';
import { Wallet } from './Wallet';
import config from '../config';
import assert from 'node:assert/strict';
import { getDebug } from '../utils';
import { Contract } from './Contract';

const debug = getDebug('chain');

type BlockchainProperties = {
  difficulty: number;
};

export class Blockchain {
  readonly difficulty: number;
  private readonly blocks: Block[] = [];
  private pendingTransactionPool: Transaction[] = [];

  readonly faucet: Wallet;
  private readonly drain: Wallet;

  private initialized = false;

  private autoMineSchedule: any;
  private isMining = false;

  private readonly contracts = new Set<string>();

  constructor(properties: BlockchainProperties) {
    assert(properties.difficulty > 0, 'Difficulty must be a positive number');
    this.difficulty = properties.difficulty;
    debug(`Initializing ${config.CurrencyName} blockchain with difficulty ${this.difficulty}`);
    this.faucet = new Wallet({ name: config.FaucetName });
    this.drain = new Wallet({ name: config.DrainName });
  }

  async init() {
    debug('Generating genesis block');
    const genesis = await this.generateGenesisBlock();
    this.blocks.push(genesis);
    this.initialized = true;
    debug('Blockchain initialized');
  }

  private async generateGenesisBlock() {
    assert(!this.initialized, 'Cannot generate genesis block on initialized blockchain');
    const genesisTransaction = new Transaction({
      from: null,
      to: this.faucet,
      amount: config.GenesisCoinsAmount,
      type: TransactionType.Genesis,
    });
    const block = new Block({
      data: [genesisTransaction],
      previousHash: null,
    });
    await block.mine(this.difficulty);
    this.faucet.updateBalance(config.GenesisCoinsAmount);
    return block;
  }

  private getLatestBlock() {
    return this.blocks.at(-1);
  }

  private addBlock(block: Block) {
    assert(block.mined, 'Cannot add unmined block');
    assert(block.difficulty === this.difficulty, 'Cannot add block with mismatched difficulty');
    assert(block.previousHash === this.getLatestBlock().hash, 'Cannot add block with mismatched hash');
    this.blocks.push(block);
    debug(`Added block, total blocks: ${this.blocks.length}`);
  }

  async deployContract(contract: Contract<any, any>) {
    assert(!this.contracts.has(contract.address), 'Contract already deployed');

    const codeSize = contract.getCodeSize();
    const deployFee = config.ContractDeployBaseFee + config.ContractDeployPerByteFee * codeSize;
    const deployTransaction = new Transaction({
      from: contract.creator,
      to: this.drain,
      amount: deployFee,
      type: TransactionType.ContractDeploy,
      contract,
    });
    await this.addTransaction(deployTransaction);
  }

  validateIntegrity() {
    for (let i = 1; i < this.blocks.length; i++) {
      const currentBlock = this.blocks[i];
      const previousBlock = this.blocks[i - 1];
      if (!currentBlock.validate()) {
        return false;
      }
      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }

  calculateTransactionFees(transaction: Transaction) {
    if (transaction.type != TransactionType.Transaction) return 0;
    return config.FixedTransactionFee + transaction.amount * transaction.fee;
  }

  getTotalTransactionAmount(transaction: Transaction) {
    return transaction.amount + this.calculateTransactionFees(transaction);
  }

  async addTransaction(transaction: Transaction) {
    assert(transaction.from && transaction.to, 'Transaction must have a sender and a receiver');
    assert(transaction.from.address !== transaction.to.address, 'Sender and receiver must be different');
    if (transaction.type === TransactionType.Transaction) {
      assert(transaction.amount > 0, 'Transaction must have a positive amount');
    }
    assert(transaction.verify(), 'Transaction cannot be verified');

    this.pendingTransactionPool.push(transaction);

    if (this.pendingTransactionPool.length >= config.MaxPendingTransactions) {
      debug('Pending transaction pool size limit reached, scheduling auto-mine');
      clearTimeout(this.autoMineSchedule);
      this.autoMineSchedule = setTimeout(
        () => this.minePendingTransactions(this.drain),
        config.AutoMineDelaySeconds * 1000,
      );
    }
  }

  getBalance(wallet: Wallet) {
    let balance = 0;
    for (const block of this.blocks) {
      for (const transaction of block.data) {
        if (transaction.type === TransactionType.Transaction) {
          if (transaction.from.address === wallet.address) {
            balance -= this.getTotalTransactionAmount(transaction);
          }
        }
        if (transaction.to.address === wallet.address) {
          balance += transaction.amount;
        }
      }
    }
    return balance;
  }

  getTotalSupply() {
    let supply = 0;
    for (const block of this.blocks) {
      for (const transaction of block.data) {
        const supplyIncrementTypes: TransactionType[] = [TransactionType.Genesis, TransactionType.Reward];
        if (supplyIncrementTypes.includes(transaction.type)) {
          supply += transaction.amount;
        }
      }
    }
    return supply;
  }

  getDrainedAmount() {
    return this.getBalance(this.drain);
  }

  getCirculatingSupply() {
    return this.getTotalSupply() - this.getDrainedAmount();
  }

  $<S extends object, F extends object>(
    sender: Wallet,
    contract: Contract<S, F>,
    name: Exclude<keyof F, '__init__'>,
    args?: any[],
    gasLimit = config.DefaultGasLimit,
  ) {
    assert(this.contracts.has(contract.address), 'Contract is not deployed');
    const callTransaction = new Transaction({
      from: sender,
      to: this.drain,
      amount: 0,
      type: TransactionType.ContractCall,
      contract: contract as Contract<any, any>,
      functionName: name,
      functionArgs: args,
      gasLimit: gasLimit,
    });

    return this.addTransaction(callTransaction);
  }

  async minePendingTransactions(rewardWallet: Wallet) {
    debug(`${rewardWallet.name} is trying to mine ${this.pendingTransactionPool.length} transactions`);

    if (rewardWallet != this.drain && this.autoMineSchedule) {
      debug('Clearing auto-mine schedule');
      clearTimeout(this.autoMineSchedule);
      this.autoMineSchedule = null;
    }

    if (!this.pendingTransactionPool.length) {
      debug('No transactions to mine');
      return;
    }

    assert(!this.isMining, 'Mining already in progress');

    this.isMining = true;
    const runningBalances: Record<string, number> = {};
    const handledTransactions: Transaction[] = [];
    for (const transaction of this.pendingTransactionPool) {
      if (!transaction.verify()) continue;
      if (transaction.type === TransactionType.ContractCall && !this.contracts.has(transaction.contract.address)) {
        continue;
      }

      const spendingAmount = (() => {
        if (transaction.type === TransactionType.ContractDeploy) {
          return config.ContractDeployBaseFee + config.ContractDeployPerByteFee * transaction.contract.getCodeSize();
        } else if (transaction.type === TransactionType.ContractCall) {
          return transaction.amount + config.GasPrice * transaction.gasLimit;
        }
        return this.getTotalTransactionAmount(transaction);
      })();

      if (!runningBalances[transaction.from.address]) {
        runningBalances[transaction.from.address] = this.getBalance(transaction.from);
      }
      runningBalances[transaction.from.address] -= spendingAmount;

      if (!runningBalances[transaction.to.address]) {
        runningBalances[transaction.to.address] = this.getBalance(transaction.to);
      }
      runningBalances[transaction.to.address] += transaction.amount;

      if (runningBalances[transaction.from.address] < 0) {
        runningBalances[transaction.from.address] += spendingAmount;
        runningBalances[transaction.to.address] -= transaction.amount;
        continue;
      }

      handledTransactions.push(transaction);
    }
    const handled = new Set(handledTransactions.map((tx) => tx.hash));

    debug(`Mining ${handled.size} transactions`);

    const rewardAmount = handledTransactions.length * config.RewardPerMinedTransaction;
    const rewardTransaction = new Transaction({
      from: null,
      to: rewardWallet,
      amount: rewardAmount,
      type: TransactionType.Reward,
    });

    for (const tx of handledTransactions) {
      if (tx.type === TransactionType.ContractDeploy) {
        this.contracts.add(tx.contract.address);
        tx.contract.initialize();
        debug(`Contract '${tx.contract.name}' deployed`);
      }

      if (tx.type === TransactionType.ContractCall) {
        //@ts-expect-error
        const result = tx.contract.call(tx.from, tx.gasLimit)(tx.functionName, ...tx.functionArgs);
        tx.gasUsed = result.gasUsed;
        const gasCost = result.gasUsed * config.GasPrice;
        tx.from.updateBalance(-gasCost);
        if (!result.success) {
          debug(`! ${result.error.name} in ${tx.contract.name}.${<string>tx.functionName}: ${result.error.message}`);
        }
      }
    }

    const feesAmount = handledTransactions.reduce((acc, tx) => acc + this.calculateTransactionFees(tx), 0);
    const gasFeesAmount = handledTransactions
      .filter((tx) => tx.type === TransactionType.ContractCall)
      .reduce((sum, tx) => sum + tx.gasUsed * config.GasPrice, 0);
    const feesTransaction = new Transaction({
      from: null,
      to: rewardWallet,
      amount: feesAmount + gasFeesAmount,
      type: TransactionType.Fees,
    });

    const block = new Block({
      data: [rewardTransaction, feesTransaction, ...handledTransactions],
      previousHash: this.getLatestBlock().hash,
    });

    await block.mine(this.difficulty);

    rewardWallet.updateBalance(rewardAmount);
    rewardWallet.updateBalance(feesAmount);
    for (const tx of handledTransactions) {
      tx.from.updateBalance(this.getTotalTransactionAmount(tx) * -1);
      tx.to.updateBalance(tx.amount);
    }

    this.pendingTransactionPool = this.pendingTransactionPool.filter((tx) => !handled.has(tx.hash));

    this.addBlock(block);

    this.isMining = false;
  }
}
