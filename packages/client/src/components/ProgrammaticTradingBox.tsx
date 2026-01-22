const apiDocsUrl = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/docs`
  : "http://localhost:3001/api/docs";

export default function ProgrammaticTradingBox() {
  return (
    <div className="space-y-6">
      {/* Claude Code Skill - Primary */}
      <section className="bg-gradient-to-r from-orange-500 to-amber-500 shadow rounded-lg p-8 text-white">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-white/20 rounded text-xs font-medium">NEW</span>
              <h2 className="text-2xl font-bold">Trade with Claude Code</h2>
            </div>
            <p className="text-orange-100 mb-4">
              Use natural language to execute trades. Just tell Claude what you want to do
              and it will handle the rest. Perfect for managers who want AI-assisted trading.
            </p>
            <ul className="text-orange-100 text-sm space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                "Swap 50% of USDC to WETH for my swarm"
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                "What tokens does my swarm hold?"
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                "Preview swapping all ETH to USDC"
              </li>
            </ul>
            <a
              href="https://github.com/LIT-Protocol/swarm-vault/tree/main/skills/claude-skill"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              View on GitHub
            </a>
          </div>
          <div className="hidden md:block">
            <div className="bg-white/10 rounded-lg p-4 font-mono text-sm text-orange-100">
              <div className="text-orange-300"># Install the skill</div>
              <div className="mt-1 text-white text-xs">npx add-skill LIT-Protocol/swarm-vault --skill swarm-vault-manager-trading</div>
              <div className="mt-4 text-orange-300"># Set your API key</div>
              <div className="mt-1 text-white">export SWARM_VAULT_API_KEY="svk_..."</div>
              <div className="mt-4 text-orange-300"># Then just ask Claude:</div>
              <div className="mt-1 text-green-300">"Swap 50% of USDC to WETH"</div>
            </div>
          </div>
        </div>
      </section>

      {/* SDK and API - Secondary */}
      <section className="bg-gradient-to-r from-purple-600 to-blue-600 shadow rounded-lg p-8 text-white">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-3">SDK & API for Developers</h2>
            <p className="text-purple-100 mb-4">
              Build custom trading bots, connect to signal services, or integrate
              with your existing infrastructure using our TypeScript SDK or REST API.
            </p>
            <ul className="text-purple-100 text-sm space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                TypeScript SDK with full type safety
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Interactive API playground
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                OpenAPI spec for code generation
              </li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://www.npmjs.com/package/@swarmvault/sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331z"/>
                </svg>
                JavaScript SDK
              </a>
              <a
                href={apiDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                API Docs
              </a>
              <a
                href="https://github.com/LIT-Protocol/swarm-vault"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                GitHub
              </a>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="bg-white/10 rounded-lg p-4 font-mono text-sm text-purple-100">
              <div className="text-purple-300">// npm install @swarmvault/sdk</div>
              <div className="mt-2 text-blue-300">import</div>
              <div className="pl-2 text-purple-200">{`{ SwarmVaultClient }`}</div>
              <div className="text-blue-300">from <span className="text-green-300">'@swarmvault/sdk'</span></div>
              <div className="mt-3 text-purple-300">// Execute a swap</div>
              <div className="text-blue-300">await <span className="text-purple-200">client.executeSwap(</span></div>
              <div className="pl-2 text-purple-200">swarmId,</div>
              <div className="pl-2 text-purple-200">{`{ sellToken, buyToken }`}</div>
              <div className="text-purple-200">)</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
