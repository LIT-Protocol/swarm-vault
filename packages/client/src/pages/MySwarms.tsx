import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";

interface MembershipListItem {
  id: string;
  swarmId: string;
  swarmName: string;
  swarmDescription: string;
  swarmSocialUrl: string | null;
  agentWalletAddress: string;
  status: string;
  joinedAt: string;
}

export default function MySwarms() {
  const [memberships, setMemberships] = useState<MembershipListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMemberships = async () => {
      try {
        setIsLoading(true);
        const data = await api.get<MembershipListItem[]>("/api/memberships");
        setMemberships(data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load memberships"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchMemberships();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Swarms</h1>
          <p className="text-gray-600 mt-1">
            View your swarm memberships and agent wallets
          </p>
        </div>
        <Link
          to="/swarms"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Discover Swarms
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {memberships.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No memberships yet
          </h3>
          <p className="text-gray-600 mb-4">
            You haven't joined any swarms. Browse available swarms and join one
            to get started.
          </p>
          <Link
            to="/swarms"
            className="inline-block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Discover Swarms
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {memberships.map((membership) => (
            <Link
              key={membership.id}
              to={`/my-swarms/${membership.id}`}
              className="block bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {membership.swarmName}
                </h3>
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                  {membership.status}
                </span>
              </div>
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                {membership.swarmDescription}
              </p>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-gray-500">Agent Wallet:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                      {truncateAddress(membership.agentWalletAddress)}
                    </code>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        copyToClipboard(membership.agentWalletAddress);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                      title="Copy address"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
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
                </div>
                <div className="text-xs text-gray-400">
                  Joined {new Date(membership.joinedAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
