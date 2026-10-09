import { assert } from 'chai';
import { erc20Abi } from '../src/abi';
import { SignType } from '../src/services/typedData';
import { TxType } from '../src/types';
import TxWrapper from '../src/TxWrapper';

describe('TxWrapper', () => {
  it('requires rawTxCallParams for Raw txs', () => {
    assert.throws(() => new TxWrapper(TxType.Raw), /rawTxCallParams/);
  });

  it('requires signature config for TypedSignature txs', () => {
    assert.throws(() => new TxWrapper(TxType.TypedSignature, { signaturePrimaryType: SignType.Permit }), /signatureDomainType/);
  });

  it('resolves lazy executing address and method params', async () => {
    const tx = new TxWrapper(TxType.Normal, {
      executingAddress: () => '0x1111111111111111111111111111111111111111',
      contractCallParams: {
        address: '0x2222222222222222222222222222222222222222', abi: erc20Abi, method: 'approve', methodParams: async () => ['0x1', '2'],
      },
    });
    assert.equal(await tx.getExecutingAddressInTime(), '0x1111111111111111111111111111111111111111');
    assert.deepEqual(await tx.getMethodParamsInTime(), ['0x1', '2']);
    assert.equal(tx.getContractAddress(), '0x2222222222222222222222222222222222222222');
  });

  it('prefers showMevInfo from additionalInfo when flagged', () => {
    const tx = new TxWrapper(TxType.Normal, {
      additionalInfo: { showMevInfo: { shouldShowMev: true, slippagePercent: '1' } },
      showMevInfo: { slippagePercent: '2' },
    });
    assert.equal(tx.getShowMevInfo().slippagePercent, '1');
  });

  it('throws when executed recipe is read before encoding', () => {
    const tx = new TxWrapper(TxType.Normal);
    assert.throws(() => tx.getExecutedRecipe(), 'Executed recipe is not set');
    assert.isFalse(tx.getHasSwap());
  });
});
