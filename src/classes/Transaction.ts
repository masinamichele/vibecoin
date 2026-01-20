import { hash, verify } from 'node:crypto';
import { Wallet } from './Wallet';
import config from '../config';
import { currency, getDebug, restoreKey } from '../utils';
import assert from 'node:assert/strict';
import { Contract } from './Contract';

const debug = getDebug('tx');

export enum TransactionType {
  Genesis = 'G',
  Transaction = 'T',
  Reward = 'R',
  Fees = 'F',
  ContractDeploy = 'D',
  ContractCall = 'C',
}

type TransactionData<S extends object, F extends object> = {
  from: Wallet;
  to: Wallet;
  amount: number;
  type?: TransactionType;
  fee?: number;
  contract?: Contract<S, F>;
  functionName?: Exclude<keyof F, '__init__'>;
  functionArgs?: any[];
  gasLimit?: number;
};

export class Transaction<S extends object = any, F extends object = any> {
  readonly from: Wallet;
  readonly to: Wallet;
  readonly amount: number;
  readonly hash: string;
  readonly timestamp: number;
  readonly fee: number;
  readonly type: TransactionType;
  readonly contract?: Contract<S, F>;
  readonly functionName?: Exclude<keyof F, '__init__'>;
  readonly functionArgs?: any[];
  readonly gasLimit?: number;

  gasUsed: number = null;
  signature: string = null;

  constructor(data: TransactionData<S, F>) {
    this.type = data.type ?? TransactionType.Transaction;
    this.from = data.from;
    if (this.type === TransactionType.Transaction) {
      assert(this.from, 'A transaction must have a valid sender');
    }
    if (this.type === TransactionType.ContractDeploy) {
      assert(data.contract, 'A contract deploy transaction must have a contract');
    }
    this.to = data.to;
    this.amount = data.amount;
    this.fee = this.type === TransactionType.Transaction ? (data.fee ?? config.DefaultFeePercentage) : 0;
    this.contract = data.contract;
    this.functionName = data.functionName;
    this.functionArgs = data.functionArgs || [];
    this.gasLimit = data.gasLimit || config.DefaultGasLimit;

    if (this.type === TransactionType.ContractCall) {
      assert(this.contract, 'Contract call must include a contract');
      assert(this.functionName, 'Contract call must include a function name');
    }

    this.timestamp = Date.now();
    this.hash = this.generateHash();
    const signedTypes: TransactionType[] = [
      TransactionType.Transaction,
      TransactionType.ContractDeploy,
      TransactionType.ContractCall,
    ];
    if (signedTypes.includes(this.type)) {
      debug(`Created transaction from ${this.from.name} to ${this.to.name} for ${currency(this.amount)}`);
      debug(`Fixed transaction fee: ${currency(config.FixedTransactionFee)}`);
      debug(`Percentage transaction fee: ${this.fee * 100}% (${currency(this.amount * this.fee)})`);
      debug(`Total transaction amount: ${currency(this.amount + this.amount * this.fee + config.FixedTransactionFee)}`);
      this.from.signTransaction(this);
    } else {
      debug(`Materialized ${currency(this.amount)} to ${this.to.name} (${this.type})`);
    }
  }

  private generateHash() {
    const key = `${this.timestamp}-${this.type}-${this.from?.address ?? 'base'}-${this.to.address}-${this.amount}-${this.fee}`;
    return hash('sha256', key);
  }

  verify() {
    try {
      const pem = restoreKey(Buffer.from(this.from.address, 'hex').toString('ascii'), 'PUBLIC');
      const valid = verify('sha256', Buffer.from(this.hash), pem, Buffer.from(this.signature, 'hex'));
      if (valid) debug('Transaction verified');
      return valid;
    } catch {
      return false;
    }
  }
}
