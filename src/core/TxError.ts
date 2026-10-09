import { DEFAULT_MESSAGES, formatMessage, type Messages } from '../config/messages';

export default class TxError extends Error {
  txHash?: string;

  notificationId: string;

  hash?: string;

  forkTxId?: string;

  txTakingTooLong?: boolean;

  constructor(
    message: Error | string,
    notificationId: string,
    txHash?: string,
    hash?: string,
    forkTxId?: string,
    messages: Messages = DEFAULT_MESSAGES,
  ) {
    super('Placeholder');
    this.name = 'TxError';
    const { errorMessage, txTakingTooLong, stack } = TxError.formErrorMessage(message, txHash, messages);
    if (stack) this.stack = stack;
    this.message = errorMessage;
    this.txTakingTooLong = txTakingTooLong;
    this.txHash = txHash;
    this.notificationId = notificationId;
    this.hash = hash;
    this.forkTxId = forkTxId;
  }

  private static formErrorMessage(err: Error | string, txHash: string | undefined, messages: Messages) {
    let errorMessage = messages.errorOccurred;
    let stack: string | undefined;
    if (err) {
      if (typeof err === 'string') errorMessage = err;
      if ((err as Error).message) {
        errorMessage = (err as Error).message;
        stack = (err as Error).stack;
      }
    }
    const errStack = (err as Error)?.stack || '';
    // MetaMask puts the rejection text in the stack: https://github.com/MetaMask/metamask-extension/issues/7160
    if (errorMessage.includes('User denied transaction signature') || errStack.includes('User denied transaction signature')) {
      errorMessage = messages.deniedTransaction;
    }
    if (errorMessage.includes('reverted')) {
      errorMessage = formatMessage(messages.revertedTransaction, { '%txhash': txHash });
    }
    const txTakingTooLong = errStack.includes('not mined within 50 blocks');
    return { errorMessage, txTakingTooLong, stack };
  }

  static getTxError(err: unknown, notificationId: string, messages?: Messages) {
    if (err instanceof TxError) return err;
    return new TxError(err as Error, notificationId, undefined, undefined, undefined, messages);
  }
}
