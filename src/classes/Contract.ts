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
  get views(): BoundViews<V>;
  msg: { sender: string; value: number };
  creator: { address: string };
  address: string;
  env: { contractBalance: number; drain: Wallet };
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

type TransferRequest = {
  to: Wallet;
  amount: number;
};
type CallResult = { success: boolean; result: any; error?: Error; gasUsed: number; transfers?: TransferRequest[] };

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
  private readonly _views: Views;
  private readonly functions: Functions;
  get views() {
    return this.getBoundViews();
  }

  private initialized = false;

  private gasUsed = 0;
  private gasLimit = 0;

  constructor(data: ContractData<Storage, Views, Functions>) {
    this.name = data.name;
    this.creator = data.creator;
    this.storage = data.code.storage ?? ({} as Storage);
    this._views = data.code.views ?? ({} as Views);
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

    return getObjectLength(this.functions) + getObjectLength(this._views) + JSON.stringify(this.storage).length;
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

  private deepFreeze<T extends object>(target: T): T {
    if (target === null || typeof target !== 'object') {
      return target;
    }
    for (const key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = this.deepFreeze(<any>target[key]);
      }
    }
    const handler: ProxyHandler<any> = {
      set: () => true,
      deleteProperty: () => true,
    };
    return new Proxy(target, handler);
  }

  private getBoundViews(): BoundViews<Views> {
    const viewsContext: ViewContext<Storage> = {
      storage: this.getReadonlyStorageSnapshot(),
    };
    return Object.fromEntries(
      Object.entries(this._views).map(([name, func]) => [name, func.bind(viewsContext)]),
    ) as BoundViews<Views>;
  }

  getReadonlyStorageSnapshot() {
    return this.deepFreeze(structuredClone(this.storage));
  }

  private call(
    caller: Wallet,
    {
      value = 0,
      gasLimit = config.DefaultGasLimit,
      env,
    }: { value?: number; gasLimit?: number; env?: FunctionContext<any, any>['env'] } = {},
  ) {
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

      const functionsContext = {
        storage: name === '__init__' ? this.storage : this.getStorageProxy(),
        msg: { sender: caller.address, value },
        creator: { address: this.creator.address },
        address: this.address,
        env,
      } as FunctionContext<Storage, Views>;
      Object.defineProperty(functionsContext, 'views', {
        get: () => this.getBoundViews(),
      });
      try {
        debug(`${caller.name} is calling ${this.name}.${<string>name} with args [${args.join(', ')}]`);
        const result = (<any>this.functions[name]).call(functionsContext, ...args);
        let transfers: TransferRequest[] = [];
        if (result?.transfer) {
          transfers.push(result.transfer);
          delete result.transfer;
        }
        return {
          success: true,
          result,
          gasUsed: this.gasUsed,
          transfers,
        };
      } catch (error: any) {
        return {
          success: false,
          result: null,
          gasUsed: error instanceof ChainError.OutOfGasError ? this.gasLimit : this.gasUsed,
          error: error,
          transfers: [],
        };
      }
    };
  }
}
