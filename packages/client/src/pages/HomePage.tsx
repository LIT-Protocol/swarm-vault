import { useAccount } from "wagmi";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import ProgrammaticTradingBox from "../components/ProgrammaticTradingBox";

export default function HomePage() {
  const { isConnected } = useAccount();
  const { isAuthenticated } = useAuth();

  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Swarm Vault
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Execute transactions on behalf of multiple users on Base. Create
          swarms, invite members, and manage agent wallets with ease.
        </p>
      </div>

      {!isConnected ? (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-800">
              Connect your wallet to get started
            </p>
          </div>
          <ProgrammaticTradingBox />
        </div>
      ) : !isAuthenticated ? (
        <div className="space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800">
              Sign in with your wallet to access the dashboard
            </p>
          </div>
          <ProgrammaticTradingBox />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">For Managers</h2>
            <p className="text-gray-600 mb-4">
              Create and manage swarms. Execute batch transactions across all
              member wallets.
            </p>
            <Link
              to="/manager"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Manager Dashboard
            </Link>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">For Users</h2>
            <p className="text-gray-600 mb-4">
              Join swarms managed by trusted parties. Deposit funds to your
              agent wallet.
            </p>
            <Link
              to="/swarms"
              className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Browse Swarms
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
