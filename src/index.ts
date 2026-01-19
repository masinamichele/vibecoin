import { Blockchain, Transaction, Wallet } from './classes';
import config from './config';
import { currency, getDebug } from './utils';

const debug = getDebug('main');

console.clear();
console.log(`${config.CurrencySymbol} ${config.CurrencyName} Blockchain`);
console.log();

(async () => {
  const chain = new Blockchain({ difficulty: config.BlockchainDifficulty });
  await chain.init();

  const alice = new Wallet({ name: 'Alice' });
  const bob = new Wallet({ name: 'Bob' });

  const t1 = new Transaction({ from: chain.treasury, to: alice, amount: 1 });
  await chain.addTransaction(t1);

  await chain.minePendingTransactions(bob);

  debug(`Total: ${currency(chain.getTotalSupply())}`);
  debug(`Available: ${currency(chain.getBalance(chain.treasury))}`);
  debug(`Circulating: ${currency(chain.getCirculatingSupply())}`);
  debug(`Burnt: ${currency(chain.getBurnedAmount())}`);
})();
