import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface TransactionData {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  template: unknown;
  createdAt: string;
  updatedAt: string;
  targetCount: number;
  statusCounts: {
    pending: number;
    submitted: number;
    confirmed: number;
    failed: number;
  };
}

interface TransactionDetailData {
  id: string;
  swarmId: string;
  status: string;
  template: unknown;
  createdAt: string;
  updatedAt: string;
  targets: {
    id: string;
    membershipId: string;
    userWallet: string;
    agentWallet: string;
    resolvedTxData: { to?: string; data?: string; value?: string };
    userOpHash: string | null;
    txHash: string | null;
    status: string;
    error: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
}

interface TransactionHistoryProps {
  swarmId: string;
  refreshTrigger?: number;
}

function getStatusColor(status: string) {
  switch (status) {
    case "COMPLETED":
    case "CONFIRMED":
      return "bg-green-100 text-green-800";
    case "PROCESSING":
    case "SUBMITTED":
      return "bg-yellow-100 text-yellow-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function truncateAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function TransactionHistory({
  swarmId,
  refreshTrigger,
}: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<TransactionDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<TransactionData[]>(
        `/api/swarms/${swarmId}/transactions`
      );
      setTransactions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [swarmId, refreshTrigger]);

  // Auto-refresh for pending/processing transactions
  useEffect(() => {
    const hasPending = transactions.some(
      (tx) => tx.status === "PENDING" || tx.status === "PROCESSING"
    );

    if (hasPending) {
      const interval = setInterval(fetchTransactions, 5000);
      return () => clearInterval(interval);
    }
  }, [transactions]);

  const loadDetail = async (txId: string) => {
    try {
      setDetailLoading(true);
      const data = await api.get<TransactionDetailData>(`/api/transactions/${txId}`);
      setSelectedTx(data);
    } catch (err) {
      console.error("Failed to load transaction detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div>
      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No transactions yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create a new transaction to execute across all swarm members
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => loadDetail(tx.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-mono text-sm text-gray-600">
                    {tx.id.slice(0, 8)}...
                  </span>
                  <span
                    className={`ml-2 px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                      tx.status
                    )}`}
                  >
                    {tx.status}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(tx.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">
                  {tx.targetCount} target{tx.targetCount !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  {tx.statusCounts.confirmed > 0 && (
                    <span className="text-green-600">
                      {tx.statusCounts.confirmed} confirmed
                    </span>
                  )}
                  {tx.statusCounts.submitted > 0 && (
                    <span className="text-yellow-600">
                      {tx.statusCounts.submitted} pending
                    </span>
                  )}
                  {tx.statusCounts.failed > 0 && (
                    <span className="text-red-600">
                      {tx.statusCounts.failed} failed
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Transaction Details
                  </h2>
                  <span className="font-mono text-sm text-gray-500">
                    {selectedTx.id}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <span
                      className={`px-2 py-1 text-sm font-medium rounded ${getStatusColor(
                        selectedTx.status
                      )}`}
                    >
                      {selectedTx.status}
                    </span>
                    <span className="ml-3 text-sm text-gray-500">
                      {new Date(selectedTx.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Template
                    </h3>
                    <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(selectedTx.template, null, 2)}
                    </pre>
                  </div>

                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Targets ({selectedTx.targets.length})
                  </h3>

                  <div className="space-y-3">
                    {selectedTx.targets.map((target) => (
                      <div
                        key={target.id}
                        className="border border-gray-200 rounded-lg p-3"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-mono text-sm text-gray-600">
                              {truncateAddress(target.agentWallet)}
                            </span>
                            <span className="text-xs text-gray-400 ml-2">
                              (user: {truncateAddress(target.userWallet)})
                            </span>
                          </div>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                              target.status
                            )}`}
                          >
                            {target.status}
                          </span>
                        </div>

                        {target.error && (
                          <div className="text-sm text-red-600 mb-2">
                            Error: {target.error}
                          </div>
                        )}

                        <div className="text-xs text-gray-500 space-y-1">
                          {target.userOpHash && (
                            <p>
                              UserOp:{" "}
                              <a
                                href={`https://jiffyscan.xyz/userOpHash/${target.userOpHash}?network=base-sepolia`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline font-mono"
                              >
                                {truncateAddress(target.userOpHash)}
                              </a>
                            </p>
                          )}
                          {target.txHash && (
                            <p>
                              Tx:{" "}
                              <a
                                href={`https://sepolia.basescan.org/tx/${target.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline font-mono"
                              >
                                {truncateAddress(target.txHash)}
                              </a>
                            </p>
                          )}
                          {target.resolvedTxData?.to && (
                            <p>
                              To: {truncateAddress(target.resolvedTxData.to)}
                            </p>
                          )}
                          {target.resolvedTxData?.value &&
                            target.resolvedTxData.value !== "0" && (
                              <p>Value: {target.resolvedTxData.value} wei</p>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
