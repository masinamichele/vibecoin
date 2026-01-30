import config from './config';
import type { Contract, Wallet } from './classes';

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
  export class OwnershipError extends Error {
    override name = 'OwnershipError';
  }
  export class OutOfGasError extends Error {
    override name = 'OutOfGasError';
  }
  export class DuplicatedTokenError extends Error {
    override name = 'DuplicatedTokenError';
  }
  export class NonExistentTokenError extends Error {
    override name = 'NonExistentTokenError';
  }
  export class MissingDataError extends Error {
    override name = 'MissingDataError';
  }
  export class InsufficientFundsError extends Error {
    override name = 'InsufficientFundsError';
  }
}
