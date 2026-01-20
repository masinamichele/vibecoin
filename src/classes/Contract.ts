import { Wallet } from './Wallet';
import { hash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ChainError, getDebug } from '../utils';
import config from '../config';

const debug = getDebug('contract');

type Context<S> = {
  storage: S;
  msg: { sender: string };
};

type ContractData<S extends object, F extends object> = {
  name: string;
  creator: Wallet;
  code: {
    storage: S;
    functions: F;
    view?: (keyof F)[];
  };
};

type CallResult = { success: boolean; result: any; error?: Error; gasUsed: number };

export class Contract<
  Storage extends object = Record<PropertyKey, any>,
  Functions extends object = Record<string, (this: Context<Storage>, ...args: any[]) => any>,
> {
  readonly name: string;
  readonly creator: Wallet;
  private readonly deployedAt: number;
  readonly address: string;
  private readonly storage: Storage;
  private readonly functions: Functions;

  private initialized = false;

  private gasUsed = 0;
  private gasLimit = 0;

  constructor(data: ContractData<Storage, Functions>) {
    this.name = data.name;
    this.creator = data.creator;
    this.storage = data.code.storage ?? ({} as Storage);
    this.functions = data.code.functions ?? ({} as Functions);
    this.deployedAt = Date.now();
    this.address = this.generateHash();
  }

  initialize() {
    assert(!this.initialized, 'Contract already initialized');
    if ((<any>this.functions)['__init__']) {
      (<any>this.call(this.creator))('__init__');
    }
    this.initialized = true;
  }

  private generateHash() {
    const key = `${this.deployedAt}-${this.creator.address}-${this.name}`;
    return hash('sha256', key);
  }

  private useGas(amount: number) {
    this.gasUsed += amount;
    if (this.gasUsed > this.gasLimit) {
      throw new ChainError.OutOfGasError(`Contract '${this.name}' out of gas`);
    }
  }

  getCodeSize() {
    return Object.values(this.functions)
      .map((func) => func.toString().length)
      .reduce<number>((a, b) => a + b, 0);
  }

  private getStorageProxy() {
    return new Proxy(this.storage, {
      get: (target, prop) => {
        this.useGas(config.GasCostStorageRead);
        return target[prop as keyof typeof target];
      },
      set: (target, prop, value) => {
        this.useGas(config.GasCostStorageWrite);
        target[prop as keyof typeof target] = value;
        return true;
      },
    });
  }

  getSnapshot() {
    return structuredClone(this.storage);
  }

  private call(caller: Wallet, gasLimit = config.DefaultGasLimit) {
    return (name: Exclude<keyof Functions, '__init__'>, ...args: any[]): CallResult => {
      if (name === '__init__') {
        assert(caller.address === this.creator.address, 'Only the contract creator can call the __init__ function');
        assert(!this.initialized, 'Contract already initialized');
      } else {
        assert(this.initialized, 'Contract is not initialized');
      }
      assert(
        Object.keys(this.functions).includes(<string>name),
        `Function '${<string>name}' does not exist in contract '${this.name}'`,
      );

      this.gasUsed = config.GasCostContractCall;
      this.gasLimit = gasLimit;

      const context: Context<Storage> = {
        storage: name === '__init__' ? this.storage : this.getStorageProxy(),
        msg: { sender: caller.address },
      };
      try {
        debug(`${caller.name} is calling ${this.name}.${<string>name} with args [${args.join(', ')}]`);
        const result = (<any>this.functions[name]).call(context, ...args);
        return {
          success: true,
          result,
          gasUsed: this.gasUsed,
        };
      } catch (error: any) {
        return {
          success: false,
          result: null,
          gasUsed: error instanceof ChainError.OutOfGasError ? this.gasLimit : this.gasUsed,
          error: error,
        };
      }
    };
  }
}
