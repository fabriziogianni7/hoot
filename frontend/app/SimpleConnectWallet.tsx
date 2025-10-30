"use client";

import { useConnect, useAccount, useDisconnect } from "wagmi";
import { useState } from "react";

export function SimpleConnectWallet() {
  const { connectors, connect, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [showModal, setShowModal] = useState(false);

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        style={{
          backgroundColor: "rgba(121, 90, 255, 0.2)",
          border: "1px solid rgba(121, 90, 255, 0.5)",
          color: "white",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          cursor: "pointer",
          fontWeight: "500",
        }}
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isPending}
        style={{
          background: "linear-gradient(135deg, #795AFF 0%, #6344CC 100%)",
          border: "none",
          color: "white",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          cursor: isPending ? "not-allowed" : "pointer",
          fontWeight: "500",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#1a1a1a",
              borderRadius: "1rem",
              padding: "2rem",
              maxWidth: "400px",
              width: "90%",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
              }}
            >
              <h2 style={{ color: "white", margin: 0, fontSize: "1.25rem" }}>
                Connect Wallet
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "white",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  padding: "0",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setShowModal(false);
                  }}
                  disabled={isPending}
                  style={{
                    backgroundColor: "rgba(121, 90, 255, 0.1)",
                    border: "1px solid rgba(121, 90, 255, 0.3)",
                    color: "white",
                    padding: "1rem",
                    borderRadius: "0.5rem",
                    fontSize: "1rem",
                    cursor: isPending ? "not-allowed" : "pointer",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isPending) {
                      e.currentTarget.style.backgroundColor = "rgba(121, 90, 255, 0.2)";
                      e.currentTarget.style.borderColor = "rgba(121, 90, 255, 0.5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isPending) {
                      e.currentTarget.style.backgroundColor = "rgba(121, 90, 255, 0.1)";
                      e.currentTarget.style.borderColor = "rgba(121, 90, 255, 0.3)";
                    }
                  }}
                >
                  {connector.name}
                </button>
              ))}
            </div>

            <p
              style={{
                color: "#888",
                fontSize: "0.875rem",
                textAlign: "center",
                marginTop: "1rem",
                marginBottom: 0,
              }}
            >
              By connecting, you agree to our terms
            </p>
          </div>
        </div>
      )}
    </>
  );
}