import { dsProxyAbi } from '../../abi';
import { encodeCall } from '../../services/abi';
import { ExecutionType, type GasEstimate } from '../../types';
import type { EncoderSendRet } from '../../types/encoding';
import AbstractEncoder from './AbstractEncoder';

/** `DSProxy.execute(target, data)` */
export default class DSProxyEncoder extends AbstractEncoder {
  async getExecutionType() {
    return ExecutionType.Send;
  }

  private encode(executeParams: unknown[]) {
    return encodeCall(dsProxyAbi, 'execute', [executeParams[0], executeParams[1]]);
  }

  async handleTxEncoding(executeParams: unknown[], ethValue: string): Promise<EncoderSendRet> {
    const { txParams, gasData } = await this.buildAndEstimate(this.executingAddress, this.encode(executeParams), ethValue);
    await this.validateSendable(txParams, [executeParams[0] as string]);
    return this.toSendRet(txParams, gasData);
  }

  async estimateTx(executeParams: unknown[], ethValue: string): Promise<GasEstimate> {
    const { gasData } = await this.buildAndEstimate(this.executingAddress, this.encode(executeParams), ethValue);
    return gasData;
  }
}
