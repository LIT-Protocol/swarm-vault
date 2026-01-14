import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { getTokensForChain, type TokenInfo } from "@swarm-vault/shared";
import { formatUnits } from "viem";
import { signSafeMessage } from "../lib/safeMessage";

interface SwapFormProps {
  swarmId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  requiresSafeSignoff?: boolean;
  safeAddress?: string | null;
}

interface HoldingsData {
  ethBalance: string;
  tokens: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
    totalBalance: string;
    holderCount: number;
  }[];
  memberCount: number;
  commonTokens: TokenInfo[];
}

interface SwapPreviewData {
  sellToken: string;
  buyToken: string;
  sellPercentage: number;
  slippagePercentage: number;
  members: {
    membershipId: string;
    userId: string;
    userWalletAddress: string;
    agentWalletAddress: string;
    sellAmount: string;
    buyAmount: string;
    feeAmount?: string;
    estimatedPriceImpact: string;
    sources: { name: string; proportion: string }[];
    error?: string;
  }[];
  totalSellAmount: string;
  totalBuyAmount: string;
  totalFeeAmount: string;
  successCount: number;
  errorCount: number;
  fee: {
    bps: number;
    percentage: string;
    recipientAddress: string;
  } | null;
}

interface SwapExecuteResult {
  transactionId: string;
  status: string;
  memberCount: number;
  message: string;
}

const chainId = parseInt(import.meta.env.VITE_CHAIN_ID || "84532");

interface ProposalResult {
  id: string;
  actionType: string;
  safeMessageHash: string; // Raw message string for signing
  status: string;
  signUrl?: string;
}

