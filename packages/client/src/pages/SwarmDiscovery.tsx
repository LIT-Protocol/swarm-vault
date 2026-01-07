import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface SwarmListItem {
  id: string;
  name: string;
  description: string;
  socialUrl: string | null;
  createdAt: string;
  managers: { id: string; walletAddress: string }[];
  memberCount: number;
  isManager: boolean;
}

interface MembershipListItem {
  id: string;
  swarmId: string;
}

interface JoinResult {
  id: string;
  swarmId: string;
  agentWalletAddress: string;
}

export default function SwarmDiscovery() {
  const navigate = useNavigate();
  const [swarms, setSwarms] = useState<SwarmListItem[]>([]);
  const [memberships, setMemberships] = useState<MembershipListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [joiningSwarmId, setJoiningSwarmId] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const swarmsData = await api.get<SwarmListItem[]>("/api/swarms");
        setSwarms(swarmsData);

        // Fetch user's memberships if authenticated
        if (isAuthenticated) {
          try {
            const membershipsData =
              await api.get<MembershipListItem[]>("/api/memberships");
            setMemberships(membershipsData);
          } catch {
            // User might not have any memberships yet
            setMemberships([]);
          }
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load swarms");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated]);

  const handleJoin = async (swarmId: string) => {
    try {
      setJoiningSwarmId(swarmId);
      setError(null);
      const result = await api.post<JoinResult>(`/api/swarms/${swarmId}/join`);

      // Update memberships list
      setMemberships((prev) => [
        ...prev,
        { id: result.id, swarmId: result.swarmId },
      ]);

      // Update swarm member count
      setSwarms((prev) =>
        prev.map((s) =>
          s.id === swarmId ? { ...s, memberCount: s.memberCount + 1 } : s
        )
      );

      // Navigate to the membership detail page
      navigate(`/my-swarms/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join swarm");
    } finally {
      setJoiningSwarmId(null);
    }
  };

  const isMember = (swarmId: string) => {
    return memberships.some((m) => m.swarmId === swarmId);
  };

  const getMembershipId = (swarmId: string) => {
    return memberships.find((m) => m.swarmId === swarmId)?.id;
  };

  const filteredSwarms = swarms.filter(
    (swarm) =>
      swarm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      swarm.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-gray-900">Discover Swarms</h1>
          <p className="text-gray-600 mt-1">
            Browse and join swarms managed by trusted parties
          </p>
        </div>
        {isAuthenticated && (
          <Link
            to="/my-swarms"
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
          >
            My Swarms ({memberships.length})
          </Link>
        )}
      </div>

      <div>
        <input
          type="text"
          placeholder="Search swarms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {filteredSwarms.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No swarms found
          </h3>
          <p className="text-gray-600">
            {searchQuery
              ? "Try a different search term"
              : "No swarms are available yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSwarms.map((swarm) => (
            <div
              key={swarm.id}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {swarm.name}
                </h3>
                {swarm.isManager && (
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    Manager
                  </span>
                )}
                {isMember(swarm.id) && !swarm.isManager && (
                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                    Member
                  </span>
                )}
              </div>
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                {swarm.description}
              </p>
              <div className="flex justify-between items-center text-sm mb-4">
                <span className="text-gray-500">
                  {swarm.memberCount} member{swarm.memberCount !== 1 ? "s" : ""}
                </span>
                <span className="text-gray-400">
                  {new Date(swarm.createdAt).toLocaleDateString()}
                </span>
              </div>
              {swarm.managers.length > 0 && (
                <div className="text-xs text-gray-400 mb-4">
                  Manager: {truncateAddress(swarm.managers[0].walletAddress)}
                </div>
              )}
              <div className="flex gap-2">
                {swarm.socialUrl && (
                  <a
                    href={swarm.socialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Social
                  </a>
                )}
                {isAuthenticated && !swarm.isManager && (
                  <>
                    {isMember(swarm.id) ? (
                      <Link
                        to={`/my-swarms/${getMembershipId(swarm.id)}`}
                        className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200"
                      >
                        View
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleJoin(swarm.id)}
                        disabled={joiningSwarmId === swarm.id}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {joiningSwarmId === swarm.id ? "Joining..." : "Join"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isAuthenticated && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-blue-800">
            Connect and sign in with your wallet to join swarms
          </p>
        </div>
      )}
    </div>
  );
}
