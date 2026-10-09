import type { EncoderSignRet, ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import { ExecutorBase } from './ExecutorBase';
import SendTxSaverTxExecutor from './SendTxSaverTxExecutor';

/** First signature of a new m/n Safe tx; stored in the DeFi Saver backend for other owners. */
export default class SignNewMultisigTxExecutor extends ExecutorBase {
  protected async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const {
      notifier, encoder, tx, txUtils, env,
    } = context;

    let encoding = await encoder.encodeTx() as EncoderSignRet;
    const txSaverData = await this.getTxSaverData(context, encoding);
    const confirmation = await notifier.getConfirmationSign(encoding, txSaverData, true);
    if (confirmation !== true) {
      if (confirmation.failed) return confirmation;
      if (confirmation.isTxSaver) return new SendTxSaverTxExecutor().executeWithConfirmation(context, confirmation);
      if (confirmation.useCustomNonce && confirmation.nonce) {
        tx.setNonce(confirmation.nonce);
        encoding = await encoder.encodeTx() as EncoderSignRet;
      }
    }

    notifier.addNotificationSign('Signing new multisig transaction');
    try {
      const signatureData = await txUtils.signSafeTx(
        encoding.txDataHash, encoding.txDataParams, env.network, encoding.signer, await tx.getExecutingAddressInTime(),
      );
      const multisigTx = txUtils.getMultisigTxForDb(tx, encoding, signatureData.sigType, signatureData.signature, env.network, false);
      await env.config.api.postSafeTx(multisigTx, env.forkId);
      notifier.changeNotificationOnSignSuccess('Signed new multisig transaction.');
      return signatureData;
    } catch (e) {
      notifier.changeNotificationOnSignError('Error signing new multisig transaction');
      throw e;
    }
  }
}
