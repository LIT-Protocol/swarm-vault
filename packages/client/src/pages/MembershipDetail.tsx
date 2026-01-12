import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";
import BalanceDisplay from "../components/BalanceDisplay";

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

      {/* Balance Display */}
      <BalanceDisplay
        membershipId={membership.id}
        agentWalletAddress={membership.agentWalletAddress}
        swarmId={membership.swarmId}
      />

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
