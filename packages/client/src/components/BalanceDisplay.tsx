import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { formatUnits } from "viem";
import WithdrawModal from "./WithdrawModal";

interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  balance: string;
}

interface BalanceData {
  walletAddress: string;
  chainId: number;
  ethBalance: string;
  tokens: TokenBalance[];
  fetchedAt: number;
  cached: boolean;
}

interface BalanceDisplayProps {
  membershipId: string;
  agentWalletAddress: string;
  swarmId: string;
}

interface WithdrawToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  isETH?: boolean;
}

function formatBalance(balance: string, decimals: number): string {
  const formatted = formatUnits(BigInt(balance), decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function BalanceDisplay({ membershipId, agentWalletAddress, swarmId }: BalanceDisplayProps) {
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawToken, setWithdrawToken] = useState<WithdrawToken | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  const fetchBalance = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const url = `/api/memberships/${membershipId}/balance${refresh ? "?refresh=true" : ""}`;
      const response = await api.get<BalanceData>(url);
      setBalanceData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load balance");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [membershipId]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleRefresh = () => {
    fetchBalance(true);
  };

  const handleWithdrawClick = (token: WithdrawToken) => {
    setWithdrawToken(token);
    setIsWithdrawModalOpen(true);
  };

  const handleWithdrawETH = () => {
    if (!balanceData) return;
    handleWithdrawClick({
      address: "0x0000000000000000000000000000000000000000",
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      balance: balanceData.ethBalance,
      isETH: true,
    });
  };

  const handleWithdrawToken = (token: TokenBalance) => {
    handleWithdrawClick({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance: token.balance,
      isETH: false,
    });
  };

  const handleWithdrawSuccess = () => {
    setIsWithdrawModalOpen(false);
    setWithdrawToken(null);
    // Refresh balances after successful withdrawal
    fetchBalance(true);
  };

  const handleWithdrawClose = () => {
    setIsWithdrawModalOpen(false);
    setWithdrawToken(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Balance</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-6 bg-gray-200 rounded w-1/2"></div>
          <div className="h-6 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Balance</h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing..." : "Retry"}
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!balanceData) {
    return null;
  }

  const ethBalance = formatBalance(balanceData.ethBalance, 18);
  const hasAnyBalance = BigInt(balanceData.ethBalance) > 0n ||
    balanceData.tokens.some(t => BigInt(t.balance) > 0n);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Balance</h2>
        <div className="flex items-center gap-2">
          {balanceData.cached && (
            <span className="text-xs text-gray-400">cached</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {!hasAnyBalance ? (
        <div className="text-center py-6 text-gray-500">
          <p className="mb-2">No balance yet</p>
          <p className="text-sm">
            Deposit ETH or tokens to your agent wallet address to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ETH Balance */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">E</span>
              </div>
              <div>
                <div className="font-medium text-gray-900">ETH</div>
                <div className="text-xs text-gray-500">Ethereum</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-mono font-medium text-gray-900">
                  {ethBalance}
                </div>
              </div>
              {BigInt(balanceData.ethBalance) > 0n && (
                <button
                  onClick={handleWithdrawETH}
                  className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Withdraw
                </button>
              )}
            </div>
          </div>

          {/* Token Balances */}
          {balanceData.tokens.map((token) => {
            const balance = formatBalance(token.balance, token.decimals);
            const hasBalance = BigInt(token.balance) > 0n;

            if (!hasBalance) return null;

            return (
              <div
                key={token.address}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {token.logoUrl ? (
                    <img
                      src={token.logoUrl}
                      alt={token.symbol}
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-gray-600 text-xs font-bold">
                        {token.symbol.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{token.symbol}</div>
                    <div className="text-xs text-gray-500">{token.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono font-medium text-gray-900">
                      {balance}
                    </div>
                  </div>
                  <button
                    onClick={() => handleWithdrawToken(token)}
                    className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Network indicator */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            Network: {balanceData.chainId === 8453 ? "Base Mainnet" : "Base Sepolia"}
          </span>
          <span>
            Updated: {new Date(balanceData.fetchedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Withdraw Modal */}
      {withdrawToken && (
        <WithdrawModal
          isOpen={isWithdrawModalOpen}
          onClose={handleWithdrawClose}
          onSuccess={handleWithdrawSuccess}
          agentWalletAddress={agentWalletAddress}
          swarmId={swarmId}
          token={withdrawToken}
        />
      )}
    </div>
  );
}
