import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Abi, Address } from "viem";
import { sepolia } from "wagmi/chains";
import { beforeEach, describe, expect, test, vi } from "vitest";

const ACCOUNT_A = "0x00000000000000000000000000000000000000a1" as Address;
const ACCOUNT_B = "0x00000000000000000000000000000000000000b2" as Address;
const TRANSACTION_HASH = `0x${"1".repeat(64)}` as const;
const TEST_ABI = [] as unknown as Abi;

const mocks = vi.hoisted(() => {
  const readContract = vi.fn();
  const simulateContract = vi.fn();
  const waitForTransactionReceipt = vi.fn();
  const writeContract = vi.fn();

  return {
    account: {
      address: undefined as Address | undefined,
      chainId: undefined as number | undefined,
      isConnected: false,
    },
    rainbow: {
      account: undefined as { address: Address } | undefined,
      chain: undefined as
        | { id: number; name: string; unsupported: boolean }
        | undefined,
      mounted: true,
      openAccountModal: vi.fn(),
      openChainModal: vi.fn(),
      openConnectModal: vi.fn(),
    },
    loadContractAbis: vi.fn(),
    readContract,
    simulateContract,
    waitForTransactionReceipt,
    writeContract,
    publicClient: { readContract, simulateContract, waitForTransactionReceipt },
    walletClient: { writeContract },
  };
});

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({
      children,
    }: {
      children: (state: typeof mocks.rainbow) => ReactNode;
    }) => children(mocks.rainbow),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => mocks.publicClient,
  useWalletClient: () => ({ data: mocks.walletClient }),
}));

vi.mock("./abi", () => ({
  loadContractAbis: mocks.loadContractAbis,
}));

import { FaucetApp } from "./app";
import { FAUCET_ADDRESS, WALLETCONNECT_PROJECT_ID } from "./config";
import { isConfiguredAddress } from "./core";

interface ContractRequest {
  functionName: string;
  args?: readonly unknown[];
}

function readFundedFaucet({ functionName }: ContractRequest): Promise<unknown> {
  const values: Record<string, unknown> = {
    paxgInstance: "0x0000000000000000000000000000000000000001",
    usdcInstance: "0x0000000000000000000000000000000000000002",
    allowedPAXGAmount: 1n,
    allowedUSDCAmount: 1n,
    decimals: 6,
    balanceOf: 1_000_000n,
    isAllowedForTransaction: true,
    getAllowedTime: 200n,
  };

  return Promise.resolve(values[functionName]);
}

