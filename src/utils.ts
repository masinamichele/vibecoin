import config from './config';
import type { Contract, Wallet } from './classes';

export enum Consensus {
  ProofOfWork,
  ProofOfStake,
}

export const currency = (amount: number) => {
  const nf = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: config.Decimals,
    maximumFractionDigits: config.Decimals,
  });
  return `${config.CurrencySymbol}${nf.format(amount)}`;
};

export const cleanKey = (key: string) => key.replaceAll('\n', '').replaceAll(/-----(?:BEGIN|END) P\w+? KEY-----/g, '');
export const restoreKey = (key: string, type: 'PUBLIC' | 'PRIVATE') => {
  return [`-----BEGIN ${type} KEY-----`, ...key.match(/.{1,64}/g), `-----END ${type} KEY-----`].join('\n');
};

const LogTags = <const>['main', 'chain', 'wallet', 'tx', 'block', 'contract'];
const getLogTag = (tag: (typeof LogTags)[number]) => {
  const longest = Math.max(...LogTags.map((t) => t.length));
  return `${config.LogTag}:${tag.padEnd(longest, ' ')}`;
};
export const getDebug = (tag: (typeof LogTags)[number]) => require('debug')(getLogTag(tag));

export type Recipient = Wallet | Contract<any, any, any>;

export type Address = string;
export type Amount = number;
export type TokenId = string;
export type TokenData = string;

export namespace ChainError {
  class AutoNamedError extends Error {
    override get name() {
      return `${this.constructor.name}Error`;
    }
  }
  export class Ownership extends AutoNamedError {}
  export class OutOfGas extends AutoNamedError {}
  export class DuplicatedToken extends AutoNamedError {}
  export class NonExistentToken extends AutoNamedError {}
  export class MissingData extends AutoNamedError {}
  export class InvalidData extends AutoNamedError {}
  export class InsufficientFunds extends AutoNamedError {}
  export class NonExistentContract extends AutoNamedError {}
  export class DuplicatedContract extends AutoNamedError {}
  export class InvalidSignature extends AutoNamedError {}
  export class InvalidAmount extends AutoNamedError {}
  export class Mining extends AutoNamedError {}
}
