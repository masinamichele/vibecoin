import { Block } from './Block';
import { Transaction, TransactionType } from './Transaction';
import { Wallet } from './Wallet';
import config from '../config';
import assert from 'node:assert/strict';
import { getDebug, Recipient } from '../utils';
import { Contract, ContractFunctions, ContractStorage, ContractViews } from './Contract';

const debug = getDebug('chain');

type BlockchainProperties = {
  difficulty: number;
};

export class Blockchain {
  readonly difficulty: number;
  private readonly blocks: Block[] = [];
  private mempool: Transaction[] = [];

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

  async deployContract(contract: Contract<any, any, any>) {
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
    if (transaction.type !== TransactionType.Transaction) return 0;
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

    this.mempool.push(transaction);

    if (this.mempool.length >= config.MaxPendingTransactions) {
      debug('Pending transaction pool size limit reached, scheduling auto-mine');
      clearTimeout(this.autoMineSchedule);
      this.autoMineSchedule = setTimeout(
        () => this.minePendingTransactions(this.drain),
        config.AutoMineDelaySeconds * 1000,
      );
    }
  }

  getBalance(recipient: Recipient) {
    let balance = 0;
    for (const block of this.blocks) {
      for (const transaction of block.data) {
        if (transaction.from?.address === recipient.address) {
          balance -= this.getTotalTransactionAmount(transaction);
          if (transaction.type === TransactionType.ContractCall) {
            const gasCost = (transaction.gasUsed ?? 0) * config.GasPrice;
            balance -= gasCost;
          }
        }
        if (transaction.to.address === recipient.address) {
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

  $<S extends ContractStorage, V extends ContractViews<S>, F extends ContractFunctions<S, V>>(
    sender: Wallet,
    contract: Contract<S, V, F>,
  ) {
    return (name: Exclude<keyof F, '__init__'>, { value = 0, gasLimit = config.DefaultGasLimit } = {}) => {
      return (...args: any[]) => {
        assert(this.contracts.has(contract.address), 'Contract is not deployed');
        const callTransaction = new Transaction({
          from: sender,
          to: contract,
          amount: value,
          type: TransactionType.ContractCall,
          contract: contract as Contract<any, any, any>,
          functionName: name,
          functionArgs: args,
          gasLimit: gasLimit,
        });

        return this.addTransaction(callTransaction);
      };
    };
  }

  async minePendingTransactions(rewardWallet: Wallet) {
    debug(`${rewardWallet.name} is trying to mine ${this.mempool.length} transactions`);

    if (rewardWallet != this.drain && this.autoMineSchedule) {
      debug('Clearing auto-mine schedule');
      clearTimeout(this.autoMineSchedule);
      this.autoMineSchedule = null;
    }

    if (!this.mempool.length) {
      debug('No transactions to mine');
      return;
    }

    assert(!this.isMining, 'Mining already in progress');

    this.isMining = true;

    const runningBalances: Record<string, number> = {};
    const handledTransactions: Transaction[] = [];
    const internalTransactions: Transaction[] = [];

    for (const transaction of this.mempool) {
      this.handleTransaction(transaction, runningBalances, handledTransactions);
    }

    if (handledTransactions.length === 0) {
      debug('No transactions to mine');
      this.isMining = false;
      return;
    }

    debug(`Mining ${handledTransactions.length} transactions`);

    for (const transaction of handledTransactions) {
      this.executeTransaction(transaction, runningBalances, internalTransactions);
    }

    const rewardTransaction = this.getRewardTransaction(handledTransactions, rewardWallet);
    const feesTransaction = this.getFeesTransaction(handledTransactions, rewardWallet);

    const block = new Block({
      data: [rewardTransaction, feesTransaction, ...handledTransactions, ...internalTransactions],
      previousHash: this.getLatestBlock().hash,
    });

    await block.mine(this.difficulty);

    rewardWallet.updateBalance(feesTransaction.amount);
    for (const transaction of handledTransactions) {
      if (transaction.type === TransactionType.GasOnly) {
        if (transaction.from instanceof Wallet) {
          const gasCost = transaction.gasUsed * config.GasPrice;
          transaction.from.updateBalance(-gasCost);
        }
        continue;
      }

      if (transaction.from instanceof Wallet) {
        transaction.from.updateBalance(this.getTotalTransactionAmount(transaction) * -1);
      }
      if (transaction.to instanceof Wallet) {
        transaction.to.updateBalance(transaction.amount);
      }
    }

    const handledHashes = new Set(handledTransactions.map((tx) => tx.hash));
    this.mempool = this.mempool.filter((tx) => !handledHashes.has(tx.hash));

    this.addBlock(block);

    this.isMining = false;
  }

  private handleTransaction(
    transaction: Transaction,
    runningBalances: Record<string, number>,
    handledTransactions: Transaction[],
  ) {
    if (!transaction.verify()) return;
    if (transaction.type === TransactionType.ContractCall) {
      if (!this.contracts.has(transaction.contract.address)) {
        return;
      }
      this.preflightContractCallTransaction(transaction, runningBalances);
    }

    const gasCost = (transaction.gasUsed ?? 0) * config.GasPrice;

    const spendingAmount = (() => {
      if (transaction.type === TransactionType.ContractDeploy) {
        return config.ContractDeployBaseFee + config.ContractDeployPerByteFee * transaction.contract.getCodeSize();
      }
      if (transaction.type === TransactionType.ContractCall) {
        return transaction.amount + gasCost;
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

      if (transaction.type === TransactionType.ContractCall) {
        if (runningBalances[transaction.from.address] >= gasCost) {
          transaction.type = TransactionType.GasOnly;
          runningBalances[transaction.from.address] -= gasCost;
          handledTransactions.push(transaction);
        }
      }

      return;
    }

    handledTransactions.push(transaction);
  }

  private getRewardTransaction(handledTransactions: Transaction[], rewardWallet: Wallet) {
    const rewardAmount = handledTransactions.length * config.RewardPerMinedTransaction;
    return new Transaction({
      from: null,
      to: rewardWallet,
      amount: rewardAmount,
      type: TransactionType.Reward,
    });
  }

  private getFeesTransaction(handledTransactions: Transaction[], rewardWallet: Wallet) {
    const feesAmount = handledTransactions.reduce((acc, tx) => acc + this.calculateTransactionFees(tx), 0);
    const gasFeesAmount = handledTransactions
      .filter((tx) => tx.type === TransactionType.ContractCall)
      .reduce((sum, tx) => sum + tx.gasUsed * config.GasPrice, 0);
    return new Transaction({
      from: null,
      to: rewardWallet,
      amount: feesAmount + gasFeesAmount,
      type: TransactionType.Fees,
    });
  }

  private executeTransaction(
    transaction: Transaction,
    runningBalances: Record<string, number>,
    internalTransactions: Transaction[],
  ) {
    if (transaction.type === TransactionType.GasOnly) return;

    if (transaction.type === TransactionType.ContractDeploy) {
      this.executeContractDeployTransaction(transaction);
    }

    if (transaction.type === TransactionType.ContractCall) {
      this.commitContractCallTransaction(transaction, runningBalances, internalTransactions);
    }
  }

  private executeContractDeployTransaction(transaction: Transaction) {
    this.contracts.add(transaction.contract.address);
    transaction.contract.initialize();
    debug(`Contract '${transaction.contract.name}' deployed`);
  }

  private preflightContractCallTransaction(transaction: Transaction, runningBalances: Record<string, number>) {
    const contractBalance = runningBalances[transaction.to.address] ?? this.getBalance(transaction.to);
    transaction.contract.takeStateSnapshot();
    //@ts-expect-error
    const result = transaction.contract.call(transaction.from, {
      value: transaction.amount,
      gasLimit: transaction.gasLimit,
      env: { contractBalance, drain: this.drain },
    })(transaction.functionName, ...transaction.functionArgs);
    transaction.gasUsed = result.gasUsed;
    transaction.callResult = result;
    if (!result.success) {
      transaction.contract.revert();
    }
  }

  private commitContractCallTransaction(
    transaction: Transaction,
    runningBalances: Record<string, number>,
    internalTransactions: Transaction[],
  ) {
    if (transaction.callResult.success) {
      const contractBalance = runningBalances[transaction.to.address] ?? this.getBalance(transaction.to);
      const totalWithdrawalAmount = transaction.callResult.transfers.reduce((acc, val) => acc + val.amount, 0);
      if (totalWithdrawalAmount > contractBalance) {
        debug(`! Withdrawal failed for ${transaction.contract.name}: insufficient funds`);
      } else {
        for (const transfer of transaction.callResult.transfers) {
          const withdrawalTx = new Transaction({
            type: TransactionType.Withdrawal,
            from: transaction.to,
            to: transfer.to,
            amount: transfer.amount,
          });
          internalTransactions.push(withdrawalTx);
        }
      }
    } else {
      transaction.contract.revert();
      const s = `! ${transaction.callResult.error.name} in ${transaction.contract.name}.${<string>transaction.functionName}: ${transaction.callResult.error.message}`;
      debug(s);
    }
  }
}
