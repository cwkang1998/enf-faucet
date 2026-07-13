import test from "node:test";
import assert from "node:assert/strict";

import {
  ZERO_ADDRESS,
  formatAddress,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  isConfiguredAddress,
} from "./core.mjs";

test("recognizes a configured faucet address", () => {
  assert.equal(isConfiguredAddress(ZERO_ADDRESS), false);
  assert.equal(
    isConfiguredAddress("0x1111111111111111111111111111111111111111"),
    true,
  );
});

test("formats wallet addresses and unlock timestamps", () => {
  assert.equal(
    formatAddress("0x1234567890abcdef1234567890abcdef12345678"),
    "0x1234…5678",
  );
  assert.equal(formatUnlockTime(1_700_000_000n), "2023-11-14 22:13 UTC");
});

test("selects the action for each wallet state", () => {
  assert.deepEqual(getPrimaryAction({ walletInstalled: false }), {
    label: "Install a wallet",
    action: "install",
    disabled: false,
  });
  assert.deepEqual(
    getPrimaryAction({ walletInstalled: true, connected: false }),
    { label: "Connect wallet", action: "connect", disabled: false },
  );
  assert.deepEqual(
    getPrimaryAction({
      walletInstalled: true,
      connected: true,
      correctNetwork: false,
    }),
    { label: "Switch to Sepolia", action: "switch", disabled: false },
  );
  assert.deepEqual(
    getPrimaryAction({
      walletInstalled: true,
      connected: true,
      correctNetwork: true,
      configured: false,
    }),
    {
      label: "Configure faucet address",
      action: "configure",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({
      walletInstalled: true,
      connected: true,
      correctNetwork: true,
      configured: true,
      eligible: false,
    }),
    { label: "Claim unavailable", action: "wait", disabled: true },
  );
  assert.deepEqual(
    getPrimaryAction({
      walletInstalled: true,
      connected: true,
      correctNetwork: true,
      configured: true,
      eligible: true,
    }),
    { label: "Claim test tokens", action: "claim", disabled: false },
  );
  assert.deepEqual(getPrimaryAction({ busy: true }), {
    label: "Transaction pending…",
    action: "busy",
    disabled: true,
  });
});

test("translates wallet and contract errors", () => {
  assert.equal(
    getErrorMessage(new Error("UserRejectedRequestError")),
    "Request rejected in your wallet.",
  );
  assert.equal(
    getErrorMessage(new Error("AlreadyClaimed")),
    "This wallet is still in its claim cooldown.",
  );
  assert.equal(
    getErrorMessage(new Error("InsufficientFunds")),
    "The faucet does not have enough test tokens.",
  );
  assert.equal(
    getErrorMessage(new Error("TransferFailed")),
    "The faucet could not transfer the test tokens.",
  );
  assert.equal(getErrorMessage({ shortMessage: "RPC unavailable" }), "RPC unavailable");
});
