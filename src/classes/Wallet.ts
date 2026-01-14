import { generateKeyPairSync } from 'node:crypto';
import config from '../config';
import { cleanKey, currency } from '../utils';
const debug = require('debug')(`${config.LogTag}:wallet`);

type WalletOptions = {
  name: string;
};

export class Wallet {
  readonly key: string;
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
    debug(
      `Wallet balance for ${this.name}: ${['-', '+'][+(amount > 0)]}${currency(Math.abs(amount))} (${currency(this.balance)})`,
    );
  }
}
