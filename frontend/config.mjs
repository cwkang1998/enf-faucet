export const FAUCET_ADDRESS = '0x13bDbe1Df25f884e2AFA3d69E502CA1959FC72b3';
export const SEPOLIA_CHAIN_ID = 11_155_111;

export const FAUCET_ABI = [
  {
    type: "function",
    name: "claimTestTokens",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "isAllowedForTransaction",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getAllowedTime",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "error",
    name: "AlreadyClaimed",
    inputs: [{ name: "unlockTime", type: "uint256" }],
  },
  { type: "error", name: "InsufficientFunds", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
];
