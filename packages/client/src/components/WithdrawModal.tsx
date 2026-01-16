import { useState, useEffect } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import {
  withdrawToken,
  withdrawETH,
  swarmIdToIndex,
  type WithdrawResult,
} from "../lib/smartWallet";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agentWalletAddress: string;
  swarmId: string;
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    isETH?: boolean;
  };
}

type WithdrawStatus =
  | "idle"
  | "preparing"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export default function WithdrawModal({
  isOpen,
  onClose,
  onSuccess,
  agentWalletAddress,
  swarmId,
  token,
}: WithdrawModalProps) {
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<WithdrawStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setStatus("idle");
      setError(null);
      setTxHash(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedBalance = formatUnits(BigInt(token.balance), token.decimals);
  const maxAmount = parseFloat(formattedBalance);

  // Validate amount
  const parsedAmount = parseFloat(amount);
  const isValidAmount =
    !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxAmount;

  const handleMaxClick = () => {
    setAmount(formattedBalance);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, or valid decimal number
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const handleWithdraw = async () => {
    if (!walletClient || !userAddress || !isValidAmount) return;

    try {
      setStatus("preparing");
      setError(null);

      // Parse amount to smallest unit
      const amountWei = parseUnits(amount, token.decimals);
      const index = swarmIdToIndex(swarmId);

      let result: WithdrawResult;

      setStatus("signing");

      if (token.isETH) {
        // ETH withdrawal
        result = await withdrawETH({
          walletClient,
          agentWalletAddress: agentWalletAddress as Address,
          amount: amountWei,
          destinationAddress: userAddress,
          index,
        });
      } else {
        // ERC20 withdrawal
        result = await withdrawToken({
          walletClient,
          agentWalletAddress: agentWalletAddress as Address,
          tokenAddress: token.address as Address,
          amount: amountWei,
          destinationAddress: userAddress,
          index,
        });
      }

      if (result.success) {
        setStatus("success");
        setTxHash(result.txHash || null);
        // Don't auto-close - let user click the BaseScan link or close manually
      } else {
        setStatus("error");
        setError(result.error || "Withdrawal failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case "preparing":
        return "Preparing withdrawal...";
      case "signing":
        return "Please sign the transaction in your wallet...";
      case "submitting":
        return "Submitting transaction...";
      case "confirming":
        return "Waiting for confirmation...";
      case "success":
        return "Withdrawal successful!";
      default:
        return null;
    }
  };

  const isProcessing = [
    "preparing",
    "signing",
    "submitting",
    "confirming",
  ].includes(status);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={!isProcessing ? onClose : undefined}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Withdraw {token.symbol}
            </h2>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Token Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Available Balance</span>
              <span className="font-mono font-medium text-gray-900">
                {parseFloat(formattedBalance).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}{" "}
                {token.symbol}
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount to Withdraw
            </label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                disabled={isProcessing || status === "success"}
                placeholder="0.0"
                className="w-full px-4 py-3 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 font-mono"
              />
              <button
                onClick={handleMaxClick}
                disabled={isProcessing || status === "success"}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded disabled:opacity-50"
              >
                Max
              </button>
            </div>
            {amount && !isValidAmount && (
              <p className="mt-2 text-sm text-red-600">
                {parsedAmount > maxAmount
                  ? "Amount exceeds available balance"
                  : "Please enter a valid amount"}
              </p>
            )}
          </div>

          {/* Destination */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Destination (Your Wallet)
            </label>
            <div className="px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg font-mono text-sm text-gray-600 break-all">
              {userAddress}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Funds will be sent to your connected wallet
            </p>
          </div>

          {/* Status Message */}
          {getStatusMessage() && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                status === "success"
                  ? "bg-green-50 border border-green-200"
                  : status === "error"
                  ? "bg-red-50 border border-red-200"
                  : "bg-blue-50 border border-blue-200"
              }`}
            >
              <div className="flex items-center gap-3">
                {isProcessing && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                )}
                {status === "success" && (
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                <span
                  className={`text-sm ${
                    status === "success"
                      ? "text-green-800"
                      : status === "error"
                      ? "text-red-800"
                      : "text-blue-800"
                  }`}
                >
                  {getStatusMessage()}
                </span>
              </div>
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  View on BaseScan
                </a>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={status === "success" ? onSuccess : onClose}
              disabled={isProcessing}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
            >
              {status === "success" ? "Close" : "Cancel"}
            </button>
            {status !== "success" && (
              <button
                onClick={handleWithdraw}
                disabled={!isValidAmount || isProcessing || !walletClient}
                className="flex-1 px-4 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Processing..." : "Withdraw"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
