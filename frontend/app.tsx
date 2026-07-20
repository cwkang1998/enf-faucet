import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Abi, Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";

import { loadContractAbis } from "./abi";
import { FAUCET_ADDRESS } from "./config";
import {
  type EligibilityStatus,
  type FundingStatus,
  formatAddress,
  formatTokenBalance,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  hasSufficientFunding,
  isConfiguredAddress,
} from "./core";

interface TokenState {
  address: Address | null;
  balance: bigint | null;
  claimAmount: bigint | null;
  decimals: number | null;
}

type AbisState =
  | { status: "loading" | "error"; faucetAbi: null; erc20Abi: null }
  | { status: "ready"; faucetAbi: Abi; erc20Abi: Abi };

interface FundingState {
  status: FundingStatus;
  paxg: TokenState;
  usdc: TokenState;
}

interface EligibilityState {
  status: EligibilityStatus;
  eligible: boolean | null;
  unlockTime: bigint | null;
}

interface StatusState {
  message: string;
  tone: "" | "error" | "success";
}

interface EligibilityLabelOptions {
  connected: boolean;
  correctNetwork: boolean;
  configured: boolean;
  eligibility: EligibilityState;
}

const EMPTY_TOKEN: TokenState = {
  address: null,
  balance: null,
  claimAmount: null,
  decimals: null,
};

function renderTokenBalance(
  fundingStatus: FundingStatus,
  token: TokenState,
  symbol: string,
): string {
  if (fundingStatus === "loading") return "Loading…";
  if (
    fundingStatus === "error" ||
    typeof token.balance !== "bigint" ||
    token.decimals === null ||
    !Number.isInteger(token.decimals)
  ) {
    return "Unavailable";
  }

  return `${formatTokenBalance(token.balance, token.decimals)} ${symbol}`;
}

function getEligibilityLabel({
  connected,
  correctNetwork,
  configured,
  eligibility,
}: EligibilityLabelOptions): string {
  if (!connected) return "Connect your wallet to check";
  if (!correctNetwork) return "Switch to Sepolia to check";
  if (!configured) return "Faucet address not configured";
  if (eligibility.status === "loading") return "Checking eligibility…";
  if (eligibility.status === "error") return "Eligibility unavailable";
  if (eligibility.status === "ready" && eligibility.eligible) {
    return "Available now";
  }
  if (
    eligibility.status === "ready" &&
    !eligibility.eligible &&
    eligibility.unlockTime !== null
  ) {
    return `Next claim: ${formatUnlockTime(eligibility.unlockTime)}`;
  }
  return "Eligibility not checked";
}

