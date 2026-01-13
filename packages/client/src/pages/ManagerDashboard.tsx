import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";
import CreateSwarmModal from "../components/CreateSwarmModal";
import { SwarmCardSkeleton } from "../components/LoadingSkeleton";
import { ErrorDisplay } from "../components/ErrorDisplay";

interface SwarmListItem {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  managers: { id: string; walletAddress: string; twitterUsername?: string | null }[];
  memberCount: number;
  isManager: boolean;
}

export default function ManagerDashboard() {
  const [swarms, setSwarms] = useState<SwarmListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Check for openCreateModal URL param (e.g., after Twitter OAuth redirect)
  useEffect(() => {
    if (searchParams.get("openCreateModal") === "true") {
      setIsCreateModalOpen(true);
      // Clear the URL param
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const fetchSwarms = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<SwarmListItem[]>("/api/swarms");
      // Filter to only show swarms where user is manager
      setSwarms(data.filter((s) => s.isManager));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load swarms");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSwarms();
  }, []);

  const handleSwarmCreated = () => {
    setIsCreateModalOpen(false);
    fetchSwarms();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Manage your swarms and execute batch transactions
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SwarmCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Manage your swarms and execute batch transactions
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Create Swarm
        </button>
      </div>

      <ErrorDisplay
        error={error}
        onDismiss={() => setError(null)}
        onRetry={fetchSwarms}
      />

      {swarms.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No swarms yet
          </h3>
          <p className="text-gray-600 mb-4">
            Create your first swarm to get started
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Create Swarm
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {swarms.map((swarm) => (
            <Link
              key={swarm.id}
              to={`/manager/swarms/${swarm.id}`}
              className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {swarm.name}
              </h3>
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                {swarm.description}
              </p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">
                  {swarm.memberCount} member{swarm.memberCount !== 1 ? "s" : ""}
                </span>
                <span className="text-gray-400">
                  {new Date(swarm.createdAt).toLocaleDateString()}
                </span>
              </div>
              {swarm.managers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Manager: </span>
                  {swarm.managers[0].twitterUsername ? (
                    <span className="text-xs text-blue-500 font-medium">
                      @{swarm.managers[0].twitterUsername}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600">
                      {truncateAddress(swarm.managers[0].walletAddress)}
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <CreateSwarmModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleSwarmCreated}
      />
    </div>
  );
}
