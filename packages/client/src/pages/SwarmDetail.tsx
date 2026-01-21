import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";
import TransactionForm from "../components/TransactionForm";
import TransactionHistory from "../components/TransactionHistory";
import SwapForm from "../components/SwapForm";
// SAFE_DISABLED: Commenting out SAFE UI components for launch - re-enable when SAFE is ready
// import ProposalList from "../components/ProposalList";
// import SafeConfigModal from "../components/SafeConfigModal";

interface SwarmData {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  inviteCode?: string;
  litPkpPublicKey?: string;
  safeAddress?: string | null;
  requireSafeSignoff?: boolean;
  createdAt: string;
  updatedAt: string;
  managers: { id: string; walletAddress: string; twitterUsername?: string | null }[];
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
  const [showSwapForm, setShowSwapForm] = useState(false);
  // SAFE_DISABLED: const [showSafeConfig, setShowSafeConfig] = useState(false);
  const [txRefreshTrigger, setTxRefreshTrigger] = useState(0);
  // SAFE_DISABLED: const [proposalRefreshTrigger, setProposalRefreshTrigger] = useState(0);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);

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

  const getInviteLink = () => {
    if (!swarm?.inviteCode) return "";
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${swarm.inviteCode}`;
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(getInviteLink());
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy invite link:", err);
    }
  };

  const handleToggleVisibility = async () => {
    if (!swarm) return;
    try {
      setIsTogglingVisibility(true);
      await api.patch(`/api/swarms/${swarm.id}/visibility`, {
        isPublic: !swarm.isPublic,
      });
      setSwarm({ ...swarm, isPublic: !swarm.isPublic });
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
      setError(err instanceof Error ? err.message : "Failed to update visibility");
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  const handleRegenerateInviteCode = async () => {
    if (!swarm || !confirm("Regenerate invite code? The old link will stop working.")) return;
    try {
      setIsRegeneratingCode(true);
      const result = await api.post<{ id: string; inviteCode: string }>(
        `/api/swarms/${swarm.id}/invite/regenerate`
      );
      setSwarm({ ...swarm, inviteCode: result.inviteCode });
    } catch (err) {
      console.error("Failed to regenerate invite code:", err);
      setError(err instanceof Error ? err.message : "Failed to regenerate invite code");
    } finally {
      setIsRegeneratingCode(false);
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
            <div className="flex gap-2 mt-1">
              {swarm.isManager && (
                <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                  Manager
                </span>
              )}
              <span
                className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                  swarm.isPublic
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {swarm.isPublic ? "Public" : "Private"}
              </span>
            </div>
          </div>
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

        {swarm.isManager && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              App ID
            </h3>
            <div className="flex items-center gap-2">
              <code className="text-sm text-gray-700 font-mono">
                {swarm.id}
              </code>
              <button
                onClick={() => copyToClipboard(swarm.id)}
                className="text-blue-600 hover:text-blue-700 text-xs whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Use this ID with the management API
            </p>
          </div>
        )}

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

        {/* Visibility Settings */}
        {swarm.isManager && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Visibility Settings
            </h3>

            {/* Toggle Visibility */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {swarm.isPublic ? "Public Swarm" : "Private Swarm"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {swarm.isPublic
                    ? "Anyone can discover and join this swarm"
                    : "Only users with an invite link can join"}
                </p>
              </div>
              <button
                onClick={handleToggleVisibility}
                disabled={isTogglingVisibility}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  swarm.isPublic ? "bg-green-500" : "bg-gray-300"
                } ${isTogglingVisibility ? "opacity-50" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    swarm.isPublic ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Invite Link */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">
                Invite Link
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getInviteLink()}
                  className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-600"
                />
                <button
                  onClick={handleCopyInviteLink}
                  className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
                >
                  {inviteCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleRegenerateInviteCode}
                  disabled={isRegeneratingCode}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  {isRegeneratingCode ? "Regenerating..." : "Regenerate Invite Code"}
                </button>
                <span className="text-xs text-gray-400">
                  (Old links will stop working)
                </span>
              </div>
            </div>
          </div>
        )}

        {swarm.managers.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Managers</h3>
            <div className="flex flex-wrap gap-2">
              {swarm.managers.map((manager) => (
                manager.twitterUsername ? (
                  <a
                    key={manager.id}
                    href={`https://twitter.com/${manager.twitterUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-blue-50 rounded-full text-sm text-blue-600 hover:bg-blue-100 flex items-center gap-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @{manager.twitterUsername}
                  </a>
                ) : (
                  <span
                    key={manager.id}
                    className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700"
                  >
                    {truncateAddress(manager.walletAddress)}
                  </span>
                )
              ))}
            </div>
          </div>
        )}

        {/* SAFE_DISABLED: SAFE Configuration section commented out for launch
        {swarm.isManager && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">
                  Gnosis SAFE Sign-off
                </h3>
                {swarm.requireSafeSignoff && swarm.safeAddress ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Enabled
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      {truncateAddress(swarm.safeAddress)}
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                    Not configured
                  </span>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {swarm.requireSafeSignoff
                    ? "All manager actions require SAFE multi-sig approval"
                    : "Manager actions execute immediately without approval"}
                </p>
              </div>
              <button
                onClick={() => setShowSafeConfig(true)}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
              >
                Configure
              </button>
            </div>
          </div>
        )}
        */}
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
            <div className="flex gap-2">
              <button
                onClick={() => setShowSwapForm(true)}
                disabled={members.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                New Swap
              </button>
              <button
                onClick={() => setShowTxForm(true)}
                disabled={members.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                New Transaction
              </button>
            </div>
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

      {/* Swap Form Modal */}
      {swarm.isManager && (
        <SwapForm
          swarmId={id!}
          isOpen={showSwapForm}
          onClose={() => setShowSwapForm(false)}
          onSubmitted={() => {
            setTxRefreshTrigger((n) => n + 1);
            // SAFE_DISABLED: setProposalRefreshTrigger((n) => n + 1);
          }}
          // SAFE_DISABLED: requiresSafeSignoff={swarm.requireSafeSignoff}
          // SAFE_DISABLED: safeAddress={swarm.safeAddress}
        />
      )}

      {/* SAFE_DISABLED: SAFE Configuration Modal commented out for launch
      {swarm.isManager && (
        <SafeConfigModal
          swarmId={id!}
          currentSafeAddress={swarm.safeAddress || null}
          currentRequireSafeSignoff={swarm.requireSafeSignoff || false}
          isOpen={showSafeConfig}
          onClose={() => setShowSafeConfig(false)}
          onUpdated={() => {
            // Refresh swarm data
            const fetchSwarm = async () => {
              const data = await api.get<SwarmData>(`/api/swarms/${id}`);
              setSwarm(data);
            };
            fetchSwarm();
          }}
        />
      )}
      */}

      {/* SAFE_DISABLED: Proposals Section commented out for launch
      {swarm.isManager && swarm.requireSafeSignoff && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Pending Proposals
          </h2>
          <ProposalList
            swarmId={id!}
            requiresSafeSignoff={swarm.requireSafeSignoff || false}
            safeAddress={swarm.safeAddress}
            refreshTrigger={proposalRefreshTrigger}
          />
        </div>
      )}
      */}
    </div>
  );
}