export function FaucetApp() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id });
  const [abis, setAbis] = useState<AbisState>({
    status: "loading",
    faucetAbi: null,
    erc20Abi: null,
  });
  const [funding, setFunding] = useState<FundingState>({
    status: "loading",
    paxg: EMPTY_TOKEN,
    usdc: EMPTY_TOKEN,
  });
  const [eligibility, setEligibility] = useState<EligibilityState>({
    status: "idle",
    eligible: null,
    unlockTime: null,
  });
  const [fundingRefreshKey, setFundingRefreshKey] = useState(0);
  const [eligibilityRefreshKey, setEligibilityRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusState>({ message: "", tone: "" });
  const configured = isConfiguredAddress(FAUCET_ADDRESS);

  useEffect(() => {
    let active = true;

    loadContractAbis()
      .then(({ faucetAbi, erc20Abi }) => {
        if (!active) return;
        setAbis({ status: "ready", faucetAbi, erc20Abi });
      })
      .catch((error) => {
        if (!active) return;
        setAbis({ status: "error", faucetAbi: null, erc20Abi: null });
        setFunding({ status: "error", paxg: EMPTY_TOKEN, usdc: EMPTY_TOKEN });
        setStatus({ message: getErrorMessage(error), tone: "error" });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshFaucetBalances() {
      setFunding({ status: "loading", paxg: EMPTY_TOKEN, usdc: EMPTY_TOKEN });

      if (
        !publicClient ||
        abis.status !== "ready" ||
        !configured
      ) {
        if (abis.status === "error" || !configured) {
          setFunding({ status: "error", paxg: EMPTY_TOKEN, usdc: EMPTY_TOKEN });
        }
        return;
      }

      try {
        const [paxgAddress, usdcAddress, paxgClaimAmount, usdcClaimAmount] = (await Promise.all([
            publicClient.readContract({
              address: FAUCET_ADDRESS,
              abi: abis.faucetAbi,
              functionName: "paxgInstance",
            }),
            publicClient.readContract({
              address: FAUCET_ADDRESS,
              abi: abis.faucetAbi,
              functionName: "usdcInstance",
            }),
            publicClient.readContract({
              address: FAUCET_ADDRESS,
              abi: abis.faucetAbi,
              functionName: "allowedPAXGAmount",
            }),
            publicClient.readContract({
              address: FAUCET_ADDRESS,
              abi: abis.faucetAbi,
              functionName: "allowedUSDCAmount",
            }),
          ])) as [Address, Address, bigint, bigint];

        const [paxgDecimals, paxgBalance, usdcDecimals, usdcBalance] = (await Promise.all([
            publicClient.readContract({
              address: paxgAddress,
              abi: abis.erc20Abi,
              functionName: "decimals",
            }),
            publicClient.readContract({
              address: paxgAddress,
              abi: abis.erc20Abi,
              functionName: "balanceOf",
              args: [FAUCET_ADDRESS],
            }),
            publicClient.readContract({
              address: usdcAddress,
              abi: abis.erc20Abi,
              functionName: "decimals",
            }),
            publicClient.readContract({
              address: usdcAddress,
              abi: abis.erc20Abi,
              functionName: "balanceOf",
              args: [FAUCET_ADDRESS],
            }),
          ])) as [number, bigint, number, bigint];

        if (!active) return;

        const paxg = {
          address: paxgAddress,
          balance: paxgBalance,
          claimAmount: paxgClaimAmount,
          decimals: Number(paxgDecimals),
        };
        const usdc = {
          address: usdcAddress,
          balance: usdcBalance,
          claimAmount: usdcClaimAmount,
          decimals: Number(usdcDecimals),
        };
        const funded = hasSufficientFunding({ paxg, usdc });

        setFunding({ status: funded ? "ready" : "underfunded", paxg, usdc });
      } catch {
        if (!active) return;
        setFunding({ status: "error", paxg: EMPTY_TOKEN, usdc: EMPTY_TOKEN });
      }
    }

    refreshFaucetBalances();

    return () => {
      active = false;
    };
  }, [abis, configured, fundingRefreshKey, publicClient]);

  useEffect(() => {
    let active = true;
    setEligibility({ status: "idle", eligible: null, unlockTime: null });

    if (
      !address ||
      chainId !== sepolia.id ||
      !configured ||
      !publicClient ||
      abis.status !== "ready"
    ) {
      return () => {
        active = false;
      };
    }

    setEligibility({ status: "loading", eligible: null, unlockTime: null });

    (Promise.all([
      publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: abis.faucetAbi,
        functionName: "isAllowedForTransaction",
        args: [address],
      }),
      publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: abis.faucetAbi,
        functionName: "getAllowedTime",
        args: [address],
      }),
    ]) as Promise<[boolean, bigint]>)
      .then(([eligible, unlockTime]) => {
        if (!active) return;
        setEligibility({ status: "ready", eligible, unlockTime });
      })
      .catch(() => {
        if (!active) return;
        setEligibility({ status: "error", eligible: null, unlockTime: null });
      });

    return () => {
      active = false;
    };
  }, [
    abis,
    address,
    chainId,
    configured,
    eligibilityRefreshKey,
    publicClient,
  ]);

  useEffect(() => {
    setStatus({ message: "", tone: "" });
  }, [address, chainId]);

  const claimTokens = useCallback(async () => {
    if (
      !address ||
      !publicClient ||
      !walletClient ||
      abis.status !== "ready"
    ) {
      return;
    }

    setBusy(true);
    setStatus({ message: "Confirm the transaction in your wallet.", tone: "" });

    try {
      const { request } = await publicClient.simulateContract({
        address: FAUCET_ADDRESS,
        abi: abis.faucetAbi,
        functionName: "claimTestTokens",
        account: address,
      });
      const hash = await walletClient.writeContract(request);

      setStatus({
        message: "Transaction submitted. Waiting for confirmation…",
        tone: "",
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");

      setStatus({ message: "Test tokens claimed successfully.", tone: "success" });
      setFundingRefreshKey((key) => key + 1);
      setEligibilityRefreshKey((key) => key + 1);
    } catch (error) {
      setStatus({ message: getErrorMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [abis, address, publicClient, walletClient]);

  const connectedToSepolia = isConnected && chainId === sepolia.id;
  const eligibilityLabel = useMemo(
    () =>
      getEligibilityLabel({
        connected: isConnected,
        correctNetwork: connectedToSepolia,
        configured,
        eligibility,
      }),
    [configured, connectedToSepolia, eligibility, isConnected],
  );

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const walletReady = mounted;
        const connected = walletReady && Boolean(account && chain);
        const correctNetwork = Boolean(
          connected && chain && !chain.unsupported && chain.id === sepolia.id,
        );
        const primary = getPrimaryAction({
          busy,
          walletReady,
          connected,
          correctNetwork,
          configured,
          fundingStatus: funding.status,
          eligibilityStatus: eligibility.status,
          eligible: eligibility.eligible,
        });

        const handlePrimaryAction = () => {
          setStatus({ message: "", tone: "" });
          if (primary.action === "connect") openConnectModal?.();
          if (primary.action === "switch") openChainModal?.();
          if (primary.action === "claim") void claimTokens();
        };

        return (
          <main className="faucet-card">
            <header>
              <p className="eyebrow">Sepolia Testnet</p>
              <h1>Test Token Faucet</h1>
              <p className="intro">
                Connect your wallet to claim both test tokens in one transaction.
              </p>
            </header>

            <section className="token-grid" aria-label="Claim amounts">
              <div className="token">
                <span className="token-symbol">PAXG</span>
                <strong>100 PAXG</strong>
                <small className="token-balance">
                  Faucet balance:{" "}
                  <strong>
                    {renderTokenBalance(funding.status, funding.paxg, "PAXG")}
                  </strong>
                </small>
              </div>
              <div className="token">
                <span className="token-symbol">USDC</span>
                <strong>10,000 USDC</strong>
                <small className="token-balance">
                  Faucet balance:{" "}
                  <strong>
                    {renderTokenBalance(funding.status, funding.usdc, "USDC")}
                  </strong>
                </small>
              </div>
            </section>

            <dl className="details">
              <div>
                <dt>Wallet</dt>
                <dd>
                  {connected && account ? (
                    <button
                      className="detail-action"
                      type="button"
                      disabled={busy}
                      onClick={() => openAccountModal?.()}
                      aria-label={`Manage wallet ${account.address}`}
                    >
                      {formatAddress(account.address)}
                    </button>
                  ) : (
                    "Not connected"
                  )}
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>
                  {connected && chain ? (
                    <button
                      className="detail-action"
                      type="button"
                      disabled={busy}
                      onClick={() => openChainModal?.()}
                      aria-label="Change network"
                    >
                      {correctNetwork ? "Sepolia" : chain.name || `Chain ${chain.id}`}
                    </button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Eligibility</dt>
                <dd>{eligibilityLabel}</dd>
              </div>
            </dl>

            <button
              className="primary-action"
              type="button"
              onClick={handlePrimaryAction}
              disabled={primary.disabled}
              aria-busy={busy}
            >
              {primary.label}
            </button>
            <p
              className="status"
              role="status"
              aria-live="polite"
              data-tone={status.tone || undefined}
            >
              {status.message}
            </p>

            <footer>
              <span>Faucet contract</span>
              <code>{configured ? FAUCET_ADDRESS : "Not configured"}</code>
            </footer>
          </main>
        );
      }}
    </ConnectButton.Custom>
  );
}
