import { generateKeyPairSync, sign } from 'node:crypto';
import { cleanKey, currency, getDebug, restoreKey } from '../utils';
import { Transaction } from './Transaction';

const debug = getDebug('wallet');

type WalletOptions = {
  name: string;
};

export class Wallet {
  private readonly key: string;
  readonly address: string;
  private balance = 0;

  readonly name: string;

  constructor(options: WalletOptions) {
    this.name = options.name;
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.key = Buffer.from(cleanKey(privateKey)).toString('hex');
    this.address = Buffer.from(cleanKey(publicKey)).toString('hex');
    debug(`Created wallet '${this.name}'`);
  }

  updateBalance(amount: number) {
    this.balance += amount;
    const transactionSign = ['-', '+'][+(amount >= 0)];
    debug(`Balance for ${this.name}: ${transactionSign}${currency(Math.abs(amount))} (${currency(this.balance)})`);
  }

  signTransaction(transaction: Transaction) {
    const pem = restoreKey(Buffer.from(this.key, 'hex').toString('ascii'), 'PRIVATE');
    transaction.signature = sign('sha256', Buffer.from(transaction.hash), pem).toString('hex');
    debug('Transaction signed');
  }
}