export default function SwapForm({
  swarmId,
  isOpen,
  onClose,
  onSubmitted,
  requiresSafeSignoff = false,
  safeAddress,
}: SwapFormProps) {
  const [step, setStep] = useState<"form" | "preview" | "executing" | "done">("form");
  const [proposalResult, setProposalResult] = useState<ProposalResult | null>(null);
  const [holdings, setHoldings] = useState<HoldingsData | null>(null);
  const [isLoadingHoldings, setIsLoadingHoldings] = useState(false);
  const [preview, setPreview] = useState<SwapPreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  // Form state
  const [sellToken, setSellToken] = useState("");
  const [buyToken, setBuyToken] = useState("");
  const [sellPercentage, setSellPercentage] = useState(100);
  const [slippagePercentage, setSlippagePercentage] = useState(1);

  // Get common tokens
  const commonTokens = getTokensForChain(chainId);

  // Fetch holdings on open
  useEffect(() => {
    if (isOpen) {
      fetchHoldings();
    } else {
      // Reset state when closed
      setStep("form");
      setPreview(null);
      setError(null);
      setTransactionId(null);
      setProposalResult(null);
    }
  }, [isOpen, swarmId]);

  const fetchHoldings = async () => {
    try {
      setIsLoadingHoldings(true);
      setError(null);
      const data = await api.get<HoldingsData>(`/api/swarms/${swarmId}/holdings`);
      setHoldings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch holdings");
    } finally {
      setIsLoadingHoldings(false);
    }
  };

  const handlePreview = async () => {
    if (!sellToken || !buyToken) {
      setError("Please select both sell and buy tokens");
      return;
    }

    if (sellToken === buyToken) {
      setError("Sell and buy tokens must be different");
      return;
    }

    try {
      setIsLoadingPreview(true);
      setError(null);
      const data = await api.post<SwapPreviewData>(
        `/api/swarms/${swarmId}/swap/preview`,
        {
          sellToken,
          buyToken,
          sellPercentage,
          slippagePercentage,
        }
      );
      setPreview(data);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get preview");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExecute = async () => {
    try {
      setIsExecuting(true);
      setStep("executing");
      setError(null);

      if (requiresSafeSignoff) {
        if (!safeAddress) {
          throw new Error("SAFE address is required for SAFE sign-off");
        }

        // Step 1: Create a proposal
        const result = await api.post<ProposalResult>(
          `/api/swarms/${swarmId}/proposals`,
          {
            actionType: "SWAP",
            actionData: {
              type: "swap",
              sellToken,
              buyToken,
              sellPercentage,
              slippagePercentage,
            },
            expiresInHours: 24,
          }
        );

        // Step 2: Sign using Safe Protocol Kit's signMessage method
        // This uses ETH_SIGN_TYPED_DATA_V4 which handles all the EIP-712 signing correctly
        try {
          console.log("[SwapForm] Signing with Safe Protocol Kit...");
          console.log("[SwapForm] Safe address:", safeAddress);
          console.log("[SwapForm] Message (proposal hash):", result.safeMessageHash);

          const signature = await signSafeMessage(
            safeAddress,
            result.safeMessageHash
          );

          console.log("[SwapForm] Signature:", signature);

          // Step 3: Submit the signature to propose the message to SAFE
          const proposeResult = await api.post<{
            id: string;
            safeMessageHash: string;
            signUrl: string;
            message: string;
          }>(`/api/proposals/${result.id}/propose-to-safe`, {
            signature,
          });

          // Update the signUrl from the propose result
          result.signUrl = proposeResult.signUrl;
        } catch (signError) {
          // If signing fails, still show the proposal result but with a warning
          console.warn("Failed to sign and propose to SAFE:", signError);
          // The signUrl won't work until the message is proposed, but user can try again
        }

        setProposalResult(result);
        setStep("done");
        onSubmitted();
      } else {
        // Execute directly
        const result = await api.post<SwapExecuteResult>(
          `/api/swarms/${swarmId}/swap/execute`,
          {
            sellToken,
            buyToken,
            sellPercentage,
            slippagePercentage,
          }
        );

        setTransactionId(result.transactionId);
        setStep("done");
        onSubmitted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : requiresSafeSignoff ? "Failed to create proposal" : "Failed to execute swap");
      setStep("preview");
    } finally {
      setIsExecuting(false);
    }
  };

  const getTokenDisplay = (address: string) => {
    // Check holdings first
    if (holdings) {
      if (address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        return { symbol: "ETH", name: "Ethereum", decimals: 18 };
      }
      const token = holdings.tokens.find(
        (t) => t.address.toLowerCase() === address.toLowerCase()
      );
      if (token) return token;
    }
    // Then check common tokens
    const common = commonTokens.find(
      (t) => t.address.toLowerCase() === address.toLowerCase()
    );
    if (common) return common;
    return { symbol: address.slice(0, 6), name: "Unknown", decimals: 18 };
  };

  const formatAmount = (amount: string, decimals: number) => {
    if (!amount || amount === "0") return "0";
    const formatted = formatUnits(BigInt(amount), decimals);
    const num = parseFloat(formatted);
    if (num < 0.0001 && num > 0) return "<0.0001";
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black bg-opacity-25"
          onClick={onClose}
        />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {step === "form" && (requiresSafeSignoff ? "New Swap Proposal" : "New Swap")}
              {step === "preview" && "Preview Swap"}
              {step === "executing" && (requiresSafeSignoff ? "Creating Proposal..." : "Executing Swap...")}
              {step === "done" && (requiresSafeSignoff ? "Proposal Created" : "Swap Submitted")}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {isLoadingHoldings ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading holdings...</span>
              </div>
            ) : step === "form" ? (
              <div className="space-y-6">
                {/* Sell Token */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sell Token
                  </label>
                  <select
                    value={sellToken}
                    onChange={(e) => setSellToken(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select token to sell</option>
                    {/* Held tokens */}
                    {holdings && BigInt(holdings.ethBalance) > 0n && (
                      <option value="0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE">
                        ETH ({formatAmount(holdings.ethBalance, 18)} total)
                      </option>
                    )}
                    {holdings?.tokens.map((token) => (
                      <option key={token.address} value={token.address}>
                        {token.symbol} ({formatAmount(token.totalBalance, token.decimals)} total)
                      </option>
                    ))}
                    {/* Separator if we have holdings */}
                    {holdings && (holdings.tokens.length > 0 || BigInt(holdings.ethBalance) > 0n) && (
                      <option disabled>──────────</option>
                    )}
                    {/* Common tokens not in holdings */}
                    {commonTokens
                      .filter((t) => {
                        if (!holdings) return true;
                        if (t.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
                          return BigInt(holdings.ethBalance) === 0n;
                        }
                        return !holdings.tokens.some(
                          (h) => h.address.toLowerCase() === t.address.toLowerCase()
                        );
                      })
                      .map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol} (no holdings)
                        </option>
                      ))}
                  </select>
                </div>

                {/* Buy Token */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buy Token
                  </label>
                  <select
                    value={buyToken}
                    onChange={(e) => setBuyToken(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select token to buy</option>
                    {commonTokens.map((token) => (
                      <option key={token.address} value={token.address}>
                        {token.symbol} - {token.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sell Percentage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sell Percentage: {sellPercentage}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={sellPercentage}
                    onChange={(e) => setSellPercentage(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Slippage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Slippage Tolerance
                  </label>
                  <div className="flex gap-2">
                    {[0.5, 1, 2, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSlippagePercentage(value)}
                        className={`px-3 py-1 text-sm rounded-lg border ${
                          slippagePercentage === value
                            ? "bg-blue-100 border-blue-500 text-blue-700"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {value}%
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.1"
                      value={slippagePercentage}
                      onChange={(e) => setSlippagePercentage(parseFloat(e.target.value) || 1)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Member Info */}
                {holdings && (
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                    <p>
                      This swap will be executed for{" "}
                      <span className="font-semibold">{holdings.memberCount}</span> active
                      member{holdings.memberCount !== 1 ? "s" : ""}.
                    </p>
                  </div>
                )}

                {/* Preview Button */}
                <button
                  onClick={handlePreview}
                  disabled={!sellToken || !buyToken || isLoadingPreview}
                  className="w-full py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoadingPreview ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Getting Preview...
                    </>
                  ) : (
                    "Preview Swap"
                  )}
                </button>
              </div>
            ) : step === "preview" && preview ? (
              <div className="space-y-6">
                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <p className="text-sm text-gray-500">Selling</p>
                      <p className="text-lg font-semibold">
                        {formatAmount(
                          preview.totalSellAmount,
                          getTokenDisplay(preview.sellToken).decimals
                        )}{" "}
                        {getTokenDisplay(preview.sellToken).symbol}
                      </p>
                    </div>
                    <div className="px-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-sm text-gray-500">Buying</p>
                      <p className="text-lg font-semibold text-green-600">
                        {formatAmount(
                          preview.totalBuyAmount,
                          getTokenDisplay(preview.buyToken).decimals
                        )}{" "}
                        {getTokenDisplay(preview.buyToken).symbol}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm text-gray-600">
                    <span>{preview.successCount} wallets will swap</span>
                    {preview.errorCount > 0 && (
                      <span className="text-amber-600">{preview.errorCount} wallets skipped</span>
                    )}
                  </div>
                </div>

                {/* Fee breakdown */}
                {preview.fee && BigInt(preview.totalFeeAmount) > 0n && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h4 className="text-sm font-medium text-amber-800">Platform Fee</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-amber-700">
                        <span>Fee rate:</span>
                        <span className="font-medium">{preview.fee.percentage}</span>
                      </div>
                      <div className="flex justify-between text-amber-700">
                        <span>Total fee:</span>
                        <span className="font-medium">
                          {formatAmount(
                            preview.totalFeeAmount,
                            getTokenDisplay(preview.buyToken).decimals
                          )}{" "}
                          {getTokenDisplay(preview.buyToken).symbol}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-600 text-xs mt-2 pt-2 border-t border-amber-200">
                        <span>Fee recipient:</span>
                        <span className="font-mono">
                          {preview.fee.recipientAddress.slice(0, 6)}...
                          {preview.fee.recipientAddress.slice(-4)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Per-member breakdown */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Breakdown by Member
                  </h4>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                            Wallet
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                            Sell
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                            Receive
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {preview.members.map((member) => (
                          <tr
                            key={member.agentWalletAddress}
                            className={member.error ? "bg-red-50" : ""}
                          >
                            <td className="px-3 py-2 text-sm font-mono text-gray-700">
                              {member.agentWalletAddress.slice(0, 6)}...
                              {member.agentWalletAddress.slice(-4)}
                            </td>
                            <td className="px-3 py-2 text-sm text-right text-gray-700">
                              {member.error ? (
                                <span className="text-red-600 text-xs">
                                  {member.error}
                                </span>
                              ) : (
                                formatAmount(
                                  member.sellAmount,
                                  getTokenDisplay(preview.sellToken).decimals
                                )
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm text-right text-green-600">
                              {!member.error &&
                                formatAmount(
                                  member.buyAmount,
                                  getTokenDisplay(preview.buyToken).decimals
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Slippage warning */}
                <div className="text-sm text-gray-500">
                  Slippage tolerance: {preview.slippagePercentage}%
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("form")}
                    className="flex-1 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleExecute}
                    disabled={preview.successCount === 0 || isExecuting}
                    className="flex-1 py-3 text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {requiresSafeSignoff ? "Creating..." : "Executing..."}
                      </>
                    ) : requiresSafeSignoff ? (
                      "Create Proposal"
                    ) : (
                      "Execute Swap"
                    )}
                  </button>
                </div>
              </div>
            ) : step === "executing" ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Submitting swap transactions...</p>
                <p className="text-sm text-gray-500 mt-2">
                  This may take a moment
                </p>
              </div>
            ) : step === "done" ? (
              <div className="text-center py-8">
                <div className={`w-16 h-16 ${proposalResult ? "bg-yellow-100" : "bg-green-100"} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  {proposalResult ? (
                    <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {proposalResult ? "Proposal Created!" : "Swap Submitted!"}
                </h3>
                <p className="text-gray-600 mb-4">
                  {proposalResult
                    ? "Your swap proposal has been created and is awaiting SAFE approval."
                    : "Your swap transactions are being processed."}
                </p>
                {proposalResult && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      Proposal ID: {proposalResult.id.slice(0, 8)}...
                    </p>
                    {proposalResult.signUrl && (
                      <a
                        href={proposalResult.signUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Sign in SAFE
                      </a>
                    )}
                  </div>
                )}
                {transactionId && !proposalResult && (
                  <p className="text-sm text-gray-500">
                    Transaction ID: {transactionId.slice(0, 8)}...
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="mt-6 px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
