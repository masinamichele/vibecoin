import config from './config';

export const currency = (amount: number) => {
  const nf = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 10,
    maximumFractionDigits: 10,
  });
  return `${config.CurrencySymbol}${nf.format(amount)}`;
};

export const cleanKey = (key: string) => key.replaceAll('\n', '').replaceAll(/-----(?:BEGIN|END) P\w+? KEY-----/g, '');
export const restoreKey = (key: string, type: 'PUBLIC' | 'PRIVATE') => {
  return [`-----BEGIN ${type} KEY-----`, ...key.match(/.{1,64}/g), `-----END ${type} KEY-----`].join('\n');
};

const LogTags = <const>['main', 'chain', 'wallet', 'tx', 'block'];
const getLogTag = (tag: (typeof LogTags)[number]) => {
  const longest = Math.max(...LogTags.map((t) => t.length));
  return `${config.LogTag}:${tag.padEnd(longest, ' ')}`;
};
export const getDebug = (tag: (typeof LogTags)[number]) => require('debug')(getLogTag(tag));
