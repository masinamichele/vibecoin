import { hash, verify } from 'node:crypto';
import { Wallet } from './Wallet';
import config from '../config';
const debug = require('debug')(`${config.LogTag}:tx    `);
import { currency, restoreKey } from '../utils';
import assert from 'node:assert/strict';

export enum TransactionType {
  Genesis = 'G',
  Transaction = 'T',
  Reward = 'R',
  Fees = 'F',
}

type TransactionData = {
  from: Wallet;
  to: Wallet;
  amount: number;
  type?: TransactionType;
  fee?: number;
};

export class Transaction {
  readonly from: Wallet;
  readonly to: Wallet;
  readonly amount: number;
  readonly hash: string;
  readonly timestamp: number;
  readonly fee: number;
  readonly type: TransactionType;
  signature: string = null;

  constructor(data: TransactionData) {
    this.type = data.type ?? TransactionType.Transaction;
    this.from = data.from;
    if (this.type === TransactionType.Transaction) {
      assert(this.from, 'A transaction must have a valid sender');
    }
    this.to = data.to;
    this.amount = data.amount;
    this.fee = this.type === TransactionType.Transaction ? (data.fee ?? config.DefaultFeePercentage) : 0;
    this.timestamp = Date.now();
    this.hash = this.generateHash();
    if (this.type === TransactionType.Transaction) {
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
