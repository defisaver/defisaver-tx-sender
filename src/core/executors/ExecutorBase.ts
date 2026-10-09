import { isSafeWallet } from '../../services/safe';
import { getProxyWalletByAddress } from '../../services/wallets';
import {
  AccountType, ExecutionType, type GasEstimate, type TxSaverModalData,
} from '../../types';
import type { EncodingReturnType } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import TxError from '../TxError';
import { AbstractExecutor } from './AbstractExecutor';

/** Error handling and TxSaver eligibility shared by all concrete executors. */
export abstract class ExecutorBase extends AbstractExecutor {
  protected async handleError(err: unknown, context: ExecutionContext): Promise<TxError> {
    const { notifier, env } = context;
    const { api, logger, messages } = env.config;
    const txError = TxError.getTxError(err, notifier.getNotificationId(), messages);
    const isFork = env.accountType === AccountType.Fork;

    notifier.changeNotificationOnError(txError.message, !isFork, txError.txTakingTooLong, txError.forkTxId);
    if (txError.hash && !txError.txTakingTooLong && !isFork) {
      try {
        const dfeData = await api.getTxErrorData(txError.hash);
        notifier.changeNotificationOnErrorOnDfeData(txError.message, false, dfeData);
      } catch (e) {
        logger.captureException?.(e, { type: 'getTxErrorData', hash: txError.hash });
      }
    }
    return txError;
  }

  /** TxSaver is offered for zero-value Safe txs whose recipe has a fixed-amount sell. */
  protected async getTxSaverData(context: ExecutionContext, encoding: EncodingReturnType): Promise<TxSaverModalData | undefined> {
    const { tx, env } = context;
    if (env.accountType === AccountType.Fork) return undefined;
    const ethValue = encoding.type === ExecutionType.Sign ? encoding.txDataHashParams[1] : encoding.txParams.value;
    if (ethValue !== '0') return undefined;
    const wallet = getProxyWalletByAddress(env.config.state, await tx.getExecutingAddressInTime());
    if (!isSafeWallet(wallet)) return undefined;
    const txSaverMeta = tx.getTxSaverMeta();
    if (!txSaverMeta) return undefined;
    return { totalSellAmount: txSaverMeta.fromAmount, symbol: txSaverMeta.fromAsset };
  }

  protected async estimateInternal(context: ExecutionContext): Promise<GasEstimate> {
    return context.encoder.estimateTx();
  }
}
