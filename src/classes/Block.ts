import { hash, verify } from 'node:crypto';
import { Transaction } from './Transaction';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import config from '../config';
import { Consensus, getDebug, restoreKey } from '../utils';
import { Wallet } from './Wallet';

const debug = getDebug('block');

type BlockData = {
  data: Transaction[];
  previousHash: string;
};

type BlockMiningResult = { nonce: number; hash: string };

export class Block {
  hash: string = null;
  readonly previousHash: string;

  private nonce = 0;
  created = false;
  difficulty: number = null;
  mineTime: number = null;

  signature: string = null;
  validator: Wallet = null;

  readonly data: Transaction[];
  private readonly timestamp: number;
  private readonly root: string;

  constructor(block: BlockData) {
    this.data = block.data;
    assert(this.data.length > 0, 'A block must contain at least one transaction');
    this.previousHash = block.previousHash;
    this.timestamp = Date.now();
    this.root = this.calculateMerkleRoot();
    this.hash = this.generateHash();
    debug(`Created block with ${this.data.length} transactions (${this.data.map((tx) => tx.type).join('')})`);
  }

  private generateHash() {
    const key = `${this.timestamp}-${this.root}-${this.previousHash}-${this.nonce}`;
    return hash('sha256', key);
  }

  private calculateMerkleRoot(): string {
    let hashes = this.data.map((tx) => tx.hash);

    while (hashes.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left;

        const combined = hash('sha256', left + right);
        nextLevel.push(combined);
      }

      hashes = nextLevel;
    }

    return hashes[0];
  }

  private getHashDifficulty() {
    if (!this.hash) return 0;
    let counter = 0;
    for (const char of this.hash) {
      if (char === '0') counter++;
      else break;
    }
    return counter;
  }

  sign(validator: Wallet) {
    this.validator = validator;
    validator.sign(this);
  }

  private verify() {
    try {
      const pem = restoreKey(Buffer.from(this.validator.address, config.AddressFormat).toString('ascii'), 'PUBLIC');
      const valid = verify('sha256', Buffer.from(this.hash), pem, Buffer.from(this.signature, 'hex'));
      if (valid) debug('Transaction verified');
      return valid;
    } catch {
      return false;
    }
  }

  validate(consensus: Consensus) {
    if (this.hash !== this.generateHash()) return false;

    if (consensus === Consensus.ProofOfWork) {
      return this.created && this.getHashDifficulty() >= this.difficulty;
    }

    if (consensus === Consensus.ProofOfStake) {
      if (!this.signature || !this.validator) return false;
      return this.verify();
    }

    throw new Error('Invalid consensus type');
  }

  async mine(difficulty: number) {
    assert(!this.created, 'Cannot mine mined block');
    debug(`Block mining started, using ${config.BlockMinerPoolSize} workers`);
    const start = Date.now();
    const threads: Worker[] = [];
    const results: Promise<BlockMiningResult>[] = [];
    for (let i = 0; i < config.BlockMinerPoolSize; i++) {
      const miner = new Worker(join(__dirname, '../block-miner.worker.js'), {
        workerData: {
          difficulty,
          timestamp: this.timestamp,
          root: this.root,
          previousHash: this.previousHash,
          startNonce: config.MaxBlockNonce * i,
          endNonce: config.MaxBlockNonce * (i + 1) - 1,
        },
      });
      threads.push(miner);
      results.push(
        new Promise((resolve, reject) => {
          miner.on('message', (data: BlockMiningResult & { success: boolean }) => {
            if (data.success) resolve(data);
            else reject(new Error('Block mining failed'));
          });
        }),
      );
    }

    try {
      const { nonce, hash } = await Promise.any(results);
      await Promise.all(threads.map((thread) => thread.terminate()));
      this.nonce = nonce;
      this.hash = hash;
      this.created = true;
      this.difficulty = difficulty;
      this.mineTime = Date.now() - start;
      debug(`Block mining finished, nonce: ${this.nonce}, took ${this.mineTime}ms`);
    } catch {
      throw new RangeError('Block mining failed for every worker');
    }
  }
}
