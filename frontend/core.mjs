export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isConfiguredAddress(address) {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(address ?? "") &&
    address.toLowerCase() !== ZERO_ADDRESS
  );
}

export function formatAddress(address) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTokenBalance(value, decimals) {
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

export function hasSufficientFunding(funding) {
  const amounts = [
    funding?.paxg?.balance,
    funding?.paxg?.claimAmount,
    funding?.usdc?.balance,
    funding?.usdc?.claimAmount,
  ];

  return (
    amounts.every((amount) => typeof amount === "bigint") &&
    funding.paxg.balance >= funding.paxg.claimAmount &&
    funding.usdc.balance >= funding.usdc.claimAmount
  );
}

export function formatUnlockTime(timestampSeconds) {
  const iso = new Date(Number(timestampSeconds) * 1_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function getPrimaryAction(state) {
  if (state.busy) {
    return {
      label: "Transaction pending…",
      action: "busy",
      disabled: true,
    };
  }

  if (!state.walletInstalled) {
    return { label: "Install a wallet", action: "install", disabled: false };
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

export function getErrorMessage(error) {
  const text = [error?.name, error?.shortMessage, error?.details, error?.message]
    .filter(Boolean)
    .join(" ");

  if (error?.code === 4001 || text.includes("UserRejectedRequestError")) {
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

  return error?.shortMessage || error?.message || "Something went wrong. Try again.";
}
