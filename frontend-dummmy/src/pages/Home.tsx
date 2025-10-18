import React from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'

const Home: React.FC = () => {
  const { account, connectWallet, isConnected } = useWallet()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            🦉 Hoot
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Onchain Quiz Platform with Web3 Rewards
          </p>
          
          {!isConnected && (
            <div className="mb-8">
              <button
                onClick={connectWallet}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          )}

          {isConnected && (
            <div className="mb-8">
              <p className="text-sm text-gray-500 mb-2">Connected as:</p>
              <p className="text-sm font-mono bg-gray-100 px-3 py-1 rounded">
                {account}
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Link
              to="/create"
              className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="text-4xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Create Quiz
              </h2>
              <p className="text-gray-600">
                Set up your quiz with questions, set a prize pool, and deploy to the blockchain.
                Players compete for real rewards!
              </p>
            </Link>

            <Link
              to="/join"
              className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="text-4xl mb-4">🎮</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Join Quiz
              </h2>
              <p className="text-gray-600">
                Enter a room code to join an active quiz. Answer questions quickly
                and accurately to earn points and win prizes!
              </p>
            </Link>
          </div>

          <div className="mt-16 bg-white p-8 rounded-xl shadow-lg max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              How it works
            </h3>
            <div className="space-y-4 text-left">
              <div className="flex items-start">
                <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-semibold">Create or Join</h4>
                  <p className="text-gray-600">Create a quiz with prizes or join an existing game</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">
                  2
                </div>
                <div>
                  <h4 className="font-semibold">Play & Compete</h4>
                  <p className="text-gray-600">Answer questions quickly and accurately to earn points</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-semibold">Win Prizes</h4>
                  <p className="text-gray-600">Top 3 players automatically receive their share of the prize pool</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
