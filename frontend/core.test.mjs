import test from "node:test";
import assert from "node:assert/strict";

import {
  ZERO_ADDRESS,
  formatAddress,
  formatTokenBalance,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  hasSufficientFunding,
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

test("formats token balances without losing bigint precision", () => {
  assert.equal(formatTokenBalance(0n, 18), "0");
  assert.equal(formatTokenBalance(10_000_000_000n, 6), "10,000");
  assert.equal(formatTokenBalance(1_234_567n, 6), "1.23");
  assert.equal(
    formatTokenBalance(12_345_678_901_234_567_890_123_456n, 6),
    "12,345,678,901,234,567,890.12",
  );
});

test("requires enough PAXG and USDC funding for one claim", () => {
  const funding = {
    paxg: { balance: 20n, claimAmount: 20n },
    usdc: { balance: 50n, claimAmount: 40n },
  };

  assert.equal(hasSufficientFunding(funding), true);
  assert.equal(
    hasSufficientFunding({
      ...funding,
      paxg: { ...funding.paxg, balance: 19n },
    }),
    false,
  );
  assert.equal(
    hasSufficientFunding({
      ...funding,
      usdc: { ...funding.usdc, balance: 39n },
    }),
    false,
  );
  assert.equal(hasSufficientFunding(null), false);
  assert.equal(hasSufficientFunding({ paxg: funding.paxg }), false);
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

test("gates claims on funding and eligibility status", () => {
  const readyState = {
    walletInstalled: true,
    connected: true,
    correctNetwork: true,
    configured: true,
    eligible: true,
  };

  assert.deepEqual(
    getPrimaryAction({ ...readyState, fundingStatus: "loading" }),
    {
      label: "Checking faucet funding…",
      action: "wait",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({ ...readyState, fundingStatus: "error" }),
    {
      label: "Faucet funding unavailable",
      action: "wait",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({ ...readyState, fundingStatus: "underfunded" }),
    {
      label: "Faucet needs funding",
      action: "wait",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({ ...readyState, eligibilityStatus: "loading" }),
    {
      label: "Checking eligibility…",
      action: "wait",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({ ...readyState, eligibilityStatus: "error" }),
    {
      label: "Eligibility unavailable",
      action: "wait",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({
      walletInstalled: false,
      fundingStatus: "underfunded",
      eligibilityStatus: "error",
    }),
    { label: "Install a wallet", action: "install", disabled: false },
  );
  assert.deepEqual(
    getPrimaryAction({
      ...readyState,
      connected: false,
      fundingStatus: "underfunded",
    }),
    { label: "Connect wallet", action: "connect", disabled: false },
  );
  assert.deepEqual(
    getPrimaryAction({
      ...readyState,
      correctNetwork: false,
      fundingStatus: "underfunded",
    }),
    { label: "Switch to Sepolia", action: "switch", disabled: false },
  );
  assert.deepEqual(
    getPrimaryAction({
      ...readyState,
      configured: false,
      fundingStatus: "underfunded",
    }),
    {
      label: "Configure faucet address",
      action: "configure",
      disabled: true,
    },
  );
  assert.deepEqual(
    getPrimaryAction({
      ...readyState,
      fundingStatus: "error",
      eligibilityStatus: "error",
    }),
    {
      label: "Faucet funding unavailable",
      action: "wait",
      disabled: true,
    },
  );
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
