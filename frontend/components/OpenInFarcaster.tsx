"use client";

/**
 * Component to display when the app is accessed outside of Farcaster/Base app
 * Shows instructions to open the app in the correct environment
 */
export function OpenInFarcaster() {
  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      backgroundColor: "black",
      color: "white",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background network effect */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: "url('/network-bg.svg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.3,
        zIndex: 0
      }} />

      {/* Content */}
      <div style={{
        position: "relative",
        zIndex: 1,
        maxWidth: "500px",
        textAlign: "center"
      }}>
        {/* Logo */}
        <img 
          src="/Logo.png" 
          alt="Hoot Logo" 
          style={{
            height: "200px",
            width: "auto",
            marginBottom: "2rem"
          }}
        />

        {/* Warning Icon */}
        <div style={{
          fontSize: "4rem",
          marginBottom: "1.5rem"
        }}>
          ⚠️
        </div>

        {/* Main message */}
        <h1 style={{
          fontSize: "1.75rem",
          fontWeight: "bold",
          marginBottom: "1rem",
          color: "#8A63D2"
        }}>
          Open in Farcaster or Base App
        </h1>

        <p style={{
          fontSize: "1rem",
          lineHeight: "1.6",
          color: "#d1d5db",
          marginBottom: "2rem"
        }}>
          Hoot is a mini-app that must be opened through the Farcaster or Base mobile app.
        </p>

        {/* Instructions */}
        <div style={{
          background: "linear-gradient(135deg, rgba(138, 99, 210, 0.15) 0%, rgba(138, 99, 210, 0.05) 100%)",
          border: "2px solid rgba(138, 99, 210, 0.3)",
          borderRadius: "1rem",
          padding: "1.5rem",
          marginBottom: "2rem",
          textAlign: "left"
        }}>
          <h2 style={{
            fontSize: "1.125rem",
            fontWeight: "600",
            marginBottom: "1rem",
            color: "#8A63D2"
          }}>
            How to access Hoot:
          </h2>
          <ol style={{
            paddingLeft: "1.5rem",
            lineHeight: "1.8",
            fontSize: "0.95rem"
          }}>
            <li>Open the <strong>Farcaster</strong> or <strong>Base</strong> mobile app</li>
            <li>Find the Hoot mini-app in the apps section</li>
            <li>Tap to open and start playing quizzes!</li>
          </ol>
        </div>

        {/* Additional info */}
        <p style={{
          fontSize: "0.875rem",
          color: "#9ca3af",
          marginTop: "1rem"
        }}>
          Don&apos;t have the app yet? Download Farcaster or Base from your app store.
        </p>
      </div>
    </div>
  );
}

