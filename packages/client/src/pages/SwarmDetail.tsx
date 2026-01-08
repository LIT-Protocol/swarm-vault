import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";
import TransactionForm from "../components/TransactionForm";
import TransactionHistory from "../components/TransactionHistory";

interface SwarmData {
  id: string;
  name: string;
  description: string;
  socialUrl: string | null;
  litPkpPublicKey?: string;
  createdAt: string;
  updatedAt: string;
  managers: { id: string; walletAddress: string }[];
  memberCount: number;
  isManager: boolean;
}

interface MemberData {
  id: string;
  userId: string;
  walletAddress: string;
  agentWalletAddress: string;
  status: string;
  joinedAt: string;
}

export default function SwarmDetail() {
  const { id } = useParams<{ id: string }>();
  const [swarm, setSwarm] = useState<SwarmData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txRefreshTrigger, setTxRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchSwarm = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        const data = await api.get<SwarmData>(`/api/swarms/${id}`);
        setSwarm(data);

        // If user is manager, also fetch members
        if (data.isManager) {
          setMembersLoading(true);
          try {
            const membersData = await api.get<MemberData[]>(
              `/api/swarms/${id}/members`
            );
            setMembers(membersData);
          } catch (err) {
            console.error("Failed to fetch members:", err);
          } finally {
            setMembersLoading(false);
          }
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load swarm");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSwarm();
  }, [id]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !swarm) {
    return (
      <div className="space-y-4">
        <Link
          to="/manager"
          className="text-blue-600 hover:text-blue-700 text-sm"
        >
          Back to Dashboard
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || "Swarm not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/manager"
          className="text-blue-600 hover:text-blue-700 text-sm"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{swarm.name}</h1>
            {swarm.isManager && (
              <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                Manager
              </span>
            )}
          </div>
          {swarm.socialUrl && (
            <a
              href={swarm.socialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              Social Link
            </a>
          )}
        </div>

        <p className="text-gray-600 mb-6">{swarm.description}</p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Members</h3>
            <p className="text-2xl font-semibold text-gray-900">
              {swarm.memberCount}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Created</h3>
            <p className="text-lg text-gray-900">
              {new Date(swarm.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {swarm.isManager && swarm.litPkpPublicKey && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              PKP Public Key
            </h3>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-700 break-all">
                {swarm.litPkpPublicKey}
              </code>
              <button
                onClick={() => copyToClipboard(swarm.litPkpPublicKey!)}
                className="text-blue-600 hover:text-blue-700 text-xs whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {swarm.managers.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Managers</h3>
            <div className="flex flex-wrap gap-2">
              {swarm.managers.map((manager) => (
                <span
                  key={manager.id}
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700"
                >
                  {truncateAddress(manager.walletAddress)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {swarm.isManager && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Members</h2>

          {membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No members have joined yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Share your swarm link to invite members
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User Wallet
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent Wallet
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900">
                            {truncateAddress(member.walletAddress)}
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(member.walletAddress)
                            }
                            className="text-gray-400 hover:text-gray-600"
                            title="Copy"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-gray-700">
                            {truncateAddress(member.agentWalletAddress)}
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(member.agentWalletAddress)
                            }
                            className="text-gray-400 hover:text-gray-600"
                            title="Copy"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            member.status === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transactions Section (Manager Only) */}
      {swarm.isManager && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Transactions
            </h2>
            <button
              onClick={() => setShowTxForm(true)}
              disabled={members.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              New Transaction
            </button>
          </div>

          {members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                No members to execute transactions for
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Wait for members to join before creating transactions
              </p>
            </div>
          ) : (
            <TransactionHistory
              swarmId={id!}
              refreshTrigger={txRefreshTrigger}
            />
          )}
        </div>
      )}

      {/* Transaction Form Modal */}
      {swarm.isManager && (
        <TransactionForm
          swarmId={id!}
          isOpen={showTxForm}
          onClose={() => setShowTxForm(false)}
          onSubmitted={() => setTxRefreshTrigger((n) => n + 1)}
        />
      )}
    </div>
  );
}
