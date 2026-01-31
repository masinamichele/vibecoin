import { generateKeyPairSync, sign } from 'node:crypto';
import { cleanKey, currency, getDebug, restoreKey } from '../utils';
import config from '../config';

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
    this.key = Buffer.from(cleanKey(privateKey)).toString(config.AddressFormat);
    this.address = Buffer.from(cleanKey(publicKey)).toString(config.AddressFormat);
    debug(`Created wallet '${this.name}'`);
  }

  updateBalance(amount: number) {
    this.balance += amount;
    const sign = ['-', '+'][+(amount >= 0)];
    debug(`Balance for ${this.name}: ${sign}${currency(Math.abs(amount))} (${currency(this.balance)})`);
  }

  sign(item: { signature: string; hash: string }) {
    const pem = restoreKey(Buffer.from(this.key, config.AddressFormat).toString('ascii'), 'PRIVATE');
    item.signature = sign('sha256', Buffer.from(item.hash), pem).toString('hex');
    debug('Item signed');
  }
}
