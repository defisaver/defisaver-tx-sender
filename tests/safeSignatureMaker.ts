import 'dotenv/config';
import { assert } from 'chai';
import { privateKeyToAccount } from 'viem/accounts';
import { SafeSignatureMaker } from '../src/core/encoders/safe/SafeSignatureMaker';
import { SignatureType } from '../src/types';
import { assertRejects, envSecret } from './utils/assert';

const HASH = '0x5555555555555555555555555555555555555555555555555555555555555555';

describe('SafeSignatureMaker', () => {
  it('builds a pre-approved signature for the signer', () => {
    const sig = SafeSignatureMaker.generatePreApproveSignature('0x1111111111111111111111111111111111111111');
    assert.equal(sig.sigType, SignatureType.PRE_APPROVED);
    assert.lengthOf(sig.signature, 2 + 130);
    assert.isTrue(sig.signature.endsWith('01'));
    assert.equal(sig.signature.slice(26, 66), '1111111111111111111111111111111111111111');
  });

  describe('with TEST_PRIVATE_KEY', () => {
    const pk = envSecret('TEST_PRIVATE_KEY');

    it('bumps V by 4 for EIP-191 prefixed eth_sign signatures', async function () {
      if (!pk) this.skip();
      const account = privateKeyToAccount(pk as `0x${string}`);
      const prefixed = await account.signMessage({ message: { raw: HASH } });
      const adjusted = await SafeSignatureMaker.adjustVInSig({ signature: prefixed, signer: account.address, sigType: SignatureType.ETH_SIGN }, HASH);
      assert.include([31, 32], parseInt(adjusted.slice(-2), 16));
    });

    it('keeps V at 27/28 for raw hash signatures', async function () {
      if (!pk) this.skip();
      const account = privateKeyToAccount(pk as `0x${string}`);
      const raw = await account.sign({ hash: HASH });
      const adjusted = await SafeSignatureMaker.adjustVInSig({ signature: raw, signer: account.address, sigType: SignatureType.ETH_SIGN }, HASH);
      assert.include([27, 28], parseInt(adjusted.slice(-2), 16));
    });
  });

  it('normalises typed data V from 0/1 to 27/28 and sorts signatures by signer', async () => {
    const sigA = { id: 1, signer: '0xbbbb000000000000000000000000000000000000', signature: `0x${'aa'.repeat(64)}01`, sigType: SignatureType.ETH_SIGN_TYPED_DATA, createdAt: '', updatedAt: '' };
    const sigB = { id: 2, signer: '0xaaaa000000000000000000000000000000000000', signature: `0x${'bb'.repeat(64)}00`, sigType: SignatureType.ETH_SIGN_TYPED_DATA, createdAt: '', updatedAt: '' };
    const encoded = await SafeSignatureMaker.encodeSafeSignatures([sigA, sigB]);
    assert.isTrue(encoded.startsWith(`0x${'bb'.repeat(64)}1b`));
    assert.isTrue(encoded.endsWith(`${'aa'.repeat(64)}1c`));
  });

  it('rejects signatures with an invalid V', async () => {
    await assertRejects(
      SafeSignatureMaker.adjustVInSig({ signature: `0x${'00'.repeat(64)}ff`, signer: '0x0', sigType: SignatureType.ETH_SIGN }, HASH),
      'Invalid signature',
    );
  });
});
