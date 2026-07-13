import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "https://esm.sh/viem@2.48.11";
import { sepolia } from "https://esm.sh/viem@2.48.11/chains";

import { loadContractAbis } from "./abi.mjs";
import { FAUCET_ADDRESS, SEPOLIA_CHAIN_ID } from "./config.mjs";
import {
  formatAddress,
  formatTokenBalance,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  hasSufficientFunding,
  isConfiguredAddress,
} from "./core.mjs";

const elements = {
  paxgBalance: document.querySelector("#paxgBalance"),
  usdcBalance: document.querySelector("#usdcBalance"),
  wallet: document.querySelector("#walletValue"),
  network: document.querySelector("#networkValue"),
  eligibility: document.querySelector("#eligibilityValue"),
  action: document.querySelector("#actionButton"),
  status: document.querySelector("#statusMessage"),
  contract: document.querySelector("#contractValue"),
};

const state = {
  walletInstalled: Boolean(window.ethereum),
  account: null,
  chainId: null,
  faucetAbi: null,
  erc20Abi: null,
  fundingStatus: "loading",
  paxg: { address: null, balance: null, claimAmount: null, decimals: null },
  usdc: { address: null, balance: null, claimAmount: null, decimals: null },
  eligibilityStatus: "idle",
  eligible: null,
  unlockTime: null,
  busy: false,
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});
let eligibilityRequestId = 0;

function setStatus(message = "", tone = "") {
  elements.status.textContent = message;
  if (tone) elements.status.dataset.tone = tone;
  else delete elements.status.dataset.tone;
}

function renderTokenBalance(token, symbol) {
  if (state.fundingStatus === "loading") return "Loading…";
  if (
    state.fundingStatus === "error" ||
    typeof token.balance !== "bigint" ||
    !Number.isInteger(token.decimals)
  ) {
    return "Unavailable";
  }

  return `${formatTokenBalance(token.balance, token.decimals)} ${symbol}`;
}

function render() {
  const correctNetwork = state.chainId === SEPOLIA_CHAIN_ID;
  const configured = isConfiguredAddress(FAUCET_ADDRESS);
  const primary = getPrimaryAction({
    busy: state.busy,
    walletInstalled: state.walletInstalled,
    connected: Boolean(state.account),
    correctNetwork,
    configured,
    fundingStatus: state.fundingStatus,
    eligibilityStatus: state.eligibilityStatus,
    eligible: state.eligible,
  });

  elements.paxgBalance.textContent = renderTokenBalance(state.paxg, "PAXG");
  elements.usdcBalance.textContent = renderTokenBalance(state.usdc, "USDC");
  elements.wallet.textContent = formatAddress(state.account);
  elements.network.textContent = state.account
    ? correctNetwork
      ? "Sepolia"
      : `Chain ${state.chainId}`
    : "—";

  if (!state.account) {
    elements.eligibility.textContent = "Connect your wallet to check";
  } else if (!correctNetwork) {
    elements.eligibility.textContent = "Switch to Sepolia to check";
  } else if (!configured) {
    elements.eligibility.textContent = "Faucet address not configured";
  } else if (state.eligibilityStatus === "loading") {
    elements.eligibility.textContent = "Checking eligibility…";
  } else if (state.eligibilityStatus === "error") {
    elements.eligibility.textContent = "Eligibility unavailable";
  } else if (state.eligibilityStatus === "ready" && state.eligible) {
    elements.eligibility.textContent = "Available now";
  } else if (state.eligibilityStatus === "ready" && !state.eligible) {
    elements.eligibility.textContent = `Next claim: ${formatUnlockTime(state.unlockTime)}`;
  } else {
    elements.eligibility.textContent = "Eligibility not checked";
  }

  elements.action.textContent = primary.label;
  elements.action.dataset.action = primary.action;
  elements.action.disabled = primary.disabled;
  elements.contract.textContent = configured ? FAUCET_ADDRESS : "Not configured";
}

async function refreshFaucetBalances() {
  state.fundingStatus = "loading";
  state.paxg = { address: null, balance: null, claimAmount: null, decimals: null };
  state.usdc = { address: null, balance: null, claimAmount: null, decimals: null };
  render();

  if (!state.faucetAbi || !state.erc20Abi || !isConfiguredAddress(FAUCET_ADDRESS)) {
    state.fundingStatus = "error";
    render();
    return;
  }

  try {
    const [paxgAddress, usdcAddress, paxgClaimAmount, usdcClaimAmount] =
      await Promise.all([
        publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: state.faucetAbi,
          functionName: "paxgInstance",
        }),
        publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: state.faucetAbi,
          functionName: "usdcInstance",
        }),
        publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: state.faucetAbi,
          functionName: "allowedPAXGAmount",
        }),
        publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: state.faucetAbi,
          functionName: "allowedUSDCAmount",
        }),
      ]);

    const [paxgDecimals, paxgBalance, usdcDecimals, usdcBalance] =
      await Promise.all([
        publicClient.readContract({
          address: paxgAddress,
          abi: state.erc20Abi,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: paxgAddress,
          abi: state.erc20Abi,
          functionName: "balanceOf",
          args: [FAUCET_ADDRESS],
        }),
        publicClient.readContract({
          address: usdcAddress,
          abi: state.erc20Abi,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: usdcAddress,
          abi: state.erc20Abi,
          functionName: "balanceOf",
          args: [FAUCET_ADDRESS],
        }),
      ]);

    state.paxg = {
      address: paxgAddress,
      balance: paxgBalance,
      claimAmount: paxgClaimAmount,
      decimals: Number(paxgDecimals),
    };
    state.usdc = {
      address: usdcAddress,
      balance: usdcBalance,
      claimAmount: usdcClaimAmount,
      decimals: Number(usdcDecimals),
    };
    const funded = hasSufficientFunding({ paxg: state.paxg, usdc: state.usdc });
    state.fundingStatus = funded ? "ready" : "underfunded";
  } catch {
    state.fundingStatus = "error";
  }

  render();
}

