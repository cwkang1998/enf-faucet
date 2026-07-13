import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "https://esm.sh/viem@2.48.11";
import { sepolia } from "https://esm.sh/viem@2.48.11/chains";

import { FAUCET_ABI, FAUCET_ADDRESS, SEPOLIA_CHAIN_ID } from "./config.mjs";
import {
  formatAddress,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  isConfiguredAddress,
} from "./core.mjs";

const elements = {
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
  eligible: false,
  unlockTime: 0n,
  busy: false,
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

function setStatus(message = "", tone = "") {
  elements.status.textContent = message;
  if (tone) elements.status.dataset.tone = tone;
  else delete elements.status.dataset.tone;
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
    eligible: state.eligible,
  });

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
  } else if (state.eligible) {
    elements.eligibility.textContent = "Available now";
  } else {
    elements.eligibility.textContent = `Next claim: ${formatUnlockTime(state.unlockTime)}`;
  }

  elements.action.textContent = primary.label;
  elements.action.dataset.action = primary.action;
  elements.action.disabled = primary.disabled;
  elements.contract.textContent = configured ? FAUCET_ADDRESS : "Not configured";
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
  state.eligible = false;
  state.unlockTime = 0n;

  if (
    !state.account ||
    state.chainId !== SEPOLIA_CHAIN_ID ||
    !isConfiguredAddress(FAUCET_ADDRESS)
  ) {
    render();
    return;
  }

  const [eligible, unlockTime] = await Promise.all([
    publicClient.readContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: "isAllowedForTransaction",
      args: [state.account],
    }),
    publicClient.readContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: "getAllowedTime",
      args: [state.account],
    }),
  ]);

  state.eligible = eligible;
  state.unlockTime = unlockTime;
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
      abi: FAUCET_ABI,
      functionName: "claimTestTokens",
      account: state.account,
    });
    const hash = await walletClient.writeContract(request);

    setStatus("Transaction submitted. Waiting for confirmation…");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");

    setStatus("Test tokens claimed successfully.", "success");
    await refreshEligibility();
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

  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", handleWalletChange);
  window.ethereum.on("chainChanged", handleWalletChange);
  await syncWallet();
  await refreshEligibility();
}

initialize().catch((error) => {
  setStatus(getErrorMessage(error), "error");
  render();
});
