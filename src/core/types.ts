import type { Contract, Wallet } from '#classes';

export type Recipient = Wallet | Contract<any, any, any>;
export type Address = string;
export type Amount = number;
export type TokenId = string;
export type TokenData = string;

export enum Consensus {
  ProofOfWork,
  ProofOfStake,
  ProofOfAuthority,
}
