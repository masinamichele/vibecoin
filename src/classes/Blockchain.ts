import {
  Block,
  Contract,
  type ContractFunctions,
  type ContractStorage,
  type ContractViews,
  Transaction,
  TransactionType,
  Wallet,
} from '#classes';
import config from '#config';
import assert from 'node:assert/strict';
import { getLogger } from '#utils';
import { ChainError } from '#errors';
import { type Amount, Consensus, type Recipient } from '#types';
import { getRandomValues } from 'node:crypto';

const log = getLogger('chain');

type PowBlockchainProperties = {
  difficulty: number;
};

type PoaBlockchainProperties = {
  authorities: Wallet[];
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
    log('Generating genesis block');
    const genesis = await this.generateGenesisBlock();
    this.blocks.push(genesis);
    this.initialized = true;
    log('Blockchain initialized');
  }

  protected async generateGenesisBlock(afterCreation?: (block: Block) => void | Promise<void>) {
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
    if (afterCreation) await afterCreation(block);
    this.faucet.updateBalance(config.GenesisCoinsAmount);
    return block;
  }

  abstract createBlock(...args: any[]): Promise<void>;

  protected addBlock(block: Block) {
    assert(block.previousHash === this.getLatestBlock().hash, 'Cannot add block with mismatched hash');
    this.blocks.push(block);
    log(`Added block, total blocks: ${this.blocks.length}`);
  }

  protected getLatestBlock() {
    return this.blocks.at(-1);
  }

  async deployContract(contract: Contract<any, any, any>) {
    if (this.contracts.has(contract.address)) throw new ChainError.DuplicatedContract();

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

  validateIntegrity(consensus: Consensus, additionalCheckFunction?: (block: Block, index: number) => boolean) {
    for (let i = 1; i < this.blocks.length; i++) {
      const currentBlock = this.blocks[i];
      const previousBlock = this.blocks[i - 1];
      if (additionalCheckFunction) {
        const valid = additionalCheckFunction(currentBlock, i);
        if (!valid) return false;
      }
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
    if (!transaction.from || !transaction.to) throw new ChainError.MissingData();
    if (transaction.from.address === transaction.to.address) throw new ChainError.InvalidData();
    if (transaction.type === TransactionType.Transaction && transaction.amount <= 0) throw new ChainError.InvalidData();
    if (!transaction.verify()) throw new ChainError.InvalidSignature();

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
        if (!this.contracts.has(contract.address)) throw new ChainError.NonExistentContract();
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
      log('No transactions to handle');
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
      log('No transactions to handle');
      this.isCreatingBlock = false;
      return null;
    }

    log(`Handling ${handledTransactions.length} transactions`);

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
    log(`Contract '${transaction.contract.name}' deployed`);
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
        log(`! Withdrawal failed for ${transaction.contract.name}: insufficient funds`);
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
      log(s);
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
      log(`Initializing ${config.CurrencyName} Proof-of-Work blockchain with difficulty ${this.difficulty}`);
    }

    protected override async generateGenesisBlock() {
      return super.generateGenesisBlock((block) => block.mine(this.difficulty));
    }

    protected override addBlock(block: Block) {
      assert(block.validate(Consensus.ProofOfWork), 'Block failed PoW validation');
      assert(block.created, 'Cannot add unmined block');
      assert(block.difficulty === this.difficulty, 'Cannot add block with mismatched difficulty');
      super.addBlock(block);
    }

    override async addTransaction(transaction: Transaction) {
      await super.addTransaction(transaction);
      if (this.mempool.length >= config.MaxPendingTransactions) {
        log('Pending transaction pool size limit reached, scheduling auto-mine');
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
      log(`${rewardWallet.name} is trying to mine ${this.mempool.length} transactions`);

      if (rewardWallet != this.drain && this.autoAddBlockSchedule) {
        log('Clearing auto-mine schedule');
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
      log(`Initializing ${config.CurrencyName} Proof-of-Stake blockchain`);
    }

    protected override addBlock(block: Block) {
      assert(block.validate(Consensus.ProofOfStake), 'Block failed PoS signature validation');
      super.addBlock(block);
    }

    async stake(staker: Wallet, amount: number) {
      if (amount <= 0) throw new ChainError.InvalidAmount();
      const stakeTransaction = new Transaction({
        type: TransactionType.Stake,
        from: staker,
        to: this.drain,
        amount,
      });
      await this.addTransaction(stakeTransaction);
    }

    async unstake(staker: Wallet, amount: number) {
      if (amount <= 0) throw new ChainError.InvalidAmount();
      const currentStake = this.stakers.get(staker) ?? 0;
      if (currentStake < amount) throw new ChainError.InsufficientFunds();
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
        log('Pending transaction pool size limit reached, scheduling auto-forge');
        clearTimeout(this.autoAddBlockSchedule);
        this.autoAddBlockSchedule = setTimeout(() => this.createBlock(), config.AutoCreateBlockDelaySeconds * 1000);
      }
    }

    override validateIntegrity() {
      return super.validateIntegrity(Consensus.ProofOfStake);
    }

    async createBlock() {
      const rewardWallet = this.selectValidator();
      log(`${rewardWallet.name} is trying to validate ${this.mempool.length} transactions`);

      if (this.autoAddBlockSchedule) {
        log('Clearing auto-forge schedule');
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

  export class ProofOfAuthority extends BaseBlockchain {
    private readonly authorities: Wallet[];

    constructor(properties: PoaBlockchainProperties) {
      super();
      this.authorities = properties.authorities;
      if (!this.authorities?.length) throw new ChainError.MissingData();
      log(`Initializing ${config.CurrencyName} Proof-of-Authority blockchain`);
    }

    private getNextValidator() {
      const nextValidatorIndex = this.blocks.length % this.authorities.length;
      return this.authorities[nextValidatorIndex];
    }

    override async addTransaction(transaction: Transaction) {
      await super.addTransaction(transaction);
      if (this.mempool.length >= config.MaxPendingTransactions) {
        log('Pending transaction pool size limit reached, scheduling auto-validation');
        clearTimeout(this.autoAddBlockSchedule);
        this.autoAddBlockSchedule = setTimeout(() => this.createBlock(), config.AutoCreateBlockDelaySeconds * 1000);
      }
    }

    override validateIntegrity() {
      return super.validateIntegrity(Consensus.ProofOfAuthority, (block, i) => {
        const expectedValidator = this.authorities[i % this.authorities.length];
        return block.validator.address === expectedValidator.address;
      });
    }

    protected override addBlock(block: Block) {
      const expectedValidator = this.getNextValidator();
      if (block.validator.address !== expectedValidator.address) {
        throw new ChainError.InvalidBlock();
      }
      assert(block.validate(Consensus.ProofOfAuthority), 'Block failed PoA signature validation');
      super.addBlock(block);
    }

    async createBlock() {
      const validator = this.getNextValidator();
      log(`${validator.name} is trying to validate ${this.mempool.length} transactions`);
      const checkpoint = this.commonCreateBlockP1(validator);
      if (!checkpoint) return;
      checkpoint.block.sign(validator);
      this.commonCreateBlockP2(validator, checkpoint);
      log(`Block created and signed by authority ${validator.name}`);
    }
  }
}
