import type { MultisigSignatureForDb } from '../../types';
import type { EncoderSignRet, ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import { ExecutorBase } from './ExecutorBase';

/** Adds one more owner signature to a pending m/n Safe tx. */
export default class SignPendingMultisigTxExecutor extends ExecutorBase {
  protected async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const {
      notifier, encoder, tx, txUtils, env,
    } = context;

    const encoding = await encoder.encodeTx() as EncoderSignRet;
    await notifier.getConfirmationSign(encoding);
    notifier.addNotificationSign('Signing pending multisig transaction');
    try {
      const signatureData = await txUtils.signSafeTx(
        encoding.txDataHash, encoding.txDataParams, env.network, encoding.signer, await tx.getExecutingAddressInTime(),
      );
      const multisigSignature: MultisigSignatureForDb = {
        signer: encoding.signer,
        network: env.network,
        sigType: signatureData.sigType,
        signature: signatureData.signature,
        txDataHash: encoding.txDataHash,
        txId: tx.getPendingTxData()!.txId,
      };
      await env.config.api.postSafeSignature(multisigSignature, env.forkId);
      notifier.changeNotificationOnSignSuccess('Signed pending multisig transaction.');
      return signatureData;
    } catch (e) {
      notifier.changeNotificationOnSignError('Error signing pending multisig transaction');
      throw e;
    }
  }
}
