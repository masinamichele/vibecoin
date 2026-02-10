export type Address = string;
export type Amount = number;
export type TokenId = string;
export type TokenData = string;

export type ExtraData = Record<PropertyKey, any>;

export interface ContractEvent {
  contract: Address;
  name: string;
  data: Record<PropertyKey, any>;
}

export enum Consensus {
  ProofOfWork,
  ProofOfStake,
  ProofOfAuthority,
}

export interface Recipient {
  readonly address: string;
  readonly name: string;
}

export interface Hashable {
  readonly hash: string;
  readonly timestamp: number;
}

export interface Signable extends Hashable {
  signature: string;
}
