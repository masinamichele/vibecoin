import { Blockchain, Transaction, Wallet } from './classes';
import config from './config';
import { currency, getDebug } from './utils';
import Token from './contracts/Token.contract';

const debug = getDebug('main');

console.clear();
console.log(`${config.CurrencySymbol} ${config.CurrencyName} Blockchain`);
console.log();

(async () => {
  const chain = new Blockchain({ difficulty: config.BlockchainDifficulty });
  await chain.init();

  const alice = new Wallet({ name: 'Alice' });
  const bob = new Wallet({ name: 'Bob' });
  const charlie = new Wallet({ name: 'Charlie' });
  const eve = new Wallet({ name: 'Eve' });

  const t1 = new Transaction({ from: chain.faucet, to: alice, amount: 100 });
  await chain.addTransaction(t1);
  const t2 = new Transaction({ from: chain.faucet, to: bob, amount: 100 });
  await chain.addTransaction(t2);
  const t3 = new Transaction({ from: chain.faucet, to: charlie, amount: 100 });
  await chain.addTransaction(t3);
  await chain.minePendingTransactions(eve);

  // const counter = Counter.createContract(alice);
  // await chain.deployContract(counter);
  // await chain.minePendingTransactions(eve);
  // await chain.$(alice, counter)('increment')();
  // await chain.$(bob, counter)('increment')();
  // await chain.minePendingTransactions(eve);
  // console.log(counter);

  const vibeToken = Token.createContract(alice, {
    name: 'VibeToken',
    symbol: 'VTK',
    decimals: 10,
    totalSupply: 500,
  });
  await chain.deployContract(vibeToken);
  await chain.minePendingTransactions(eve);
  // console.log(vibeToken.getSnapshot().balances[alice.address]);
  // console.log(vibeToken.getSnapshot().balances[bob.address]);
  // console.log(vibeToken.getSnapshot().balances[charlie.address]);
  // await chain.$(alice, vibeToken)('transfer')(bob.address, 10);
  // await chain.minePendingTransactions(eve);
  // console.log(vibeToken.getSnapshot().balances[alice.address]);
  // console.log(vibeToken.getSnapshot().balances[bob.address]);
  // console.log(vibeToken.getSnapshot().balances[charlie.address]);
  // await chain.$(bob, vibeToken)('approve')(charlie.address, 50);
  // await chain.minePendingTransactions(eve);
  // await chain.$(charlie, vibeToken)('transferFrom')(bob.address, alice.address, 5);
  // await chain.minePendingTransactions(eve);
  // console.log(vibeToken.getSnapshot().balances[alice.address]);
  // console.log(vibeToken.getSnapshot().balances[bob.address]);
  // console.log(vibeToken.getSnapshot().balances[charlie.address]);

  debug(`Total: ${currency(chain.getTotalSupply())}`);
  debug(`Available: ${currency(chain.getBalance(chain.faucet))}`);
  debug(`Circulating: ${currency(chain.getCirculatingSupply())}`);
  debug(`Drained: ${currency(chain.getDrainedAmount())}`);
})();
