import type { Address } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type FundingStatus = "loading" | "error" | "underfunded" | "ready";
export type EligibilityStatus = "idle" | "loading" | "error" | "ready";
export type PrimaryActionName =
  | "busy"
  | "wait"
  | "connect"
  | "switch"
  | "configure"
  | "claim";

export interface TokenFunding {
  balance?: bigint | null;
  claimAmount?: bigint | null;
}

export interface FaucetFunding {
  paxg?: TokenFunding;
  usdc?: TokenFunding;
}

export interface PrimaryActionState {
  busy?: boolean;
  walletReady?: boolean;
  connected?: boolean;
  correctNetwork?: boolean;
  configured?: boolean;
  fundingStatus?: FundingStatus;
  eligibilityStatus?: EligibilityStatus;
  eligible?: boolean | null;
}

export interface PrimaryAction {
  label: string;
  action: PrimaryActionName;
  disabled: boolean;
}

interface ErrorLike {
  name?: string;
  shortMessage?: string;
  details?: string;
  message?: string;
  code?: number;
}

export function isConfiguredAddress(
  address: string | null | undefined,
): address is Address {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(address ?? "") &&
    address?.toLowerCase() !== ZERO_ADDRESS
  );
}

export function formatAddress(address: string | null | undefined): string {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTokenBalance(value: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = ((value % unit) * 100n) / unit;
  const formattedWhole = new Intl.NumberFormat("en-US").format(whole);
  const formattedFraction = fraction
    .toString()
    .padStart(2, "0")
    .replace(/0+$/, "");

  return formattedFraction
    ? `${formattedWhole}.${formattedFraction}`
    : formattedWhole;
}

export function hasSufficientFunding(
  funding: FaucetFunding | null | undefined,
): funding is Required<FaucetFunding> {
  const amounts = [
    funding?.paxg?.balance,
    funding?.paxg?.claimAmount,
    funding?.usdc?.balance,
    funding?.usdc?.claimAmount,
  ];

  return (
    amounts.every((amount) => typeof amount === "bigint") &&
    funding?.paxg?.balance !== null &&
    funding?.paxg?.balance !== undefined &&
    funding.paxg.claimAmount !== null &&
    funding.paxg.claimAmount !== undefined &&
    funding.paxg.balance >= funding.paxg.claimAmount &&
    funding?.usdc?.balance !== null &&
    funding?.usdc?.balance !== undefined &&
    funding.usdc.claimAmount !== null &&
    funding.usdc.claimAmount !== undefined &&
    funding.usdc.balance >= funding.usdc.claimAmount
  );
}

export function formatUnlockTime(timestampSeconds: bigint | number): string {
  const iso = new Date(Number(timestampSeconds) * 1_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function getPrimaryAction(state: PrimaryActionState): PrimaryAction {
  if (state.busy) {
    return {
      label: "Transaction pending…",
      action: "busy",
      disabled: true,
    };
  }

  if (!state.walletReady) {
    return { label: "Loading wallets…", action: "wait", disabled: true };
  }

  if (!state.connected) {
    return { label: "Connect wallet", action: "connect", disabled: false };
  }

  if (!state.correctNetwork) {
    return {
      label: "Switch to Sepolia",
      action: "switch",
      disabled: false,
    };
  }

  if (!state.configured) {
    return {
      label: "Configure faucet address",
      action: "configure",
      disabled: true,
    };
  }

  if (state.fundingStatus === "loading") {
    return {
      label: "Checking faucet funding…",
      action: "wait",
      disabled: true,
    };
  }

  if (state.fundingStatus === "error") {
    return {
      label: "Faucet funding unavailable",
      action: "wait",
      disabled: true,
    };
  }

  if (state.fundingStatus === "underfunded") {
    return {
      label: "Faucet needs funding",
      action: "wait",
      disabled: true,
    };
  }

  if (state.eligibilityStatus === "loading") {
    return {
      label: "Checking eligibility…",
      action: "wait",
      disabled: true,
    };
  }

  if (state.eligibilityStatus === "error") {
    return {
      label: "Eligibility unavailable",
      action: "wait",
      disabled: true,
    };
  }

  if (!state.eligible) {
    return { label: "Claim unavailable", action: "wait", disabled: true };
  }

  return { label: "Claim test tokens", action: "claim", disabled: false };
}

export function getErrorMessage(error: unknown): string {
  const errorLike: ErrorLike =
    typeof error === "object" && error !== null ? (error as ErrorLike) : {};
  const text = [
    errorLike.name,
    errorLike.shortMessage,
    errorLike.details,
    errorLike.message,
  ]
    .filter(Boolean)
    .join(" ");

  if (errorLike.code === 4001 || text.includes("UserRejectedRequestError")) {
    return "Request rejected in your wallet.";
  }
  if (text.includes("AlreadyClaimed")) {
    return "This wallet is still in its claim cooldown.";
  }
  if (text.includes("InsufficientFunds")) {
    return "The faucet does not have enough test tokens.";
  }
  if (text.includes("TransferFailed")) {
    return "The faucet could not transfer the test tokens.";
  }

  return (
    errorLike.shortMessage ||
    errorLike.message ||
    "Something went wrong. Try again."
  );
}
