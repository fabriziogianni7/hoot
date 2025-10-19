//! # Events Module
//!
//! This module defines domain events for the tic-tac-toe game, providing a
//! decoupled way to track game state changes and enable event-driven architecture.
//!
//! ## Event Types
//!
//! The module defines several event types that are emitted during game play:
//! - **Match Events**: Match creation and completion
//! - **Move Events**: Move placement notifications
//! - **Game Events**: Winner determination and match ending
//!
//! ## Event-Driven Benefits
//!
//! - **Decoupling**: Events allow loose coupling between game components
//! - **Auditing**: All game actions are tracked through events
//! - **Integration**: Events can be consumed by external systems
//! - **Debugging**: Events provide a clear audit trail of game actions
//!
//! ## Usage
//!
//! Events are automatically emitted by the game logic using the `app::emit!` macro.
//! They can be consumed by external systems or used for logging and debugging.
//!
//! ## Example
//! ```rust
//! use tictactoe::events::Event;
//!
//! // Events are emitted automatically by the game logic
//! // app::emit!(Event::MatchCreated { id: "match-123" });
//! // app::emit!(Event::MoveMade { id: "match-123", x: 1, y: 1, player: "X" });
//! ```

// ============================================================================
// EVENTS MODULE - Domain events for decoupling
// ============================================================================

/// Domain events for the tic-tac-toe game
///
/// This enum defines all the events that can be emitted during game play.
/// Events are used to track game state changes and enable event-driven
/// architecture patterns.
///
/// # Event Variants
/// * `MatchCreated` - Emitted when a new match is created
/// * `MoveMade` - Emitted when a player makes a move
/// * `GameWon` - Emitted when a player wins the game
/// * `GameTied` - Emitted when the game ends in a tie
/// * `MatchEnded` - Emitted when a match is completed
///
/// # Lifetime Parameter
/// The `'a` lifetime parameter allows events to reference string data
/// without requiring ownership, making them more efficient for emission.
///
/// # Example
/// ```rust
/// use tictactoe::events::Event;
///
/// // Events are typically emitted by the game logic
/// // app::emit!(Event::MatchCreated { id: "match-123" });
/// // app::emit!(Event::MoveMade { id: "match-123", x: 1, y: 1, player: "X" });
/// ```
#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// Emitted when a new match is created
    MatchCreated { id: &'a str },
    /// Emitted when a player makes a move
    MoveMade {
        id: &'a str,
        x: u8,
        y: u8,
        player: &'a str,
    },
    /// Emitted when a player wins the game
    GameWon {
        id: &'a str,
        winner: &'a str,
    },
    /// Emitted when the game ends in a tie
    GameTied { id: &'a str },
    /// Emitted when a match is completed
    MatchEnded { id: &'a str },
}
