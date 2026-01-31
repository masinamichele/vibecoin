import { Block } from './Block';
import { Transaction, TransactionType } from './Transaction';
import { Wallet } from './Wallet';
import config from '../config';
import assert from 'node:assert/strict';
import { Amount, Consensus, getDebug, Recipient } from '../utils';
import { Contract, ContractFunctions, ContractStorage, ContractViews } from './Contract';
import { getRandomValues } from 'node:crypto';

const debug = getDebug('chain');

type PowBlockchainProperties = {
  difficulty: number;
};

type CommonBlockCreationCheckpoint = {
  block: Block;
  rewardTransaction: Transaction;
  feesTransaction: Transaction;
  handledTransactions: Transaction[];
};

abstract class BaseBlockchain {
  protected readonly blocks: Block[] = [];
  protected mempool: Transaction[] = [];

  readonly faucet: Wallet;
  protected readonly drain: Wallet;

  protected initialized = false;

  protected isCreatingBlock = false;

  protected autoAddBlockSchedule: any;

  protected readonly contracts = new Set<string>();

  protected constructor() {
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

  protected abstract generateGenesisBlock(): Promise<Block>;
  protected abstract addBlock(block: Block): void;
  abstract createBlock(...args: any[]): Promise<void>;

  protected getLatestBlock() {
    return this.blocks.at(-1);
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

  validateIntegrity(consensus: Consensus) {
    for (let i = 1; i < this.blocks.length; i++) {
      const currentBlock = this.blocks[i];
      const previousBlock = this.blocks[i - 1];
      if (!currentBlock.validate(consensus)) {
        return false;
      }
      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }

  calculateTransactionFees(transaction: Transaction) {
    const feePayingTypes: TransactionType[] = [TransactionType.Transaction, TransactionType.Stake];
    if (!feePayingTypes.includes(transaction.type)) return 0;
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

  protected commonCreateBlockP1(rewardWallet: Wallet): CommonBlockCreationCheckpoint {
    if (!this.mempool.length) {
      debug('No transactions to handle');
      return null;
    }

    assert(!this.isCreatingBlock, 'Handling already in progress');

    this.isCreatingBlock = true;

    const runningBalances: Record<string, number> = {};
    const handledTransactions: Transaction[] = [];
    const internalTransactions: Transaction[] = [];

    for (const transaction of this.mempool) {
      this.handleTransaction(transaction, runningBalances, handledTransactions);
    }

    if (handledTransactions.length === 0) {
      debug('No transactions to handle');
      this.isCreatingBlock = false;
      return null;
    }

    debug(`Handling ${handledTransactions.length} transactions`);

    for (const transaction of handledTransactions) {
      this.executeTransaction(transaction, runningBalances, internalTransactions);
    }

    const rewardTransaction = this.getRewardTransaction(handledTransactions, rewardWallet);
    const feesTransaction = this.getFeesTransaction(handledTransactions, rewardWallet);

    const block = new Block({
      data: [rewardTransaction, feesTransaction, ...handledTransactions, ...internalTransactions],
      previousHash: this.getLatestBlock().hash,
    });

    return { block, rewardTransaction, feesTransaction, handledTransactions };
  }

  protected commonCreateBlockP2(
    rewardWallet: Wallet,
    { block, rewardTransaction, feesTransaction, handledTransactions }: CommonBlockCreationCheckpoint,
  ) {
    rewardWallet.updateBalance(rewardTransaction.amount);
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

    this.isCreatingBlock = false;
  }

  protected handleTransaction(
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

  protected getRewardTransaction(handledTransactions: Transaction[], rewardWallet: Wallet) {
    const rewardAmount = handledTransactions.length * config.RewardPerMinedTransaction;
    return new Transaction({
      from: null,
      to: rewardWallet,
      amount: rewardAmount,
      type: TransactionType.Reward,
    });
  }

  protected getFeesTransaction(handledTransactions: Transaction[], rewardWallet: Wallet) {
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

  protected executeTransaction(
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

export namespace Blockchain {
  export class ProofOfWork extends BaseBlockchain {
    readonly difficulty: number;

    constructor(properties: PowBlockchainProperties) {
      super();
      assert(properties.difficulty > 0, 'Difficulty must be a positive number');
      this.difficulty = properties.difficulty;
      debug(`Initializing ${config.CurrencyName} Proof-of-Work blockchain with difficulty ${this.difficulty}`);
    }

    protected async generateGenesisBlock() {
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

    protected addBlock(block: Block) {
      assert(block.validate(Consensus.ProofOfWork), 'Block failed PoW validation');
      assert(block.created, 'Cannot add unmined block');
      assert(block.difficulty === this.difficulty, 'Cannot add block with mismatched difficulty');
      assert(block.previousHash === this.getLatestBlock().hash, 'Cannot add block with mismatched hash');
      this.blocks.push(block);
      debug(`Added block, total blocks: ${this.blocks.length}`);
    }

    override async addTransaction(transaction: Transaction) {
      await super.addTransaction(transaction);
      if (this.mempool.length >= config.MaxPendingTransactions) {
        debug('Pending transaction pool size limit reached, scheduling auto-mine');
        clearTimeout(this.autoAddBlockSchedule);
        this.autoAddBlockSchedule = setTimeout(
          () => this.createBlock(this.drain),
          config.AutoCreateBlockDelaySeconds * 1000,
        );
      }
    }

    override validateIntegrity() {
      return super.validateIntegrity(Consensus.ProofOfWork);
    }

    async createBlock(rewardWallet: Wallet) {
      debug(`${rewardWallet.name} is trying to mine ${this.mempool.length} transactions`);

      if (rewardWallet != this.drain && this.autoAddBlockSchedule) {
        debug('Clearing auto-mine schedule');
        clearTimeout(this.autoAddBlockSchedule);
        this.autoAddBlockSchedule = null;
      }

      const checkpoint = this.commonCreateBlockP1(rewardWallet);
      if (!checkpoint) return;

      await checkpoint.block.mine(this.difficulty);

      this.commonCreateBlockP2(rewardWallet, checkpoint);
    }
  }

  export class ProofOfStake extends BaseBlockchain {
    private readonly stakers = new Map<Wallet, Amount>();

    constructor() {
      super();
      debug(`Initializing ${config.CurrencyName} Proof-of-Stake blockchain`);
    }

    protected async generateGenesisBlock() {
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
      this.faucet.updateBalance(config.GenesisCoinsAmount);
      return block;
    }

    protected addBlock(block: Block) {
      assert(block.validate(Consensus.ProofOfStake), 'Block failed PoS signature validation');
      assert(block.previousHash === this.getLatestBlock().hash, 'Cannot add block with mismatched hash');
      this.blocks.push(block);
      debug(`Added block, total blocks: ${this.blocks.length}`);
    }

    async stake(staker: Wallet, amount: number) {
      assert(amount > 0, 'Stake amount must be positive');
      const stakeTransaction = new Transaction({
        type: TransactionType.Stake,
        from: staker,
        to: this.drain,
        amount,
      });
      await this.addTransaction(stakeTransaction);
    }

    async unstake(staker: Wallet, amount: number) {
      assert(amount > 0, 'Unstake amount must be positive');
      const currentStake = this.stakers.get(staker) ?? 0;
      assert(currentStake >= amount, 'Insufficient funds to unstake');
      const unstakeTransaction = new Transaction({
        type: TransactionType.Unstake,
        from: this.drain,
        to: staker,
        amount,
      });
      await this.addTransaction(unstakeTransaction);
    }

    private selectValidator() {
      const totalStake = this.stakers.values().reduce((acc, val) => acc + val, 0);
      if (totalStake <= 0) {
        return this.faucet;
      }

      const weightedStakers = new Map<Wallet, number>();
      for (const wallet of this.stakers.keys()) {
        weightedStakers.set(wallet, this.stakers.get(wallet) / totalStake);
      }

      const random = getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

      let cumulativeWeight = 0;
      for (const wallet of weightedStakers.keys()) {
        cumulativeWeight += weightedStakers.get(wallet);
        if (random < cumulativeWeight) return wallet;
      }

      return [...weightedStakers.entries()].toSorted((a, b) => b[1] - a[1])[0][0];
    }

    override async addTransaction(transaction: Transaction) {
      await super.addTransaction(transaction);
      if (this.mempool.length >= config.MaxPendingTransactions) {
        debug('Pending transaction pool size limit reached, scheduling auto-forge');
        clearTimeout(this.autoAddBlockSchedule);
        this.autoAddBlockSchedule = setTimeout(() => this.createBlock(), config.AutoCreateBlockDelaySeconds * 1000);
      }
    }

    override validateIntegrity() {
      return super.validateIntegrity(Consensus.ProofOfStake);
    }

    async createBlock() {
      const rewardWallet = this.selectValidator();
      debug(`${rewardWallet.name} is trying to validate ${this.mempool.length} transactions`);

      if (this.autoAddBlockSchedule) {
        debug('Clearing auto-forge schedule');
        clearTimeout(this.autoAddBlockSchedule);
        this.autoAddBlockSchedule = null;
      }

      const checkpoint = this.commonCreateBlockP1(rewardWallet);
      if (!checkpoint) return;

      checkpoint.block.sign(rewardWallet);

      this.commonCreateBlockP2(rewardWallet, checkpoint);
    }

    override executeTransaction(
      transaction: Transaction,
      runningBalances: Record<string, number>,
      internalTransactions: Transaction[],
    ) {
      super.executeTransaction(transaction, runningBalances, internalTransactions);

      if (transaction.from instanceof Wallet) {
        if (transaction.type === TransactionType.Stake) {
          this.stakers.set(transaction.from, (this.stakers.get(transaction.from) ?? 0) + transaction.amount);
        }
      }

      if (transaction.to instanceof Wallet) {
        if (transaction.type === TransactionType.Unstake) {
          this.stakers.set(transaction.to, this.stakers.get(transaction.to) - transaction.amount);
        }
      }
    }
  }

  //@ts-ignore
  export class ProofOfAuthority extends BaseBlockchain {
    constructor() {
      super();
      throw new Error('Not yet implemented');
    }
  }
}
