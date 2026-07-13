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