async function syncWallet() {
  if (!window.ethereum) return;

  const [accounts, chainId] = await Promise.all([
    window.ethereum.request({ method: "eth_accounts" }),
    window.ethereum.request({ method: "eth_chainId" }),
  ]);

  state.account = accounts[0] ?? null;
  state.chainId = Number.parseInt(chainId, 16);
}

async function refreshEligibility() {
  const requestId = ++eligibilityRequestId;
  const account = state.account;
  const chainId = state.chainId;
  state.eligibilityStatus = "idle";
  state.eligible = null;
  state.unlockTime = null;

  if (
    !account ||
    chainId !== SEPOLIA_CHAIN_ID ||
    !isConfiguredAddress(FAUCET_ADDRESS)
  ) {
    render();
    return;
  }

  state.eligibilityStatus = "loading";
  render();

  try {
    const [eligible, unlockTime] = await Promise.all([
      publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: state.faucetAbi,
        functionName: "isAllowedForTransaction",
        args: [account],
      }),
      publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: state.faucetAbi,
        functionName: "getAllowedTime",
        args: [account],
      }),
    ]);

    if (
      requestId !== eligibilityRequestId ||
      state.account !== account ||
      state.chainId !== chainId
    ) {
      return;
    }

    state.eligible = eligible;
    state.unlockTime = unlockTime;
    state.eligibilityStatus = "ready";
  } catch {
    if (
      requestId !== eligibilityRequestId ||
      state.account !== account ||
      state.chainId !== chainId
    ) {
      return;
    }

    state.eligibilityStatus = "error";
  }

  render();
}

async function connectWallet() {
  await window.ethereum.request({ method: "eth_requestAccounts" });
  await syncWallet();
  await refreshEligibility();
}

async function switchNetwork() {
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0xaa36a7" }],
  });
  await syncWallet();
  await refreshEligibility();
}

async function claimTokens() {
  state.busy = true;
  setStatus("Confirm the transaction in your wallet.");
  render();

  try {
    const walletClient = createWalletClient({
      account: state.account,
      chain: sepolia,
      transport: custom(window.ethereum),
    });
    const { request } = await publicClient.simulateContract({
      address: FAUCET_ADDRESS,
      abi: state.faucetAbi,
      functionName: "claimTestTokens",
      account: state.account,
    });
    const hash = await walletClient.writeContract(request);

    setStatus("Transaction submitted. Waiting for confirmation…");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");

    setStatus("Test tokens claimed successfully.", "success");
    await Promise.all([refreshEligibility(), refreshFaucetBalances()]);
  } catch (error) {
    setStatus(getErrorMessage(error), "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function handleAction() {
  setStatus();

  try {
    switch (elements.action.dataset.action) {
      case "install":
        window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
        break;
      case "connect":
        await connectWallet();
        break;
      case "switch":
        await switchNetwork();
        break;
      case "claim":
        await claimTokens();
        break;
    }
  } catch (error) {
    setStatus(getErrorMessage(error), "error");
  }
}

async function handleWalletChange() {
  setStatus();
  try {
    await syncWallet();
    await refreshEligibility();
  } catch (error) {
    setStatus(getErrorMessage(error), "error");
    render();
  }
}

async function initialize() {
  elements.action.addEventListener("click", handleAction);
  render();

  try {
    const { faucetAbi, erc20Abi } = await loadContractAbis();
    state.faucetAbi = faucetAbi;
    state.erc20Abi = erc20Abi;
    await refreshFaucetBalances();
  } catch (error) {
    state.fundingStatus = "error";
    setStatus(getErrorMessage(error), "error");
    render();
    return;
  }

  if (!window.ethereum) return;

  try {
    window.ethereum.on("accountsChanged", handleWalletChange);
    window.ethereum.on("chainChanged", handleWalletChange);
    await syncWallet();
    await refreshEligibility();
  } catch (error) {
    setStatus(getErrorMessage(error), "error");
    render();
  }
}

initialize().catch((error) => {
  setStatus(getErrorMessage(error), "error");
  render();
});
