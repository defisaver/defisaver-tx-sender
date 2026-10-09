import type { EncoderSignRet, ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import { ExecutorBase } from './ExecutorBase';
import SendTxSaverTxExecutor from './SendTxSaverTxExecutor';

/** Signs an empty Safe tx with the same nonce to replace a pending multisig tx. */
export default class CancelPendingMultisigTxExecutor extends ExecutorBase {
  protected async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const {
      notifier, encoder, tx, txUtils, env,
    } = context;

    const encoding = await encoder.encodeTx() as EncoderSignRet;
    const txSaverData = await this.getTxSaverData(context, encoding);
    const confirmation = await notifier.getConfirmationSign(encoding, txSaverData);
    if (confirmation !== true && !confirmation.failed && confirmation.isTxSaver) {
      return new SendTxSaverTxExecutor().executeWithConfirmation(context, confirmation);
    }

    notifier.addNotificationSign('Signing cancel transaction');
    try {
      const signatureData = await txUtils.signSafeTx(
        encoding.txDataHash, encoding.txDataParams, env.network, encoding.signer, await tx.getExecutingAddressInTime(),
      );
      const multisigTx = txUtils.getMultisigTxForDb(tx, encoding, signatureData.sigType, signatureData.signature, env.network, false);
      await env.config.api.cancelPendingTx(multisigTx, tx.getPendingTxData()!.txId, env.forkId);
      notifier.changeNotificationOnSignSuccess('Signed cancel transaction.');
      return signatureData;
    } catch (err) {
      notifier.changeNotificationOnSignError('Error signing cancel transaction');
      throw err;
    }
  }
}
