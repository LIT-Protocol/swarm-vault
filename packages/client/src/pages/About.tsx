import { Link } from "react-router-dom";

export default function About() {
  const apiDocsUrl = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api/docs`
    : "http://localhost:3001/api/docs";

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">About Swarm Vault</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Coordinate token swaps across multiple wallets with a single transaction.
          Built for copy-trading communities and fund managers on Base.
        </p>
      </div>

      {/* What is Swarm Vault */}
      <section className="bg-white shadow rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">What is Swarm Vault?</h2>
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 leading-relaxed">
            Swarm Vault is a platform that enables trusted managers to execute token swaps
            on behalf of multiple users simultaneously. Think of it as copy-trading infrastructure
            for the decentralized world.
          </p>
          <p className="text-gray-600 leading-relaxed mt-4">
            Users join "swarms" managed by traders they trust, fund their agent wallets,
            and the manager can then execute coordinated trades across all member wallets
            with a single action.
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section className="bg-white shadow rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">How It Works</h2>
        <div className="grid md:grid-cols-2 gap-8">
          {/* For Members */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">For Members</h3>
            </div>
            <ol className="space-y-3 text-gray-600">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">1</span>
                <span>Connect your wallet and browse available swarms</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">2</span>
                <span>Join a swarm managed by a trader you trust</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">3</span>
                <span>A dedicated agent wallet is created for you</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">4</span>
                <span>Fund your agent wallet with ETH or tokens</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">5</span>
                <span>The manager executes trades on your behalf</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">6</span>
                <span>Withdraw your funds anytime you want</span>
              </li>
            </ol>
          </div>

          {/* For Managers */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">For Managers</h3>
            </div>
            <ol className="space-y-3 text-gray-600">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-sm flex items-center justify-center font-medium">1</span>
                <span>Connect your wallet and link your Twitter account</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-sm flex items-center justify-center font-medium">2</span>
                <span>Create a swarm for your community</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-sm flex items-center justify-center font-medium">3</span>
                <span>Share your swarm link with followers</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-sm flex items-center justify-center font-medium">4</span>
                <span>View aggregate holdings across all members</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-sm flex items-center justify-center font-medium">5</span>
                <span>Execute swaps for everyone with one click</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-sm flex items-center justify-center font-medium">6</span>
                <span>Or use the API for programmatic trading</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Technology */}
      <section className="bg-white shadow rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Built With Security in Mind</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center p-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Smart Contract Wallets</h3>
            <p className="text-sm text-gray-600">
              Each member gets a dedicated smart wallet powered by ZeroDev. You maintain full control
              and can withdraw funds at any time.
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Lit Protocol</h3>
            <p className="text-sm text-gray-600">
              Manager signing authority is secured by Lit Protocol's decentralized key management.
              No single point of failure.
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Base Network</h3>
            <p className="text-sm text-gray-600">
              Built on Base for fast, low-cost transactions. Swaps are executed through
              0x aggregator for best prices.
            </p>
          </div>
        </div>
      </section>

      {/* API Documentation for Managers */}
      <section className="bg-gradient-to-r from-purple-600 to-blue-600 shadow rounded-lg p-8 text-white">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-3">Programmatic Trading for Managers</h2>
            <p className="text-purple-100 mb-4">
              Swarm managers can integrate with our REST API to execute trades programmatically.
              Perfect for building trading bots, connecting to signal services, or integrating
              with your existing trading infrastructure.
            </p>
            <ul className="text-purple-100 text-sm space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Interactive API playground with live testing
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                OpenAPI spec for code generation
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                SIWE authentication for secure access
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                LLM-friendly documentation
              </li>
            </ul>
            <a
              href={apiDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View API Documentation
            </a>
          </div>
          <div className="hidden md:block">
            <div className="bg-white/10 rounded-lg p-4 font-mono text-sm text-purple-100">
              <div className="text-purple-300">// Execute swap for your swarm</div>
              <div className="mt-2">
                <span className="text-green-300">POST</span> /api/swarms/:id/swap/execute
              </div>
              <div className="mt-2 text-purple-200">{"{"}</div>
              <div className="pl-4 text-purple-200">"sellToken": "0x833...",</div>
              <div className="pl-4 text-purple-200">"buyToken": "0x420...",</div>
              <div className="pl-4 text-purple-200">"sellPercentage": 100</div>
              <div className="text-purple-200">{"}"}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Ready to Get Started?</h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/swarms"
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Swarms
          </Link>
          <Link
            to="/manager"
            className="px-6 py-3 bg-gray-100 text-gray-900 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Become a Manager
          </Link>
        </div>
      </section>
    </div>
  );
}
