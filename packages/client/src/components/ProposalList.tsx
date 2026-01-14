import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { ProposedActionStatus, ProposedActionType } from "@swarm-vault/shared";
import { useSignMessage } from "wagmi";

interface ProposalData {
  id: string;
  actionType: ProposedActionType;
  actionData: {
    type: string;
    sellToken?: string;
    buyToken?: string;
    sellPercentage?: number;
    slippagePercentage?: number;
    template?: unknown;
  };
  safeMessageHash: string;
  safeSigningHash?: string; // The EIP-712 hash to sign (as raw bytes)
  status: ProposedActionStatus;
  proposedAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  expiresAt: string;
  executionTxId: string | null;
  signUrl?: string;
}

interface ProposalListProps {
  swarmId: string;
  requiresSafeSignoff: boolean;
  refreshTrigger?: number;
}

export default function ProposalList({
  swarmId,
  requiresSafeSignoff,
  refreshTrigger = 0,
}: ProposalListProps) {
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);

  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    if (requiresSafeSignoff) {
      fetchProposals();
    }
  }, [swarmId, requiresSafeSignoff, refreshTrigger]);

  const fetchProposals = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.get<ProposalData[]>(`/api/swarms/${swarmId}/proposals`);
      setProposals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch proposals");
    } finally {
      setIsLoading(false);
    }
  };

  const checkStatus = async (proposalId: string) => {
    try {
      setCheckingStatusId(proposalId);
      const result = await api.get<{
        status: ProposedActionStatus;
        signed: boolean;
        confirmations?: number;
        threshold?: number;
        message?: string;
      }>(`/api/proposals/${proposalId}/status`);

      // Update the proposal in the list
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? { ...p, status: result.status }
            : p
        )
      );

      if (result.message) {
        alert(result.message);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to check status");
    } finally {
      setCheckingStatusId(null);
    }
  };

  const executeProposal = async (proposalId: string) => {
    try {
      setExecutingId(proposalId);
      const result = await api.post<{
        proposalId: string;
        transactionId: string;
        status: string;
        message: string;
      }>(`/api/proposals/${proposalId}/execute`);

      // Update the proposal in the list
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? { ...p, status: "EXECUTED" as ProposedActionStatus, executionTxId: result.transactionId }
            : p
        )
      );

      alert(result.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to execute proposal");
    } finally {
      setExecutingId(null);
    }
  };

  const cancelProposal = async (proposalId: string) => {
    if (!confirm("Are you sure you want to cancel this proposal?")) {
      return;
    }

    try {
      await api.post(`/api/proposals/${proposalId}/cancel`);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? { ...p, status: "REJECTED" as ProposedActionStatus }
            : p
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel proposal");
    }
  };

  const signAndPropose = async (proposal: ProposalData) => {
    try {
      setSigningId(proposal.id);

      if (!proposal.safeSigningHash) {
        alert("Error: Missing Safe signing hash. Please refresh the page.");
        return;
      }

      // Sign the Safe message hash as raw bytes
      // This is the EIP-712 hash that Safe expects for off-chain message signing
      const signature = await signMessageAsync({
        message: { raw: proposal.safeSigningHash as `0x${string}` },
      });

      // Submit the signature to propose to SAFE
      const result = await api.post<{
        id: string;
        safeMessageHash: string;
        signUrl: string;
        message: string;
      }>(`/api/proposals/${proposal.id}/propose-to-safe`, { signature });

      // Update the proposal's signUrl
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposal.id
            ? { ...p, signUrl: result.signUrl }
            : p
        )
      );

      alert("Message successfully proposed to SAFE! Other owners can now sign in the SAFE app.");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to sign and propose";
      // Check for specific errors
      if (errorMsg.includes("not a SAFE owner") || errorMsg.includes("Signer")) {
        alert("Error: Your wallet is not a SAFE owner. Only SAFE owners can propose messages for signing.");
      } else {
        alert(errorMsg);
      }
    } finally {
      setSigningId(null);
    }
  };

  const getStatusBadge = (status: ProposedActionStatus) => {
    const styles: Record<ProposedActionStatus, string> = {
      PROPOSED: "bg-yellow-100 text-yellow-800",
      APPROVED: "bg-green-100 text-green-800",
      REJECTED: "bg-gray-100 text-gray-800",
      EXECUTED: "bg-blue-100 text-blue-800",
      EXPIRED: "bg-red-100 text-red-800",
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  if (!requiresSafeSignoff) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading proposals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  const pendingProposals = proposals.filter((p) => p.status === "PROPOSED" || p.status === "APPROVED");
  const pastProposals = proposals.filter((p) => p.status !== "PROPOSED" && p.status !== "APPROVED");

  return (
    <div className="space-y-6">
      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Pending Proposals</h3>
          <div className="space-y-3">
            {pendingProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {proposal.actionType === "SWAP" ? "Swap" : "Transaction"}
                      </span>
                      {getStatusBadge(proposal.status)}
                    </div>
                    {proposal.actionData.type === "swap" && (
                      <p className="text-sm text-gray-600 mt-1">
                        Swap {proposal.actionData.sellPercentage}% of tokens
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>Proposed: {formatDate(proposal.proposedAt)}</p>
                    <p className={isExpired(proposal.expiresAt) ? "text-red-600" : ""}>
                      Expires: {formatDate(proposal.expiresAt)}
                    </p>
                  </div>
                </div>

                {/* Message Hash */}
                <div className="mb-3 p-2 bg-white rounded border border-yellow-200">
                  <p className="text-xs text-gray-500 mb-1">Message Hash for SAFE to sign:</p>
                  <code className="text-xs text-gray-700 break-all">
                    {proposal.safeMessageHash}
                  </code>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {proposal.status === "PROPOSED" && (
                    <button
                      onClick={() => signAndPropose(proposal)}
                      disabled={signingId === proposal.id}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {signingId === proposal.id ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          Signing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          Sign & Propose to SAFE
                        </>
                      )}
                    </button>
                  )}
                  {proposal.signUrl && proposal.status === "PROPOSED" && (
                    <a
                      href={proposal.signUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in SAFE
                    </a>
                  )}
                  <button
                    onClick={() => checkStatus(proposal.id)}
                    disabled={checkingStatusId === proposal.id}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
                  >
                    {checkingStatusId === proposal.id ? "Checking..." : "Check Status"}
                  </button>
                  {proposal.status === "APPROVED" && (
                    <button
                      onClick={() => executeProposal(proposal.id)}
                      disabled={executingId === proposal.id || isExpired(proposal.expiresAt)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                    >
                      {executingId === proposal.id ? "Executing..." : "Execute"}
                    </button>
                  )}
                  <button
                    onClick={() => cancelProposal(proposal.id)}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Proposals */}
      {pastProposals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Past Proposals</h3>
          <div className="space-y-2">
            {pastProposals.slice(0, 5).map((proposal) => (
              <div
                key={proposal.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {proposal.actionType === "SWAP" ? "Swap" : "Transaction"}
                    </span>
                    {getStatusBadge(proposal.status)}
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(proposal.proposedAt)}
                  </p>
                </div>
                {proposal.executionTxId && (
                  <span className="text-xs text-gray-500">
                    TX: {proposal.executionTxId.slice(0, 8)}...
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {proposals.length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <p>No proposals yet</p>
          <p className="text-sm mt-1">
            Create a swap or transaction to generate a proposal for SAFE approval
          </p>
        </div>
      )}
    </div>
  );
}
