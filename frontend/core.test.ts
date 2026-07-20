import { describe, expect, test } from "vitest";

import {
  ZERO_ADDRESS,
  formatAddress,
  formatTokenBalance,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  hasSufficientFunding,
  isConfiguredAddress,
} from "./core";

describe("faucet core helpers", () => {
  test("recognizes a configured faucet address", () => {
    expect(isConfiguredAddress(ZERO_ADDRESS)).toBe(false);
    expect(
      isConfiguredAddress("0x1111111111111111111111111111111111111111"),
    ).toBe(true);
  });

  test("formats wallet addresses and unlock timestamps", () => {
    expect(
      formatAddress("0x1234567890abcdef1234567890abcdef12345678"),
    ).toBe("0x1234…5678");
    expect(formatUnlockTime(1_700_000_000n)).toBe("2023-11-14 22:13 UTC");
  });

  test("formats token balances without losing bigint precision", () => {
    expect(formatTokenBalance(0n, 18)).toBe("0");
    expect(formatTokenBalance(10_000_000_000n, 6)).toBe("10,000");
    expect(formatTokenBalance(1_234_567n, 6)).toBe("1.23");
    expect(
      formatTokenBalance(12_345_678_901_234_567_890_123_456n, 6),
    ).toBe("12,345,678,901,234,567,890.12");
  });

  test("requires enough PAXG and USDC funding for one claim", () => {
    const funding = {
      paxg: { balance: 20n, claimAmount: 20n },
      usdc: { balance: 50n, claimAmount: 40n },
    };

    expect(hasSufficientFunding(funding)).toBe(true);
    expect(
      hasSufficientFunding({
        ...funding,
        paxg: { ...funding.paxg, balance: 19n },
      }),
    ).toBe(false);
    expect(
      hasSufficientFunding({
        ...funding,
        usdc: { ...funding.usdc, balance: 39n },
      }),
    ).toBe(false);
    expect(hasSufficientFunding(null)).toBe(false);
    expect(hasSufficientFunding({ paxg: funding.paxg })).toBe(false);
  });

  test("selects wallet, network, and claim actions", () => {
    expect(getPrimaryAction({ walletReady: false })).toEqual({
      label: "Loading wallets…",
      action: "wait",
      disabled: true,
    });
    expect(
      getPrimaryAction({ walletReady: true, connected: false }),
    ).toEqual({ label: "Connect wallet", action: "connect", disabled: false });
    expect(
      getPrimaryAction({
        walletReady: true,
        connected: true,
        correctNetwork: false,
      }),
    ).toEqual({
      label: "Switch to Sepolia",
      action: "switch",
      disabled: false,
    });
    expect(
      getPrimaryAction({
        walletReady: true,
        connected: true,
        correctNetwork: true,
        configured: false,
      }),
    ).toEqual({
      label: "Configure faucet address",
      action: "configure",
      disabled: true,
    });
    expect(
      getPrimaryAction({
        walletReady: true,
        connected: true,
        correctNetwork: true,
        configured: true,
        eligible: false,
      }),
    ).toEqual({ label: "Claim unavailable", action: "wait", disabled: true });
    expect(
      getPrimaryAction({
        walletReady: true,
        connected: true,
        correctNetwork: true,
        configured: true,
        eligible: true,
      }),
    ).toEqual({
      label: "Claim test tokens",
      action: "claim",
      disabled: false,
    });
    expect(getPrimaryAction({ busy: true })).toEqual({
      label: "Transaction pending…",
      action: "busy",
      disabled: true,
    });
  });

  test("gates claims on funding and eligibility status", () => {
    const readyState = {
      walletReady: true,
      connected: true,
      correctNetwork: true,
      configured: true,
      eligible: true,
    } as const;

    expect(
      getPrimaryAction({ ...readyState, fundingStatus: "loading" }),
    ).toEqual({
      label: "Checking faucet funding…",
      action: "wait",
      disabled: true,
    });
    expect(
      getPrimaryAction({ ...readyState, fundingStatus: "error" }),
    ).toEqual({
      label: "Faucet funding unavailable",
      action: "wait",
      disabled: true,
    });
    expect(
      getPrimaryAction({ ...readyState, fundingStatus: "underfunded" }),
    ).toEqual({
      label: "Faucet needs funding",
      action: "wait",
      disabled: true,
    });
    expect(
      getPrimaryAction({ ...readyState, eligibilityStatus: "loading" }),
    ).toEqual({
      label: "Checking eligibility…",
      action: "wait",
      disabled: true,
    });
    expect(
      getPrimaryAction({ ...readyState, eligibilityStatus: "error" }),
    ).toEqual({
      label: "Eligibility unavailable",
      action: "wait",
      disabled: true,
    });
    expect(
      getPrimaryAction({
        ...readyState,
        connected: false,
        fundingStatus: "underfunded",
      }),
    ).toEqual({ label: "Connect wallet", action: "connect", disabled: false });
    expect(
      getPrimaryAction({
        ...readyState,
        correctNetwork: false,
        fundingStatus: "underfunded",
      }),
    ).toEqual({
      label: "Switch to Sepolia",
      action: "switch",
      disabled: false,
    });
    expect(
      getPrimaryAction({
        ...readyState,
        configured: false,
        fundingStatus: "underfunded",
      }),
    ).toEqual({
      label: "Configure faucet address",
      action: "configure",
      disabled: true,
    });
  });

  test("translates wallet and contract errors", () => {
    expect(getErrorMessage(new Error("UserRejectedRequestError"))).toBe(
      "Request rejected in your wallet.",
    );
    expect(getErrorMessage(new Error("AlreadyClaimed"))).toBe(
      "This wallet is still in its claim cooldown.",
    );
    expect(getErrorMessage(new Error("InsufficientFunds"))).toBe(
      "The faucet does not have enough test tokens.",
    );
    expect(getErrorMessage(new Error("TransferFailed"))).toBe(
      "The faucet could not transfer the test tokens.",
    );
    expect(getErrorMessage({ shortMessage: "RPC unavailable" })).toBe(
      "RPC unavailable",
    );
  });
});
