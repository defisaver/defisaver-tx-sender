/** User-visible strings. Override any of them via `TxSenderConfig.messages`. */
export interface Messages {
  errorOccurred: string;
  userCanceled: string;
  deniedTransaction: string;
  revertedTransaction: string; // `%txhash` placeholder
  wrongNetwork: string; // `%network` placeholder
  gasPriceVeryHigh: string; // `%gasPrice` placeholder
  confirmTransaction: string;
  txSent: string; // `%txHash` placeholder
  txConfirmed: string; // `%txHash` placeholder
  approve: string;
  removeApproval: string;
  for: string;
  smartWallet: string;
  createSmartWallet: string;
  viewOnlyMode: string;
}

export const DEFAULT_MESSAGES: Messages = {
  errorOccurred: 'Error occurred',
  userCanceled: 'User canceled the transaction',
  deniedTransaction: "You've denied the transaction",
  revertedTransaction: 'Transaction has been reverted due to an error. Transaction hash: %txhash',
  wrongNetwork: 'Wrong network - please switch your wallet to %network',
  gasPriceVeryHigh: 'Selected gas price (%gasPrice Gwei) may be unnecessarily high. Are you sure you want to continue?',
  confirmTransaction: 'Please confirm your transaction.',
  txSent: 'Transaction %txHash has been created and is currently pending.',
  txConfirmed: 'Transaction %txHash completed.',
  approve: 'Approve',
  removeApproval: 'Remove approval',
  for: 'for',
  smartWallet: 'Smart Wallet',
  createSmartWallet: 'Create Smart Wallet',
  viewOnlyMode: 'You are connected in view-only mode. Connect your wallet to send transactions.',
};

export const formatMessage = (template: string, params: Record<string, string | number | undefined> = {}) => Object.entries(params).reduce((acc, [key, value]) => acc.split(key).join(String(value ?? '')), template);
