import { SignType } from '../../services/typedData';
import type { GasEstimate } from '../../types';
import type { ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import SignTypedTxExecutor from './SignTypedTxExecutor';

export const CREATE_AND_EXECUTE_PROTOCOL = 'safe';
export const CREATE_AND_EXECUTE_ACTION = 'createSafe';

/** Signs the Safe tx that `DFSSafeFactory.createSafeAndExecute` will run right after deploying the Safe. */
export default class SignCreateAndExecuteExecutor extends SignTypedTxExecutor {
  protected override async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const { encoder, tx, env } = context;
    const safeTx = await encoder.encodeCreateAndExecuteData();

    tx.setSignaturePrimaryType(SignType.SafeTx);
    tx.setSignatureDomainType(SignType.EIP712DomainSafe);
    tx.setSignatureInfo({
      primaryType: SignType.SafeTx,
      domain: { chainId: env.network, verifyingContract: tx.getExecutingAddress() },
      message: safeTx,
    });
    tx.setProtocol(CREATE_AND_EXECUTE_PROTOCOL);
    if (!tx.getMethod()) tx.method = CREATE_AND_EXECUTE_ACTION;

    const signatureData = await super.executeInternal(context);
    env.config.signatures.setSafeTxData(safeTx);
    env.config.hooks.onSafeTxData?.(safeTx, tx);
    return signatureData;
  }

  protected override async estimateInternal(context: ExecutionContext): Promise<GasEstimate> {
    return context.encoder.estimateCreateAndExecute();
  }
}
