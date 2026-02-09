import { Contract, type Wallet, createContractCode } from '#classes';
import type { Address, Amount } from '#types';
import { ChainError } from '#errors';

export default {
  new(
    owner: Wallet,
    options: {
      name: string;
      symbol: string;
      decimals: number;
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
          totalSupply: 0,
          balances: {} as Record<Address, Amount>,
          allowances: {} as Record<Address, Record<Address, Amount>>,
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
          mint(to: string, amount: number) {
            if (this.msg.sender !== this.creator.address) throw new ChainError.Ownership();
            if (amount <= 0) throw new ChainError.InvalidData();
            if (!to) throw new ChainError.MissingData();
            this.storage.totalSupply += amount;
            this.storage.balances[to] = this.views.balanceOf(to) + amount;
            return true;
          },
          transfer(to: string, amount: number) {
            if (amount <= 0) throw new ChainError.InvalidAmount();
            if (this.views.balanceOf(this.msg.sender) < amount) throw new ChainError.InsufficientFunds();
            this.storage.balances[this.msg.sender] -= amount;
            this.storage.balances[to] = (this.storage.balances[to] ?? 0) + amount;
            return true;
          },
          transferFrom(from: string, to: string, amount: number) {
            if (amount <= 0) throw new ChainError.InvalidAmount();

            const allowance = this.views.allowance(from, this.msg.sender);
            if (allowance < amount) throw new ChainError.InsufficientFunds();

            if (this.views.balanceOf(from) < amount) throw new ChainError.InsufficientFunds();
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
