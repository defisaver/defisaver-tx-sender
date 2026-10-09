import { encodeCall } from '../../services/abi';
import {
  ExecutionType, type GasEstimate, type Hex, TxType,
} from '../../types';
import type { EncoderSendRet, TxParams } from '../../types/encoding';
import type TxWrapper from '../../TxWrapper';
import AbstractEncoder from './AbstractEncoder';

const requireRawCallParams = (tx: TxWrapper) => {
  const raw = tx.rawTxCallParams;
  if (tx.type === TxType.Raw && (!raw || !raw.data || !raw.from || !raw.to)) {
    throw new Error(`TxType on TxWrapper is set to: ${tx.type}, but rawTxCallParams are not set correctly.`);
  }
};

/** Direct calls from the account: raw calldata or a contract method. */
export default class EoaEncoder extends AbstractEncoder {
  async getExecutionType() {
    return ExecutionType.Send;
  }

  private getCallData(executeParams: unknown[]): Hex {
    const tx = this.tx;
    if (tx.type === TxType.Raw) {
      requireRawCallParams(tx);
      return tx.rawTxCallParams!.data as Hex;
    }
    const call = tx.getContractCall();
    if (!call) {
      if (tx.getRecipe()) throw new Error('Recipe specified but executionAddress is not proxy');
      throw new Error('No contract specified for EOA encoding');
    }
    return encodeCall(call.abi, tx.getMethod(), executeParams);
  }

  async handleTxEncoding(executeParams: unknown[], ethValue: string): Promise<EncoderSendRet> {
    const data = this.getCallData(executeParams);
    const { txParams, gasData } = await this.buildAndEstimate(this.tx.getContractAddress(), data, ethValue);
    if (this.tx.type === TxType.Raw) {
      // Raw txs are trusted as-is; estimation failure only affects the gas limit.
      return {
        type: ExecutionType.Send, txParams, failing: false, realGas: gasData.realGas,
      };
    }
    await this.validateSendable(txParams);
    return this.toSendRet(txParams, gasData);
  }

  async estimateTx(executeParams: unknown[], ethValue: string): Promise<GasEstimate> {
    const data = this.getCallData(executeParams);
    const txParams: TxParams = {
      from: this.fromAddress,
      to: this.tx.getContractAddress(),
      value: ethValue,
      data,
      gas: 0,
      gasPrice: await this.getGasPriceForEstimation(),
    };
    return this.estimateGas(txParams, this.tx.getExtraGas(), this.tx.getMinGas());
  }
}
