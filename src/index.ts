import { Blockchain, Transaction, Wallet } from './classes';
import config from './config';
import { currency, getDebug } from './utils';

import Counter from './contracts/Counter.contract';

const debug = getDebug('main');

console.clear();
console.log(`${config.CurrencySymbol} ${config.CurrencyName} Blockchain`);
console.log();

(async () => {
  const chain = new Blockchain({ difficulty: config.BlockchainDifficulty });
  await chain.init();

  const alice = new Wallet({ name: 'Alice' });
  const bob = new Wallet({ name: 'Bob' });
  const eve = new Wallet({ name: 'Eve' });

  const t1 = new Transaction({ from: chain.faucet, to: alice, amount: 100 });
  await chain.addTransaction(t1);
  const t2 = new Transaction({ from: chain.faucet, to: bob, amount: 100 });
  await chain.addTransaction(t2);
  await chain.minePendingTransactions(eve);

  const counter = Counter.createContract(alice);
  await chain.deployContract(counter);
  await chain.minePendingTransactions(eve);
  await chain.$(alice, counter, 'increment');
  await chain.$(bob, counter, 'increment');
  await chain.minePendingTransactions(eve);
  console.log(counter.getSnapshot());

  debug(`Total: ${currency(chain.getTotalSupply())}`);
  debug(`Available: ${currency(chain.getBalance(chain.faucet))}`);
  debug(`Circulating: ${currency(chain.getCirculatingSupply())}`);
  debug(`Drained: ${currency(chain.getDrainedAmount())}`);
})();
