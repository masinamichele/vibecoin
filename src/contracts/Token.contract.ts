import { Contract, Wallet } from '../classes';
import { createContractCode } from '../classes/Contract';

export default {
  createContract(
    owner: Wallet,
    options: {
      name: string;
      symbol: string;
      decimals: number;
      totalSupply: number;
    },
  ) {
    return new Contract({
      name: options.name,
      creator: owner,
      code: createContractCode({
        storage: {
          name: options.name,
          symbol: options.symbol,
          decimals: options.decimals,
          totalSupply: options.totalSupply,
          balances: {} as Record<string, number>,
          allowances: {} as Record<string, Record<string, number>>,
        },
        views: {
          balanceOf(address: string) {
            return this.storage.balances[address] ?? 0;
          },
          allowance(owner: string, spender: string) {
            return this.storage.allowances[owner]?.[spender] ?? 0;
          },
        },
        functions: {
          __init__() {
            this.storage.balances[this.msg.sender] = this.storage.totalSupply;
          },
          transfer(to: string, amount: number) {
            if (amount <= 0) throw new RangeError('Amount must be greater than 0');
            if (this.views.balanceOf(this.msg.sender) < amount) throw new RangeError('Insufficient funds');
            this.storage.balances[this.msg.sender] -= amount;
            this.storage.balances[to] = (this.storage.balances[to] ?? 0) + amount;
            return true;
          },
          transferFrom(from: string, to: string, amount: number) {
            if (amount <= 0) throw new RangeError('Amount must be greater than 0');

            const allowance = this.views.allowance(from, this.msg.sender);
            if (allowance < amount) throw new RangeError('Insufficient allowance');

            if (this.views.balanceOf(from) < amount) throw new RangeError('Insufficient funds');
            this.storage.balances[from] -= amount;
            this.storage.balances[to] = (this.storage.balances[to] ?? 0) + amount;
            this.storage.allowances[from][this.msg.sender] -= amount;
            return true;
          },
          approve(spender: string, amount: number) {
            if (!this.storage.allowances[this.msg.sender]) this.storage.allowances[this.msg.sender] = {};
            this.storage.allowances[this.msg.sender][spender] = this.views.allowance(this.msg.sender, spender) + amount;
            return true;
          },
        },
      }),
    });
  },
};
