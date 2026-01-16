import { Outlet, Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { isConnected } = useAccount();
  const { user, isAuthenticated, isLoading, error, login, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Swarm Vault
            </Link>

            <nav className="flex items-center gap-4">
              <Link
                to="/about"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                About
              </Link>
              <Link
                to="/swarms"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Discover
              </Link>
              {isAuthenticated && user ? (
                <>
                  <Link
                    to="/my-swarms"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    My Swarms
                  </Link>
                  <Link
                    to="/manager"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    Manager
                  </Link>
                  <Link
                    to="/settings"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"
                  >
                    {user.twitterUsername ? (
                      <span className="text-blue-500">@{user.twitterUsername}</span>
                    ) : (
                      <>
                        <span>Settings</span>
                        <span className="w-2 h-2 bg-yellow-400 rounded-full" title="Twitter not connected" />
                      </>
                    )}
                  </Link>
                  <button
                    onClick={logout}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Sign Out
                  </button>
                </>
              ) : isConnected && !isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <ConnectButton showBalance={false} chainStatus="none" />
                  <button
                    onClick={login}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Signing..." : "Sign In"}
                  </button>
                </div>
              ) : (
                <ConnectButton chainStatus="none" />
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
