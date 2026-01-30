import { Contract, Wallet } from '../classes';
import { createContractCode } from '../classes/Contract';
import { Address, Amount, ChainError, TokenData, TokenId } from '../utils';

// Standard ERC-721 Contract
export default {
  createContract(
    owner: Wallet,
    options: {
      name: string;
      symbol: string;
    },
  ) {
    return new Contract({
      name: options.name,
      creator: owner,
      code: createContractCode({
        storage: {
          name: options.name,
          symbol: options.symbol,
          totalSupply: 0,
          tokenOwner: {} as Record<TokenId, Address>,
          tokenData: {} as Record<TokenId, TokenData>,
          ownerTokenCount: {} as Record<Address, Amount>,
          tokenApprovals: {} as Record<TokenId, Address>,
          operatorApprovals: {} as Record<Address, Record<Address, boolean>>,
        },
        views: {
          balanceOf(address: string) {
            return this.storage.ownerTokenCount[address] ?? 0;
          },
          ownerOf(tokenId: string) {
            const owner = this.storage.tokenOwner[tokenId];
            if (!owner) {
              throw new ChainError.NonExistentTokenError('Token ID does not exist');
            }
            return owner;
          },
          tokenData(tokenId: string) {
            const data = this.storage.tokenData[tokenId];
            if (!data) {
              throw new ChainError.NonExistentTokenError('Token ID does not exist');
            }
            return data;
          },
          name() {
            return this.storage.name;
          },
          symbol() {
            return this.storage.symbol;
          },
          getApproved(tokenId: string) {
            return this.storage.tokenApprovals[tokenId] ?? null;
          },
          isApprovedForAll(owner: string, operator: string) {
            return this.storage.operatorApprovals[owner]?.[operator] ?? false;
          },
        },
        functions: {
          mint(to: string, tokenId: string, data: string) {
            if (!data) {
              throw new ChainError.MissingDataError('Token data is required');
            }
            if (this.storage.tokenOwner[tokenId]) {
              throw new ChainError.DuplicatedTokenError('Token already minted');
            }
            this.storage.tokenOwner[tokenId] = to;
            this.storage.tokenData[tokenId] = data;
            this.storage.ownerTokenCount[to] = this.views.balanceOf(to) + 1;
            this.storage.totalSupply++;
          },
          transferFrom(from: string, to: string, tokenId: string) {
            const owner = this.views.ownerOf(tokenId);
            if (owner !== from) {
              throw new ChainError.OwnershipError('Not token owner');
            }
            if (!to || to === from || to === owner) {
              throw new ChainError.MissingDataError('To address is required');
            }
            const approvedAddress = this.storage.tokenApprovals[tokenId];
            const isOperator = this.views.isApprovedForAll(from, this.msg.sender);
            if (owner !== this.msg.sender && approvedAddress !== this.msg.sender && !isOperator) {
              throw new ChainError.OwnershipError('Not approved');
            }
            if (approvedAddress) {
              delete this.storage.tokenApprovals[tokenId];
            }
            this.storage.ownerTokenCount[from]--;
            this.storage.ownerTokenCount[to] = this.views.balanceOf(to) + 1;
            this.storage.tokenOwner[tokenId] = to;
          },
          approve(to: string, tokenId: string) {
            if (to === this.msg.sender) {
              throw new ChainError.OwnershipError('Cannot approve self');
            }
            const owner = this.views.ownerOf(tokenId);
            const isOperator = this.views.isApprovedForAll(owner, this.msg.sender);
            if (owner !== this.msg.sender && !isOperator) {
              throw new ChainError.OwnershipError('Not approved');
            }
            if (!to || to === owner) {
              throw new ChainError.MissingDataError('To address is required');
            }
            this.storage.tokenApprovals[tokenId] = to;
          },
          setApprovalForAll(operator: string, approved: boolean) {
            if (operator === this.msg.sender) {
              throw new ChainError.OwnershipError('Cannot approve self');
            }
            const owner = this.msg.sender;
            if (!this.storage.operatorApprovals[owner]) {
              this.storage.operatorApprovals[owner] = {};
            }
            this.storage.operatorApprovals[owner][operator] = approved;
          },
        },
      }),
    });
  },
};
