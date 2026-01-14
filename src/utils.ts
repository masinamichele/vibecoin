import config from './config';

export const currency = (amount: number) => {
  return `${config.CurrencySymbol}${amount.toFixed(10)}`;
};

export const cleanKey = (key: string) => key.replaceAll('\n', '').replaceAll(/-----(?:BEGIN|END) P\w+? KEY-----/g, '');
export const restoreKey = (key: string, type: 'PUBLIC' | 'PRIVATE') => {
  return [`-----BEGIN ${type} KEY-----`, ...key.match(/.{1,64}/g), `-----END ${type} KEY-----`].join('\n');
};
