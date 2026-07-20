import type { Abi } from "viem";

const SETUP_ERROR =
  "Forge ABI artifacts unavailable. Run forge build before serving the frontend.";

const FAUCET_ARTIFACT_URL = new URL(
  "./Faucet.json",
  import.meta.url,
);
const ERC20_ARTIFACT_URL = new URL(
  "./ERC20.json",
  import.meta.url,
);

interface ContractArtifact {
  abi?: unknown;
}

export interface ContractAbis {
  faucetAbi: Abi;
  erc20Abi: Abi;
}

export async function loadContractAbis(
  fetchImpl: typeof fetch = fetch,
): Promise<ContractAbis> {
  try {
    const responses = await Promise.all([
      fetchImpl(FAUCET_ARTIFACT_URL),
      fetchImpl(ERC20_ARTIFACT_URL),
    ]);

    if (responses.some((response) => !response.ok)) throw new Error();

    const [faucetArtifact, erc20Artifact] = (await Promise.all(
      responses.map((response) => response.json()),
    )) as [ContractArtifact, ContractArtifact];

    if (
      !Array.isArray(faucetArtifact?.abi) ||
      faucetArtifact.abi.length === 0 ||
      !Array.isArray(erc20Artifact?.abi) ||
      erc20Artifact.abi.length === 0
    ) {
      throw new Error();
    }

    return {
      faucetAbi: faucetArtifact.abi as Abi,
      erc20Abi: erc20Artifact.abi as Abi,
    };
  } catch {
    throw new Error(SETUP_ERROR);
  }
}
