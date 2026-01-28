export default {
  // Currency configuration
  CurrencyName: 'Vibecoin',
  CurrencyCode: 'VIBE',
  CurrencySymbol: 'Ꝟ',
  // Wallet configuration
  FaucetName: 'Ꝟibe',
  DrainName: 'Ꝟoid',
  // Blockchain configuration
  BlockchainDifficulty: 5,
  MaxPendingTransactions: 10,
  AutoMineDelaySeconds: 10,
  GenesisCoinsAmount: 1_000,
  // Transaction configuration
  RewardPerMinedTransaction: 0.1,
  FixedTransactionFee: 0.05,
  DefaultFeePercentage: 0.01,
  // Block mining configuration
  BlockMinerPoolSize: 10,
  MaxBlockNonce: 10_000_000,
  // Contract configuration
  ContractDeployBaseFee: 1,
  ContractDeployPerByteFee: 0.001,
  GasPrice: 0.000001,
  DefaultGasLimit: 1_000_000,
  MaxGasLimit: 10_000_000,
  GasCostContractCall: 21_000,
  GasCostStorageRead: 200,
  GasCostStorageWrite: 5_000,
  // Misc configuration
  LogTag: 'vibe',
  AddressFormat: 'ascii' as BufferEncoding,
};
