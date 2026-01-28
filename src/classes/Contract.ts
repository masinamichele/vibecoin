import { Wallet } from './Wallet';
import { hash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ChainError, getDebug } from '../utils';
import config from '../config';

const debug = getDebug('contract');

type ContractData<S extends ContractStorage, V extends ContractViews<S>, F extends ContractFunctions<S, V>> = {
  name: string;
  creator: Wallet;
  code: {
    storage: S;
    views: V;
    functions: F;
  };
};

type ViewContext<S extends ContractStorage> = { storage: S };

type BoundViews<V extends ContractViews<any>> = {
  [K in keyof V]: OmitThisParameter<V[K]>;
};

type FunctionContext<S extends ContractStorage, V extends ContractViews<S>> = ViewContext<S> & {
  views(): BoundViews<V>;
  msg: { sender: string };
};

export type ContractStorage = Record<PropertyKey, any>;
export type ContractViews<S extends ContractStorage> = Record<string, (this: ViewContext<S>, ...args: any[]) => any>;
export type ContractFunctions<S extends ContractStorage, V extends ContractViews<S>> = Record<
  string,
  (this: FunctionContext<S, V>, ...args: any[]) => any
>;

export function createContractCode<S extends ContractStorage, V extends ContractViews<S>>(code: {
  storage: S;
  views: V;
  functions: ContractFunctions<S, V>;
}): typeof code {
  return code;
}

type CallResult = { success: boolean; result: any; error?: Error; gasUsed: number };

export class Contract<
  Storage extends ContractStorage,
  Views extends ContractViews<Storage>,
  Functions extends ContractFunctions<Storage, Views>,
> {
  readonly name: string;
  readonly creator: Wallet;
  private readonly deployedAt: number;
  readonly address: string;

  private readonly storage: Storage;
  readonly views: Views;
  private readonly functions: Functions;

  private initialized = false;

  private gasUsed = 0;
  private gasLimit = 0;

  constructor(data: ContractData<Storage, Views, Functions>) {
    this.name = data.name;
    this.creator = data.creator;
    this.storage = data.code.storage ?? ({} as Storage);
    this.views = data.code.views ?? ({} as Views);
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
    const getObjectLength = <T extends object>(obj: T) =>
      Object.values(obj)
        .map((func) => func.toString().length)
        .reduce<number>((a, b) => a + b, 0);

    return getObjectLength(this.functions) + getObjectLength(this.views) + JSON.stringify(this.storage).length;
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

  private deepFreeze<T extends object>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    Object.keys(obj).forEach((key) => {
      this.deepFreeze((<any>obj)[key]);
    });
    return Object.freeze(obj);
  }

  private getBoundViews(): BoundViews<Views> {
    const viewsContext: ViewContext<Storage> = {
      storage: this.deepFreeze(this.getSnapshot()),
    };
    return Object.fromEntries(
      Object.entries(this.views).map(([name, func]) => [name, func.bind(viewsContext)]),
    ) as BoundViews<Views>;
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

      const functionsContext: FunctionContext<Storage, Views> = {
        storage: name === '__init__' ? this.storage : this.getStorageProxy(),
        views: () => this.getBoundViews(),
        msg: { sender: caller.address },
      };
      try {
        debug(`${caller.name} is calling ${this.name}.${<string>name} with args [${args.join(', ')}]`);
        const result = (<any>this.functions[name]).call(functionsContext, ...args);
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
