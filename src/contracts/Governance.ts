import { code, Contract, Wallet } from '#classes';
import { ChainError } from '#errors';
import { Address } from '#types';

type Proposal = {
  id: number;
  target: Wallet;
  isAddition: boolean;
  votes: Address[];
  executed: boolean;
};

export const Governance = {
  new(owner: Wallet, options: { initialAuthorities: Wallet[] }) {
    return new Contract({
      name: 'Governance',
      creator: owner,
      ...code({
        storage: {
          authorities: [] as Wallet[],
          isAuthority: {} as Record<Address, boolean>,
          proposals: {} as Record<number, Proposal>,
          nextProposalId: 0,
        },
        views: {
          getAuthorities() {
            return this.storage.authorities;
          },
          isAuthority(address: Address) {
            return this.storage.isAuthority[address] ?? false;
          },
          getProposal(id: number) {
            const proposal = this.storage.proposals[id];
            if (!proposal) throw new ChainError.MissingData();
            return proposal;
          },
        },
        functions: {
          __init__() {
            this.storage.authorities = options.initialAuthorities;
            for (const wallet of options.initialAuthorities) {
              this.storage.isAuthority[wallet.address] = true;
            }
          },
          propose(target: Wallet, isAddition: boolean) {
            if (!this.views.isAuthority(this.msg.sender)) throw new ChainError.Unauthorized();
            const targetIsAlreadyAuthority = this.views.isAuthority(target.address);
            if (isAddition && targetIsAlreadyAuthority) throw new ChainError.InvalidData();
            if (!isAddition && !targetIsAlreadyAuthority) throw new ChainError.InvalidData();
            const proposalId = this.storage.nextProposalId;
            this.storage.proposals[proposalId] = { id: proposalId, target, isAddition, votes: [], executed: false };
            this.storage.nextProposalId++;
            this.emit('ProposalCreated', {
              proposalId,
              proposer: this.msg.sender,
              target: target.address,
              isAddition,
            });
            return proposalId;
          },
          vote(proposalId: number) {
            if (!this.views.isAuthority(this.msg.sender)) throw new ChainError.Unauthorized();
            const proposal = this.views.getProposal(proposalId);
            if (proposal.executed) throw new ChainError.InvalidData();
            if (proposal.votes.includes(this.msg.sender)) throw new ChainError.Unauthorized();
            proposal.votes.push(this.msg.sender);
            this.emit('VoteCast', {
              proposalId,
              voter: this.msg.sender,
            });
          },
          execute(proposalId: number) {
            const proposal = this.views.getProposal(proposalId);
            if (proposal.executed) throw new ChainError.InvalidData();
            const requiredVotes = Math.floor(this.storage.authorities.length / 2) + 1;
            if (proposal.votes.length < requiredVotes) throw new ChainError.InvalidAmount();
            if (proposal.isAddition) {
              this.storage.authorities.push(proposal.target);
              this.storage.isAuthority[proposal.target.address] = true;
              this.emit('AuthorityAdded', { addedAuthority: proposal.target.address });
            } else {
              const index = this.storage.authorities.indexOf(proposal.target);
              if (index === -1) throw new ChainError.InvalidData();
              this.storage.authorities.splice(index, 1);
              delete this.storage.isAuthority[proposal.target.address];
              this.emit('AuthorityRemoved', { removedAuthority: proposal.target.address });
            }
            proposal.executed = true;
            this.emit('ProposalExecuted', { proposalId });
          },
        },
      }),
    });
  },
};