function connect(
  address: Address = ACCOUNT_A,
  chain: { id: number; name: string; unsupported: boolean } = {
    id: sepolia.id,
    name: "Sepolia",
    unsupported: false,
  },
) {
  Object.assign(mocks.account, {
    address,
    chainId: chain.id,
    isConnected: true,
  });
  Object.assign(mocks.rainbow, {
    account: { address },
    chain,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.assign(mocks.account, {
    address: undefined,
    chainId: undefined,
    isConnected: false,
  });
  Object.assign(mocks.rainbow, {
    account: undefined,
    chain: undefined,
    mounted: true,
  });
  mocks.rainbow.openAccountModal.mockReset();
  mocks.rainbow.openChainModal.mockReset();
  mocks.rainbow.openConnectModal.mockReset();
  mocks.loadContractAbis.mockReset();
  mocks.readContract.mockReset();
  mocks.simulateContract.mockReset();
  mocks.waitForTransactionReceipt.mockReset();
  mocks.writeContract.mockReset();

  mocks.loadContractAbis.mockResolvedValue({
    faucetAbi: TEST_ABI,
    erc20Abi: TEST_ABI,
  });
  mocks.readContract.mockImplementation(readFundedFaucet);
  mocks.simulateContract.mockResolvedValue({ request: { data: "0x" } });
  mocks.writeContract.mockResolvedValue(TRANSACTION_HASH);
  mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("RainbowKit faucet", () => {
  test("opens RainbowKit while faucet balances load independently", async () => {
    const user = userEvent.setup();
    render(<FaucetApp />);

    await user.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(mocks.rainbow.openConnectModal).toHaveBeenCalledOnce();
    expect(await screen.findByText("1 PAXG")).toBeInTheDocument();
    expect(await screen.findByText("1 USDC")).toBeInTheDocument();
  });

  test("opens RainbowKit account and network controls when connected", async () => {
    const user = userEvent.setup();
    connect();
    render(<FaucetApp />);

    await screen.findByRole("button", { name: "Claim test tokens" });
    await user.click(
      screen.getByRole("button", { name: `Manage wallet ${ACCOUNT_A}` }),
    );
    await user.click(screen.getByRole("button", { name: "Change network" }));

    expect(mocks.rainbow.openAccountModal).toHaveBeenCalledOnce();
    expect(mocks.rainbow.openChainModal).toHaveBeenCalledOnce();
  });

  test("uses RainbowKit to switch an unsupported network", async () => {
    const user = userEvent.setup();
    connect(ACCOUNT_A, { id: 1, name: "Ethereum", unsupported: true });
    render(<FaucetApp />);

    await user.click(
      screen.getByRole("button", { name: "Switch to Sepolia" }),
    );

    expect(mocks.rainbow.openChainModal).toHaveBeenCalledOnce();
    expect(screen.getByText("Switch to Sepolia to check")).toBeInTheDocument();
  });

  test("simulates, submits, confirms, and refreshes a claim", async () => {
    const user = userEvent.setup();
    connect();
    render(<FaucetApp />);

    await user.click(
      await screen.findByRole("button", { name: "Claim test tokens" }),
    );

    expect(
      await screen.findByText("Test tokens claimed successfully."),
    ).toBeInTheDocument();
    expect(mocks.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: FAUCET_ADDRESS,
        functionName: "claimTestTokens",
        account: ACCOUNT_A,
      }),
    );
    expect(mocks.writeContract).toHaveBeenCalledOnce();
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TRANSACTION_HASH,
    });
    await waitFor(() => {
      expect(
        mocks.readContract.mock.calls.filter(
          ([request]) => request.functionName === "paxgInstance",
        ),
      ).toHaveLength(2);
    });
  });

  test("ignores an eligibility response for a previous account", async () => {
    const requests = new Map(
      [ACCOUNT_A, ACCOUNT_B].map((account) => [
        account,
        {
          isAllowedForTransaction: deferred<boolean>(),
          getAllowedTime: deferred<bigint>(),
        },
      ]),
    );
    mocks.readContract.mockImplementation((request: ContractRequest) => {
      if (request.args) {
        const address = request.args[0] as Address;
        const accountRequests = requests.get(address);
        if (!accountRequests) throw new Error("Unexpected account");
        return accountRequests[
          request.functionName as keyof typeof accountRequests
        ].promise;
      }
      return readFundedFaucet(request);
    });

    connect(ACCOUNT_A);
    const view = render(<FaucetApp />);
    await waitFor(() => {
      expect(
        mocks.readContract.mock.calls.some(
          ([request]) => request.args?.[0] === ACCOUNT_A,
        ),
      ).toBe(true);
    });

    connect(ACCOUNT_B);
    view.rerender(<FaucetApp />);
    await waitFor(() => {
      expect(
        mocks.readContract.mock.calls.some(
          ([request]) => request.args?.[0] === ACCOUNT_B,
        ),
      ).toBe(true);
    });

    await act(async () => {
      requests.get(ACCOUNT_B)?.isAllowedForTransaction.resolve(true);
      requests.get(ACCOUNT_B)?.getAllowedTime.resolve(200n);
    });
    expect(await screen.findByText("Available now")).toBeInTheDocument();

    await act(async () => {
      requests.get(ACCOUNT_A)?.isAllowedForTransaction.resolve(false);
      requests.get(ACCOUNT_A)?.getAllowedTime.resolve(100n);
    });
    expect(screen.getByText("Available now")).toBeInTheDocument();
  });

  test("keeps the deployed faucet and WalletConnect configuration", () => {
    expect(isConfiguredAddress(FAUCET_ADDRESS)).toBe(true);
    expect(WALLETCONNECT_PROJECT_ID).toBe(
      "a49cea0f5de43d265d08b4bc62e9ca76",
    );
  });
});
