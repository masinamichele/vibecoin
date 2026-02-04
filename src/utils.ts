import config from '#config';

export const currency = (amount: number) => {
  const nf = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: config.Decimals,
    maximumFractionDigits: config.Decimals,
  });
  return `${config.CurrencySymbol}${nf.format(amount)}`;
};

export const cleanKey = (key: string) => key.replaceAll('\n', '').replaceAll(/-----(?:BEGIN|END) P\w+? KEY-----/g, '');
export const restoreKey = (key: string, type: 'PUBLIC' | 'PRIVATE') => {
  return [`-----BEGIN ${type} KEY-----`, ...key.match(/.{1,64}/g), `-----END ${type} KEY-----`].join('\n');
};

const LogTags = <const>['main', 'chain', 'wallet', 'tx', 'block', 'contract'];
const getLogTag = (tag: (typeof LogTags)[number]) => {
  const longest = Math.max(...LogTags.map((t) => t.length));
  const index = LogTags.indexOf(tag);
  return { text: `${config.LogTag}:${tag.padEnd(longest, ' ')}`, index };
};
const logTimes = new Map<string, number>();
export const getLogger = (tag: (typeof LogTags)[number]) => {
  const { text, index } = getLogTag(tag);
  return (...items: any[]) => {
    const lastCallTime = logTimes.get(tag);
    const now = Date.now();
    const offset = lastCallTime ? now - lastCallTime : 0;
    logTimes.set(tag, now);
    return console.log(`\x1b[1;3${index + 1}m${text}\x1b[0m`, ...items, `\x1b[2;3${index + 1}m+${offset}ms\x1b[0m`);
  };
};
