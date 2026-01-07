import { Outlet, Link } from "react-router-dom";
import { useAccount, useConnect } from "wagmi";
import { truncateAddress } from "@swarm-vault/shared";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { user, isAuthenticated, isLoading, error, login, logout } = useAuth();

  const handleConnect = async () => {
    if (!isConnected) {
      connect({ connector: connectors[0] });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Swarm Vault
            </Link>

            <nav className="flex items-center gap-4">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {truncateAddress(user.walletAddress)}
                  </span>
                  <button
                    onClick={logout}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Sign Out
                  </button>
                </div>
              ) : isConnected && !isAuthenticated ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {truncateAddress(address || "")}
                  </span>
                  <button
                    onClick={login}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Signing..." : "Sign In"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
