import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";

interface MembershipDetailData {
  id: string;
  swarmId: string;
  agentWalletAddress: string;
  status: string;
  joinedAt: string;
  swarm: {
    id: string;
    name: string;
    description: string;
    socialUrl: string | null;
    memberCount: number;
    managers: { id: string; walletAddress: string }[];
  };
}

export default function MembershipDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [membership, setMembership] = useState<MembershipDetailData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchMembership = async () => {
      try {
        setIsLoading(true);
        const data = await api.get<MembershipDetailData>(
          `/api/memberships/${id}`
        );
        setMembership(data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load membership"
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchMembership();
    }
  }, [id]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleLeave = async () => {
    if (!membership) return;

    try {
      setIsLeaving(true);
      await api.post(`/api/memberships/${membership.id}/leave`);
      navigate("/my-swarms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave swarm");
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          to="/my-swarms"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          &larr; Back to My Swarms
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="space-y-4">
        <Link
          to="/my-swarms"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          &larr; Back to My Swarms
        </Link>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Membership not found
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/my-swarms"
        className="text-blue-600 hover:text-blue-800 text-sm"
      >
        &larr; Back to My Swarms
      </Link>

      {/* Swarm Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {membership.swarm.name}
            </h1>
            <p className="text-gray-600 mt-2">{membership.swarm.description}</p>
          </div>
          <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded-full">
            {membership.status}
          </span>
        </div>

        <div className="mt-4 flex gap-4 text-sm text-gray-500">
          <span>{membership.swarm.memberCount} members</span>
          {membership.swarm.socialUrl && (
            <a
              href={membership.swarm.socialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
            >
              Social Link
            </a>
          )}
        </div>

        {membership.swarm.managers.length > 0 && (
          <div className="mt-4 text-sm text-gray-500">
            Manager:{" "}
            <span className="font-mono">
              {truncateAddress(membership.swarm.managers[0].walletAddress)}
            </span>
          </div>
        )}
      </div>

      {/* Agent Wallet */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Your Agent Wallet
        </h2>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <code className="text-sm font-mono text-gray-800 break-all">
              {membership.agentWalletAddress}
            </code>
            <button
              onClick={() => copyToClipboard(membership.agentWalletAddress)}
              className={`ml-4 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                copied
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          <p className="mb-2">
            Joined on {new Date(membership.joinedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Deposit Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-4">
          How to Deposit
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Copy your agent wallet address above</li>
          <li>
            Send ETH or ERC-20 tokens to this address on{" "}
            <strong>Base network</strong>
          </li>
          <li>
            Your funds will be available for the swarm manager to execute
            transactions
          </li>
        </ol>
        <p className="mt-4 text-sm text-blue-700">
          <strong>Note:</strong> The agent wallet is a smart contract wallet
          that will be deployed when the first transaction is executed. You can
          deposit funds before deployment.
        </p>
      </div>

      {/* Withdraw Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          How to Withdraw
        </h2>
        <p className="text-gray-700 mb-4">
          You retain full ownership of your agent wallet. To withdraw funds:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>
            Use your connected wallet (MetaMask) to interact with your agent
            wallet
          </li>
          <li>
            Connect to a dApp like{" "}
            <a
              href="https://app.zerion.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Zerion
            </a>{" "}
            or{" "}
            <a
              href="https://app.safe.global"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Safe
            </a>
          </li>
          <li>
            Sign transactions directly to transfer your funds to any address
          </li>
        </ol>
      </div>

      {/* Balance Display - Coming in Phase 8 */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Balance</h2>
        <p className="text-gray-500 text-sm">
          Balance display coming soon. Use a block explorer to check your wallet
          balance.
        </p>
        <a
          href={`https://sepolia.basescan.org/address/${membership.agentWalletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-blue-600 hover:text-blue-800 text-sm"
        >
          View on BaseScan &rarr;
        </a>
      </div>

      {/* Leave Swarm */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Leave Swarm
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Leaving the swarm will prevent the manager from executing transactions
          on your behalf. You will keep full ownership of your agent wallet and
          any funds in it.
        </p>

        {showLeaveConfirm ? (
          <div className="flex gap-2">
            <button
              onClick={handleLeave}
              disabled={isLeaving}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {isLeaving ? "Leaving..." : "Confirm Leave"}
            </button>
            <button
              onClick={() => setShowLeaveConfirm(false)}
              disabled={isLeaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
          >
            Leave Swarm
          </button>
        )}
      </div>
    </div>
  );
}
