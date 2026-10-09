import { recoverAddress, type Hex } from 'viem';
import { compareAddresses } from '../../../services/utils';
import { type EthereumAddress, type MultisigTxSignature, SignatureType } from '../../../types';

type SigLike = { signature: string; signer: EthereumAddress; sigType: SignatureType };

/**
 * Safe signature encoding helpers. Mirrors
 * https://github.com/safe-global/safe-core-sdk/blob/main/packages/protocol-kit/src/utils/signatures/utils.ts
 */
export class SafeSignatureMaker {
  /** Concatenates signatures sorted by signer with V adjusted the way Safe expects. */
  static async encodeSafeSignatures(signatures: MultisigTxSignature[], txDataHash?: string) {
    const sigs = [...signatures].sort((a, b) => a.signer.localeCompare(b.signer));
    let encoded = '0x';
    for (const sig of sigs) {
      encoded += (await this.adjustVInSig(sig, txDataHash)).slice(2);
    }
    return encoded;
  }

  /**
   * Pre-approved signature: valid for the executing owner of a 1/n Safe, or as the last
   * signature of an m/n Safe when the signer is also the sender.
   */
  static generatePreApproveSignature(signer: EthereumAddress): MultisigTxSignature {
    const now = new Date().toISOString();
    return {
      id: -1,
      signature: `0x${'0'.repeat(24)}${signer.substring(2)}${'0'.repeat(64)}01`,
      signer,
      sigType: SignatureType.PRE_APPROVED,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Safe expects V in {27, 28} for raw ECDSA and {31, 32} for EIP-191 prefixed messages.
   * Wallets disagree on whether they add the prefix, so we recover the signer to find out.
   */
  static async adjustVInSig(sig: SigLike, txDataHash?: string) {
    const { signature, sigType, signer } = sig;
    const ETHEREUM_V_VALUES = [0, 1, 27, 28, 31, 32];
    const MIN_VALID_V_VALUE_FOR_SAFE_ECDSA = 27;
    const MIN_VALID_V_VALUE_IF_ALREADY_ADJUSTED = 31;
    let signatureV = parseInt(signature.slice(-2), 16);
    if (!ETHEREUM_V_VALUES.includes(signatureV)) throw new Error('Invalid signature');

    if (sigType === SignatureType.ETH_SIGN) {
      if (txDataHash === undefined) throw new Error('txDataHash is required for ETH_SIGN signatures');
      if (signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
      if (signatureV < MIN_VALID_V_VALUE_IF_ALREADY_ADJUSTED) {
        const adjustedSignature = signature.slice(0, -2) + signatureV.toString(16);
        if (await this.isTxHashSignedWithPrefix(txDataHash, adjustedSignature, signer)) signatureV += 4;
      }
    }
    if (sigType === SignatureType.ETH_SIGN_TYPED_DATA && signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) {
      signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
    }
    return signature.slice(0, -2) + signatureV.toString(16).padStart(2, '0');
  }

  private static async isTxHashSignedWithPrefix(txHash: string, signature: string, ownerAddress: string) {
    try {
      const recovered = await recoverAddress({ hash: txHash as Hex, signature: signature as Hex });
      return !compareAddresses(recovered, ownerAddress);
    } catch {
      return true;
    }
  }
}
