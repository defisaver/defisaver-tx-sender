import { instaAccountV2Abi } from '../../abi';
import { encodeCall } from '../../services/abi';
import { ExecutionType, type GasEstimate } from '../../types';
import type { EncoderSendRet } from '../../types/encoding';
import AbstractEncoder from './AbstractEncoder';

const DSA_CONNECTOR = 'DEFI-SAVER-A';

/** Instadapp DSA v2 `cast([connector], [data], origin)` */
export default class DSAEncoder extends AbstractEncoder {
  async getExecutionType() {
    return ExecutionType.Send;
  }

  private encode(executeParams: unknown[]) {
    return encodeCall(instaAccountV2Abi, 'cast', [[DSA_CONNECTOR], [executeParams[1]], this.fromAddress]);
  }

  async handleTxEncoding(executeParams: unknown[], ethValue: string): Promise<EncoderSendRet> {
    const { txParams, gasData } = await this.buildAndEstimate(this.executingAddress, this.encode(executeParams), ethValue);
    await this.validateSendable(txParams);
    return this.toSendRet(txParams, gasData);
  }

  async estimateTx(executeParams: unknown[], ethValue: string): Promise<GasEstimate> {
    const { gasData } = await this.buildAndEstimate(this.executingAddress, this.encode(executeParams), ethValue);
    return gasData;
  }
}
