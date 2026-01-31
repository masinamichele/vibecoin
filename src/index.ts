import { Blockchain, Transaction, Wallet } from './classes';
import config from './config';
import { currency, getDebug } from './utils';
import Token from './contracts/Token.contract';
import Nft from './contracts/Nft.contract';

const debug = getDebug('main');

console.clear();
console.log(`${config.CurrencySymbol} ${config.CurrencyName} Blockchain`);
console.log();

(async () => {
  /**
   * Blockchain initialization
   */

  const chain = new Blockchain.ProofOfStake();
  await chain.init();

  /**
   * Wallets creation
   */

  const alice = new Wallet({ name: 'Alice' });
  const bob = new Wallet({ name: 'Bob' });
  const charlie = new Wallet({ name: 'Charlie' });

  /**
   * Basic funding transactions
   */

  const t1 = new Transaction({ from: chain.faucet, to: alice, amount: 100 });
  await chain.addTransaction(t1);
  const t2 = new Transaction({ from: chain.faucet, to: bob, amount: 100 });
  await chain.addTransaction(t2);
  const t3 = new Transaction({ from: chain.faucet, to: charlie, amount: 100 });
  await chain.addTransaction(t3);
  await chain.createBlock();

  /**
   * Stake transaction
   */

  await chain.stake(alice, 50);
  await chain.createBlock();

  /**
   * ERC-20 (fungible token) contract usage
   */

  const vibeToken = Token.createContract(alice, {
    name: 'VibeToken',
    symbol: 'VTK',
    decimals: 10,
    totalSupply: 500,
  });
  await chain.deployContract(vibeToken);
  await chain.createBlock();

  await chain.$(alice, vibeToken)('transfer')(bob.address, 10);
  await chain.$(bob, vibeToken)('approve')(charlie.address, 50);
  await chain.$(charlie, vibeToken)('transferFrom')(bob.address, alice.address, 5);
  await chain.createBlock();
  // console.log(vibeToken.getReadonlyStorageSnapshot());

  /**
   * ERC-721 (non-fungible token) contract usage
   */

  const nft = Nft.createContract(alice, {
    name: 'VibeNFT',
    symbol: 'VTX',
    mintPrice: 10,
    beneficiary: charlie,
  });
  await chain.deployContract(nft);
  await chain.createBlock();

  await chain.$(alice, nft)('mint', { value: 10 })(alice.address, 'nft-001', 'Hello, World!');
  await chain.$(alice, nft)('approve')(bob.address, 'nft-001');
  await chain.$(bob, nft)('transferFrom')(alice.address, charlie.address, 'nft-001');
  await chain.$(charlie, nft)('setApprovalForAll')(alice.address, true);
  await chain.$(alice, nft)('transferFrom')(charlie.address, bob.address, 'nft-001');
  await chain.createBlock();
  // console.log(nft.getReadonlyStorageSnapshot());

  debug(`Total: ${currency(chain.getTotalSupply())}`);
  debug(`Available: ${currency(chain.getBalance(chain.faucet))}`);
  debug(`Circulating: ${currency(chain.getCirculatingSupply())}`);
  debug(`Drained: ${currency(chain.getDrainedAmount())}`);
})();
