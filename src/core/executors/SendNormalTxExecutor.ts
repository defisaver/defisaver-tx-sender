import { formatMessage } from '../../config/messages';
import { formatTxHash } from '../../services/utils';
import { AccountType, type TxReceipt } from '../../types';
import type { EncoderSendRet, ExecutionResult, FinalTxParams } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import TxError from '../TxError';
import { ExecutorBase } from './ExecutorBase';
import SendTxSaverTxExecutor from './SendTxSaverTxExecutor';

/** Encode → confirm → send → wait for receipt. Used for EOA, 1/1 Safe, DSProxy, DSA and Summer.fi txs. */
export default class SendNormalTxExecutor extends ExecutorBase {
  protected async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const {
      notifier, encoder, tx, txUtils, env,
    } = context;
    const encoding = await encoder.encodeTx() as EncoderSendRet;

    let txParams: FinalTxParams;
    if (env.accountType === AccountType.GnosisSafe) {
      // Connected through a Safe app: the Safe UI handles gas, skip our confirm dialog.
      const { gasPrice: _gasPrice, ...rest } = encoding.txParams;
      txParams = rest;
    } else {
      const txSaverData = await this.getTxSaverData(context, encoding);
      const confirmation = await notifier.getConfirmationSend(encoding, txSaverData);
      if (confirmation.failed) return confirmation;
      if (confirmation.isTxSaver) return new SendTxSaverTxExecutor().executeWithConfirmation(context, confirmation);
      txParams = await txUtils.createTxParams(tx, encoding, confirmation);
    }

    notifier.addNotificationSend(env.config.messages.confirmTransaction);
    return txUtils.executeTx(
      { ...txParams, addSuffix: tx.addSuffix },
      this.onTxHash(context),
      this.onReceipt(context),
      this.onError(context),
    );
  }

  private onTxHash(context: ExecutionContext) {
    const { tx, notifier, env } = context;
    return async (txHash: string) => {
      await env.config.hooks.onTxHash?.(txHash, tx);
      notifier.changeNotificationOnTxHash(formatMessage(env.config.messages.txSent, { '%txHash': formatTxHash(txHash) }), txHash);
      tx.onTxHashCallback(txHash);
    };
  }

  private onReceipt(context: ExecutionContext) {
    const {
      tx, notifier, env, txUtils,
    } = context;
    return async (receipt: TxReceipt, initialTxHash: string) => {
      const {
        transactionHash, events, status, gasUsed, txId: forkTxId,
      } = receipt;
      if ((events && events.Failure) || !status) {
        throw txUtils.revertedError(notifier.getNotificationId(), initialTxHash, transactionHash, forkTxId);
      }
      const eventData = await txUtils.getEventData(receipt, tx, env.network);
      notifier.changeNotificationOnReceipt(
        formatMessage(env.config.messages.txConfirmed, { '%txHash': formatTxHash(transactionHash) }),
        gasUsed, eventData, forkTxId, transactionHash,
      );
      env.config.hooks.onTxMined?.(transactionHash, tx);
    };
  }

  private onError(context: ExecutionContext) {
    return async (err: unknown, initialTxHash: string) => {
      context.env.config.logger.error('Transaction failed', { error: err });
      const forkTxId = (err as { receipt?: { txId?: string } })?.receipt?.txId;
      return new TxError(err as Error, context.notifier.getNotificationId(), initialTxHash, initialTxHash, forkTxId, context.env.config.messages);
    };
  }
}
