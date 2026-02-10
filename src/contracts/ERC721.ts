import { Contract, type Wallet, code, type Nft } from '#classes';
import type { Address, Amount, TokenData, TokenId } from '#types';
import { ChainError } from '#errors';

// Standard ERC-721 contract, including EIP-2981 and EIP-4907
export const ERC721 = {
  new(
    owner: Wallet,
    options: {
      name: string;
      symbol: string;
      mintPrice: number;
      beneficiary: Wallet;
      royaltyFraction: number;
    },
  ) {
    return new Contract({
      name: options.name,
      creator: owner,
      ...code({
        storage: {
          name: options.name,
          symbol: options.symbol,
          mintPrice: options.mintPrice,
          beneficiary: options.beneficiary,
          royaltyFraction: options.royaltyFraction,
          totalSupply: 0,
          tokenOwner: {} as Record<TokenId, Address>,
          tokenData: {} as Record<TokenId, TokenData>,
          ownerTokenCount: {} as Record<Address, Amount>,
          tokenApprovals: {} as Record<TokenId, Address>,
          operatorApprovals: {} as Record<Address, Record<Address, boolean>>,
          tokenUsers: {} as Record<TokenId, Address>,
          userExpires: {} as Record<TokenId, number>,
        },
        views: {
          balanceOf(address: string) {
            return this.storage.ownerTokenCount[address] ?? 0;
          },
          ownerOf(tokenId: TokenId) {
            const owner = this.storage.tokenOwner[tokenId];
            if (!owner) throw new ChainError.NonExistentToken();
            return owner;
          },
          tokenData(tokenId: TokenId) {
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
          getApproved(tokenId: TokenId) {
            return this.storage.tokenApprovals[tokenId] ?? null;
          },
          isApprovedForAll(owner: string, operator: string) {
            return this.storage.operatorApprovals[owner]?.[operator] ?? false;
          },
          royaltyInfo(tokenId: TokenId, salePrice: number) {
            const owner = this.storage.tokenOwner[tokenId];
            if (!owner) throw new ChainError.NonExistentToken();
            return {
              receiver: this.storage.beneficiary.address,
              royaltyAmount: salePrice * this.storage.royaltyFraction,
            };
          },
          userOf(tokenId: TokenId) {
            const expires = this.storage.userExpires[tokenId];
            if (!expires || expires < Date.now()) return null;
            return this.storage.tokenUsers[tokenId] ?? null;
          },
          userExpires(tokenId: TokenId) {
            return this.storage.userExpires[tokenId] ?? null;
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
          transferFrom(from: string, to: string, tokenId: string) {
            const owner = this.views.ownerOf(tokenId);
            if (owner !== from) throw new ChainError.Ownership();
            if (!to) throw new ChainError.MissingData();
            if (to === from || to === owner) throw new ChainError.InvalidData();
            const approvedAddress = this.storage.tokenApprovals[tokenId];
            const isOperator = this.views.isApprovedForAll(from, this.msg.sender);
            if (owner !== this.msg.sender && approvedAddress !== this.msg.sender && !isOperator) {
              throw new ChainError.Ownership();
            }
            if (approvedAddress) {
              delete this.storage.tokenApprovals[tokenId];
            }
            this.storage.ownerTokenCount[from]--;
            this.storage.ownerTokenCount[to] = this.views.balanceOf(to) + 1;
            this.storage.tokenOwner[tokenId] = to;
          },
          approve(to: string, tokenId: string) {
            if (to === this.msg.sender) throw new ChainError.Ownership();
            const owner = this.views.ownerOf(tokenId);
            const isOperator = this.views.isApprovedForAll(owner, this.msg.sender);
            if (owner !== this.msg.sender && !isOperator) throw new ChainError.Ownership();
            if (!to) throw new ChainError.MissingData();
            if (to === owner) throw new ChainError.InvalidData();
            this.storage.tokenApprovals[tokenId] = to;
          },
          setApprovalForAll(operator: string, approved: boolean) {
            if (operator === this.msg.sender) throw new ChainError.Ownership();
            const owner = this.msg.sender;
            if (!this.storage.operatorApprovals[owner]) {
              this.storage.operatorApprovals[owner] = {};
            }
            this.storage.operatorApprovals[owner][operator] = approved;
          },
          setUser(user: Wallet, expires: number, tokenId: string) {
            const owner = this.views.ownerOf(tokenId);
            const approvedAddress = this.storage.tokenApprovals[tokenId];
            const isOperator = this.views.isApprovedForAll(owner, this.msg.sender);
            if (owner !== this.msg.sender && approvedAddress !== this.msg.sender && !isOperator) {
              throw new ChainError.Ownership();
            }
            this.storage.tokenUsers[tokenId] = user.address;
            this.storage.userExpires[tokenId] = expires;
          },
        },
      }),
    });
  },
};
