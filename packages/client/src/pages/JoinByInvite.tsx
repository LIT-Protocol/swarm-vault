import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useWalletClient, useAccount, useSwitchChain } from "wagmi";
import { truncateAddress } from "@swarm-vault/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { createAgentWallet, swarmIdToIndex } from "../lib/smartWallet";

const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 84532);

interface SwarmData {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  litPkpEthAddress?: string;
  createdAt: string;
  managers: { id: string; walletAddress: string; twitterUsername?: string | null }[];
  memberCount: number;
  isMember: boolean;
}

interface JoinResult {
  id: string;
  swarmId: string;
  agentWalletAddress: string;
}

export default function JoinByInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { data: walletClient } = useWalletClient();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { isAuthenticated } = useAuth();

  const [swarm, setSwarm] = useState<SwarmData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  const isWrongNetwork = isConnected && chainId !== EXPECTED_CHAIN_ID;
  const hasPkpAddress = !!swarm?.litPkpEthAddress;
  const canJoin = isConnected && !isWrongNetwork && !!walletClient && isAuthenticated && hasPkpAddress;

  useEffect(() => {
    const fetchSwarm = async () => {
      if (!inviteCode) {
        setError("Invalid invite link");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await api.get<SwarmData>(`/api/swarms/invite/${inviteCode}`);
        setSwarm(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid or expired invite link");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSwarm();
  }, [inviteCode, isAuthenticated]); // Re-fetch when auth state changes to get PKP address

  const handleSwitchNetwork = () => {
    switchChain({ chainId: EXPECTED_CHAIN_ID });
  };

  const handleJoin = async () => {
    if (!swarm || !walletClient || !inviteCode || !swarm.litPkpEthAddress) return;

    try {
      setIsJoining(true);
      setError(null);

      // Step 1: Create the agent wallet on the client side
      setJoinStatus("Creating your agent wallet...");
      console.log("Creating agent wallet with PKP:", swarm.litPkpEthAddress);

      const { agentWalletAddress, sessionKeyApproval } = await createAgentWallet({
        walletClient,
        pkpEthAddress: swarm.litPkpEthAddress,
        index: swarmIdToIndex(swarm.id),
      });

      // Step 2: Send the wallet info to the backend with invite code
      setJoinStatus("Completing membership...");
      const result = await api.post<JoinResult>(`/api/swarms/${swarm.id}/join`, {
        agentWalletAddress,
        sessionKeyApproval,
        inviteCode,
      });

      // Navigate to the membership detail page
      navigate(`/my-swarms/${result.id}`);
    } catch (err) {
      console.error("Failed to join swarm:", err);
      setError(err instanceof Error ? err.message : "Failed to join swarm");
    } finally {
      setIsJoining(false);
      setJoinStatus(null);
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
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Invalid Invite Link
          </h2>
          <p className="text-red-600 mb-4">
            {error || "This invite link is invalid or has expired."}
          </p>
          <Link
            to="/swarms"
            className="inline-block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Browse Public Swarms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-8 text-white">
          <h1 className="text-2xl font-bold mb-2">{swarm.name}</h1>
          <div className="flex items-center gap-2 text-sm text-blue-100">
            <span>{swarm.memberCount} member{swarm.memberCount !== 1 ? "s" : ""}</span>
            <span>|</span>
            <span>{swarm.isPublic ? "Public" : "Private"} Swarm</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <p className="text-gray-700">{swarm.description}</p>
          </div>

          {swarm.managers.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Managed by</h3>
              <div className="flex flex-wrap gap-2">
                {swarm.managers.map((manager) =>
                  manager.twitterUsername ? (
                    <a
                      key={manager.id}
                      href={`https://twitter.com/${manager.twitterUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 rounded-full text-sm text-blue-600 hover:bg-blue-100"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
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
                )}
              </div>
            </div>
          )}

          {/* Status Messages */}
          {!isAuthenticated && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                Connect and sign in with your wallet to join this swarm.
              </p>
            </div>
          )}

          {isAuthenticated && !hasPkpAddress && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                This swarm is not properly configured. Please contact the swarm manager.
              </p>
            </div>
          )}

          {isAuthenticated && isWrongNetwork && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
              <p className="text-sm text-yellow-800">
                Switch to {EXPECTED_CHAIN_ID === 8453 ? "Base" : "Base Sepolia"} to join.
              </p>
              <button
                onClick={handleSwitchNetwork}
                disabled={isSwitchingChain}
                className="px-3 py-1 text-sm font-medium text-yellow-800 bg-yellow-200 rounded hover:bg-yellow-300 disabled:opacity-50"
              >
                {isSwitchingChain ? "Switching..." : "Switch"}
              </button>
            </div>
          )}

          {swarm.isMember && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium mb-2">
                You're already a member!
              </p>
              <Link
                to="/my-swarms"
                className="text-sm text-green-700 hover:text-green-800 underline"
              >
                View your memberships
              </Link>
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Join Button */}
          {!swarm.isMember && (
            <button
              onClick={handleJoin}
              disabled={!canJoin || isJoining}
              className="w-full py-3 text-lg font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isJoining ? joinStatus || "Joining..." : "Join Swarm"}
            </button>
          )}

          {swarm.isMember && (
            <Link
              to="/my-swarms"
              className="block w-full py-3 text-center text-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Go to My Swarms
            </Link>
          )}
        </div>
      </div>

      <p className="text-center text-sm text-gray-500 mt-6">
        Or{" "}
        <Link to="/swarms" className="text-blue-600 hover:text-blue-700 underline">
          browse public swarms
        </Link>
      </p>
    </div>
  );
}
