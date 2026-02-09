import { Contract, type Wallet, createContractCode, type Nft } from '#classes';
import type { Address, Amount, TokenData, TokenId } from '#types';
import { ChainError } from '#errors';

export default {
  new(
    owner: Wallet,
    options: {
      name: string;
      symbol: string;
      mintPrice: number;
      beneficiary: Wallet;
    },
  ) {
    return new Contract({
      name: options.name,
      creator: owner,
      code: createContractCode({
        storage: {
          name: options.name,
          symbol: options.symbol,
          mintPrice: options.mintPrice,
          beneficiary: options.beneficiary,
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
            if (!owner) throw new ChainError.NonExistentToken();
            return owner;
          },
          tokenData(tokenId: string) {
            const data = this.storage.tokenData[tokenId];
            if (!data) throw new ChainError.NonExistentToken();
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
          mint(to: string, nft: Nft) {
            if (!nft.data) throw new ChainError.MissingData();
            if (this.storage.tokenOwner[nft.id]) throw new ChainError.DuplicatedToken();
            if (this.msg.value < this.storage.mintPrice) throw new ChainError.InsufficientFunds();
            this.storage.tokenOwner[nft.id] = to;
            this.storage.tokenData[nft.id] = nft.data;
            this.storage.ownerTokenCount[to] = this.views.balanceOf(to) + 1;
            this.storage.totalSupply++;

            const isSenderBeneficiary = this.msg.sender === this.storage.beneficiary.address;
            const feeRecipient = isSenderBeneficiary ? this.env.drain : this.storage.beneficiary;
            return { transfer: { to: feeRecipient, amount: this.msg.value } };
          },
          transferFrom(from: string, to: string, nft: Nft) {
            const owner = this.views.ownerOf(nft.id);
            if (owner !== from) throw new ChainError.Ownership();
            if (!to) throw new ChainError.MissingData();
            if (to === from || to === owner) throw new ChainError.InvalidData();
            const approvedAddress = this.storage.tokenApprovals[nft.id];
            const isOperator = this.views.isApprovedForAll(from, this.msg.sender);
            if (owner !== this.msg.sender && approvedAddress !== this.msg.sender && !isOperator) {
              throw new ChainError.Ownership();
            }
            if (approvedAddress) {
              delete this.storage.tokenApprovals[nft.id];
            }
            this.storage.ownerTokenCount[from]--;
            this.storage.ownerTokenCount[to] = this.views.balanceOf(to) + 1;
            this.storage.tokenOwner[nft.id] = to;
          },
          approve(to: string, nft: Nft) {
            if (to === this.msg.sender) throw new ChainError.Ownership();
            const owner = this.views.ownerOf(nft.id);
            const isOperator = this.views.isApprovedForAll(owner, this.msg.sender);
            if (owner !== this.msg.sender && !isOperator) throw new ChainError.Ownership();
            if (!to) throw new ChainError.MissingData();
            if (to === owner) throw new ChainError.InvalidData();
            this.storage.tokenApprovals[nft.id] = to;
          },
          setApprovalForAll(operator: string, approved: boolean) {
            if (operator === this.msg.sender) throw new ChainError.Ownership();
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
