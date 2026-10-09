import type { GasEstimate } from '../../types';
import type { ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import { ExecutorBase } from './ExecutorBase';

/** EIP-712 signature (permits, delegation, etc). Result is stored in `SignatureStore` and emitted via `hooks.onSignature`. */
export default class SignTypedTxExecutor extends ExecutorBase {
  protected async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const {
      notifier, tx, txUtils, env,
    } = context;
    const protocol = tx.getProtocol();
    const actionName = tx.getMethod();

    notifier.addNotificationSign('Signing new typed message');
    try {
      const message = txUtils.getTypedSignatureMessage(tx);
      const signatureData = await txUtils.signTypedData(message, env.account);
      env.config.signatures.set(protocol, actionName, signatureData.signature);
      env.config.hooks.onSignature?.({
        protocol, actionName, signature: signatureData.signature, sigType: signatureData.sigType,
      }, tx);
      notifier.changeNotificationOnSignSuccess('Signed new typed message successfully.', false);
      return signatureData;
    } catch (e) {
      notifier.changeNotificationOnSignError('Signing typed signature failed.');
      throw e;
    }
  }

  protected override async estimateInternal(_context: ExecutionContext): Promise<GasEstimate> {
    return { failing: false, realGas: 0, gas: 0 };
  }
}
