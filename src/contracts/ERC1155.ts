import { code, Contract, Wallet } from '#classes';
import { Address, Amount, TokenId } from '#types';
import { hash } from 'node:crypto';
import { ChainError } from '#errors';

// Standard ERC-1155 contract
export const ERC1155 = {
  new(owner: Wallet, options: { name: string; tokens: { name: string; isNft: boolean; supply: number }[] }) {
    return new Contract({
      name: options.name,
      creator: owner,
      ...code({
        storage: {
          tokenData: {} as Record<TokenId, string>,
          isNft: {} as Record<TokenId, boolean>,
          totalSupply: {} as Record<TokenId, Amount>,
          balances: {} as Record<TokenId, Record<Address, Amount>>,
          operatorApprovals: {} as Record<Address, Record<Address, boolean>>,
        },
        views: {
          tokenData(tokenId: TokenId) {
            const data = this.storage.tokenData[tokenId];
            if (!data) throw new ChainError.NonExistentToken();
            return data;
          },
          balanceOf(owner: Address, tokenId: TokenId) {
            if (!this.storage.tokenData[tokenId]) throw new ChainError.NonExistentToken();
            return this.storage.balances[tokenId]?.[owner] ?? 0;
          },
          balanceOfBatch(owners: Address[], tokenIds: TokenId[]) {
            if (owners.length != tokenIds.length) throw new ChainError.InvalidData();
            return owners.map((owner, i) => {
              const tokenId = tokenIds[i];
              if (!this.storage.tokenData[tokenId]) throw new ChainError.NonExistentToken();
              return this.storage.balances[tokenId]?.[owner] ?? 0;
            });
          },
          isApprovedForAll(owner: string, operator: string) {
            return this.storage.operatorApprovals[owner]?.[operator] ?? false;
          },
        },
        functions: {
          __init__() {
            for (const def of options.tokens) {
              const tokenId = hash('sha256', def.name);
              if (this.storage.tokenData[tokenId]) throw new ChainError.DuplicatedToken();
              this.storage.tokenData[tokenId] = def.name;
              this.storage.isNft[tokenId] = def.isNft;
              this.storage.totalSupply[tokenId] = def.supply;
              this.storage.balances[tokenId] = {
                [this.creator.address]: def.supply,
              };
            }
            this.emit('TransferBatch', {
              operator: null,
              from: null,
              to: this.creator.address,
              ids: options.tokens.map((t) => hash('sha256', t.name)),
              values: options.tokens.map((t) => t.supply),
            });
          },
          setApprovalForAll(operator: string, approved: boolean) {
            if (operator === this.msg.sender) throw new ChainError.Ownership();
            const owner = this.msg.sender;
            if (!this.storage.operatorApprovals[owner]) {
              this.storage.operatorApprovals[owner] = {};
            }
            this.storage.operatorApprovals[owner][operator] = approved;
            this.emit('ApprovalForAll', { account: owner, operator, approved });
          },
          safeTransferFrom(from: Address, to: Address, tokenId: TokenId, amount: Amount) {
            if (!to) throw new ChainError.MissingData();
            if (to === from) throw new ChainError.InvalidData();
            const isOperator = this.views.isApprovedForAll(from, this.msg.sender);
            if (from !== this.msg.sender && !isOperator) throw new ChainError.Ownership();
            if (!this.storage.tokenData[tokenId]) throw new ChainError.NonExistentToken();
            if (amount < 0) throw new ChainError.InvalidAmount();
            if ((this.storage.balances[tokenId]?.[from] ?? 0) < amount) throw new ChainError.InsufficientFunds();
            if (this.storage.isNft[tokenId] && amount !== 1) throw new ChainError.InvalidAmount();
            this.storage.balances[tokenId][from] -= amount;
            this.storage.balances[tokenId][to] = this.views.balanceOf(to, tokenId) + amount;
            this.emit('TransferSingle', {
              operator: this.msg.sender,
              from,
              to,
              id: tokenId,
              value: amount,
            });
          },
          safeBatchTransferFrom(from: Address, to: Address, tokenIds: TokenId[], amounts: Amount[]) {
            if (!to) throw new ChainError.MissingData();
            if (to === from) throw new ChainError.InvalidData();
            const isOperator = this.views.isApprovedForAll(from, this.msg.sender);
            if (from !== this.msg.sender && !isOperator) throw new ChainError.Ownership();
            if (tokenIds.length !== amounts.length) throw new ChainError.InvalidData();
            for (let i = 0; i < tokenIds.length; i++) {
              const tokenId = tokenIds[i];
              const amount = amounts[i];
              if (!this.storage.tokenData[tokenId]) throw new ChainError.NonExistentToken();
              if (amount < 0) throw new ChainError.InvalidAmount();
              if ((this.storage.balances[tokenId]?.[from] ?? 0) < amount) throw new ChainError.InsufficientFunds();
              if (this.storage.isNft[tokenId] && amount !== 1) throw new ChainError.InvalidAmount();
            }
            for (let i = 0; i < tokenIds.length; i++) {
              const tokenId = tokenIds[i];
              const amount = amounts[i];
              this.storage.balances[tokenId][from] -= amount;
              this.storage.balances[tokenId][to] = this.views.balanceOf(to, tokenId) + amount;
            }
            this.emit('TransferBatch', {
              operator: this.msg.sender,
              from,
              to,
              ids: tokenIds,
              values: amounts,
            });
          },
        },
      }),
    });
  },
};
