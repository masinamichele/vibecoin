import { generateKeyPairSync, sign } from 'node:crypto';
import { cleanKey, currency, getLogger, restoreKey } from '#utils';
import config from '#config';
import { SIGN_ITEM, UPDATE_WALLET_BALANCE } from '#sym';

const log = getLogger('wallet');

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
    log(`Created wallet '${this.name}'`);
  }

  [UPDATE_WALLET_BALANCE](amount: number) {
    this.balance += amount;
    const sign = ['-', '+'][+(amount >= 0)];
    log(`Balance for ${this.name}: ${sign}${currency(Math.abs(amount))} (${currency(this.balance)})`);
  }

  [SIGN_ITEM](item: { signature: string; hash: string }) {
    const pem = restoreKey(Buffer.from(this.key, config.AddressFormat).toString('ascii'), 'PRIVATE');
    item.signature = sign('sha256', Buffer.from(item.hash), pem).toString('hex');
    log('Item signed');
  }
}
