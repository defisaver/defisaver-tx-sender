import type { Abi } from 'viem';

/** Minimal ABI fragments. Only the functions the SDK calls are included to avoid overload ambiguity. */

export const safeAbi = [
  {
    type: 'function', name: 'VERSION', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }],
  },
  {
    type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function', name: 'getThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getTransactionHash',
    stateMutability: 'view',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: '_nonce', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'execTransaction',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'requiredTxGas',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'simulateAndRevert',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'targetContract', type: 'address' },
      { name: 'calldataPayload', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setup',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_owners', type: 'address[]' },
      { name: '_threshold', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'fallbackHandler', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint256' },
      { name: 'paymentReceiver', type: 'address' },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const safeProxyFactoryAbi = [
  {
    type: 'function',
    name: 'createProxyWithNonce',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_singleton', type: 'address' },
      { name: 'initializer', type: 'bytes' },
      { name: 'saltNonce', type: 'uint256' },
    ],
    outputs: [{ name: 'proxy', type: 'address' }],
  },
  {
    type: 'function', name: 'proxyCreationCode', stateMutability: 'pure', inputs: [], outputs: [{ type: 'bytes' }],
  },
  {
    type: 'event',
    name: 'ProxyCreation',
    anonymous: false,
    inputs: [
      { name: 'proxy', type: 'address', indexed: false },
      { name: 'singleton', type: 'address', indexed: false },
    ],
  },
] as const satisfies Abi;

export const simulateTxAccessorAbi = [
  {
    type: 'function',
    name: 'simulate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
    ],
    outputs: [
      { name: 'estimate', type: 'uint256' },
      { name: 'success', type: 'bool' },
      { name: 'returnData', type: 'bytes' },
    ],
  },
] as const satisfies Abi;

export const multicallAbi = [
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'gasLimit', type: 'uint256' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'blockNumber', type: 'uint256' },
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'gasUsed', type: 'uint256' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const satisfies Abi;

export const dsProxyAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: '_target', type: 'address' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [{ name: 'response', type: 'bytes32' }],
  },
] as const satisfies Abi;

export const sfProxyAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: '_target', type: 'address' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
] as const satisfies Abi;

export const instaAccountV2Abi = [
  {
    type: 'function',
    name: 'cast',
    stateMutability: 'payable',
    inputs: [
      { name: '_targetNames', type: 'string[]' },
      { name: '_datas', type: 'bytes[]' },
      { name: '_origin', type: 'address' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
] as const satisfies Abi;

export const dfsSafeFactoryAbi = [
  {
    type: 'function',
    name: 'createSafeAndExecute',
    stateMutability: 'payable',
    inputs: [
      {
        name: '_creationData',
        type: 'tuple',
        components: [
          { name: 'singleton', type: 'address' },
          { name: 'initializer', type: 'bytes' },
          { name: 'saltNonce', type: 'uint256' },
        ],
      },
      {
        name: '_executionData',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'signatures', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }],
  },
] as const satisfies Abi;

export const aaveDebtTokenAbi = [
  {
    type: 'function',
    name: 'approveDelegation',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'delegatee', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'borrowAllowance',
    stateMutability: 'view',
    inputs: [{ name: 'fromUser', type: 'address' }, { name: 'toUser', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const satisfies Abi;

export const erc721Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getApproved',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
] as const satisfies Abi;
