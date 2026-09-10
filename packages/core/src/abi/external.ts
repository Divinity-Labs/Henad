// Hand-written minimal ABIs for third-party contracts we only read.
// Sources: docs/INTEGRATION-FACTS.md §14.1 (Mento), §14.3 (Chainlink), §14.4 (ERC-3009).

export const aggregatorV3Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'description', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    type: 'function',
    name: 'getRoundData',
    stateMutability: 'view',
    inputs: [{ name: '_roundId', type: 'uint80' }],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

export const mentoRouterAbi = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'factory', type: 'address' },
        ],
      },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'poolFor',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: '_factory', type: 'address' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const

export const fpmmAbi = [
  { type: 'function', name: 'oracleAdapter', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'referenceRateFeedID', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'lpFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'protocolFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export const oracleAdapterAbi = [
  {
    type: 'function',
    name: 'getRate',
    stateMutability: 'view',
    inputs: [{ name: 'rateFeedID', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'numerator', type: 'uint256' },
          { name: 'denominator', type: 'uint256' },
          { name: 'tradingMode', type: 'uint8' },
          { name: 'isRecent', type: 'bool' },
          { name: 'isFXMarketOpen', type: 'bool' },
        ],
      },
    ],
  },
] as const

export const marketHoursBreakerAbi = [
  {
    type: 'function',
    name: 'isFXMarketOpen',
    stateMutability: 'pure',
    inputs: [{ name: 'timestamp', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const

export const erc3009Abi = [
  {
    type: 'function',
    name: 'authorizationState',
    stateMutability: 'view',
    inputs: [{ name: 'authorizer', type: 'address' }, { name: 'nonce', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  { type: 'function', name: 'DOMAIN_SEPARATOR', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
] as const
