"use client"

import React from 'react'
import { useNetwork } from '../lib/network-context'

interface NetworkSwitcherProps {
  className?: string
}

export const NetworkSwitcher: React.FC<NetworkSwitcherProps> = ({ className = '' }) => {
  const { currentNetwork, setNetwork, networkConfig, availableNetworks } = useNetwork()

  return (
    <div className={`network-switcher ${className}`}>
      <label htmlFor="network-select" className="block text-sm font-medium text-gray-700 mb-2">
        Network:
      </label>
      <select
        id="network-select"
        value={currentNetwork}
        onChange={(e) => setNetwork(e.target.value)}
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        {Object.entries(availableNetworks).map(([key, config]) => (
          <option key={key} value={key}>
            {config.name}
          </option>
        ))}
      </select>
      <div className="mt-2 text-xs text-gray-500">
        Current: {networkConfig.name} (Chain ID: {networkConfig.chainId})
      </div>
    </div>
  )
}

export default NetworkSwitcher
