import { Contract, Wallet } from '../classes';
import { ChainError } from '../utils';

export default {
  createContract(owner: Wallet) {
    return new Contract({
      name: 'Counter',
      creator: owner,
      code: {
        storage: { count: 0, owner: null },
        functions: {
          __init__() {
            this.storage.owner = this.msg.sender;
          },
          increment(amount = 1) {
            if (this.msg.sender !== this.storage.owner) {
              throw new ChainError.OwnershipError('Only the owner can change the counter');
            }
            this.storage.count += amount;
          },
          get() {
            return this.storage.count;
          },
        },
      },
    });
  },
};
