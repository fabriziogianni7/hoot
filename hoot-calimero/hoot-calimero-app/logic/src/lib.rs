//! # Tic-Tac-Toe Game Logic
//!
//! This crate implements a complete tic-tac-toe game using the Calimero SDK.
//! It provides a modular, well-documented implementation following Domain-Driven Design (DDD) principles.
//!
//! ## Architecture Overview
//!
//! The codebase is organized into several modules, each with a specific responsibility:
//!
//! - **`board`** - Board representation, coordinates, and cell types
//! - **`players`** - Player management and public key handling
//! - **`game`** - Core game logic and match management
//! - **`events`** - Game events and state changes
//! - **`validation`** - Comprehensive validation strategy pattern implementation
//!
//! ## Key Features
//!
//! ### Simple Game Logic
//! The tic-tac-toe game provides:
//! - **3x3 Grid**: Standard tic-tac-toe board
//! - **Turn-based Gameplay**: Players alternate moves
//! - **Win Detection**: Automatic detection of 3-in-a-row
//! - **Tie Detection**: Game ends when board is full
//!
//! ### Game Flow
//! 1. **Match Creation**: Players create matches and join them
//! 2. **Turn-based Gameplay**: Players take turns making moves
//! 3. **Move Validation**: Moves are validated and recorded
//! 4. **Win Condition**: Game ends when a player gets 3 in a row or board is full
//!
//! ## Usage Examples
//!
//! ### Creating a Match
//! ```rust
//! use tictactoe::TicTacToeState;
//!
//! let mut state = TicTacToeState::init();
//! let match_id = state.create_match("player2_base58_key".to_string())?;
//! ```
//!
//! ### Making Moves
//! ```rust
//! state.make_move(&match_id, 1, 1)?; // Make move at (1,1)
//! ```
//!
//! ## Error Handling
//!
//! The game uses a comprehensive error system with specific error types:
//! - `GameError::NotFound` - Resource not found
//! - `GameError::Invalid` - Invalid input or state
//! - `GameError::Forbidden` - Operation not allowed
//! - `GameError::Finished` - Game has ended
//!
//! ## Documentation
//!
//! For detailed API documentation, run:
//! ```bash
//! cargo doc --open
//! ```

#![allow(clippy::len_without_is_empty)]

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_storage::env;

// ============================================================================
// MODULE DECLARATIONS
// ============================================================================

pub mod board;
pub mod events;
pub mod game;
pub mod players;
pub mod validation;

// ============================================================================
// ABI-COMPATIBLE TYPE DEFINITIONS
// ============================================================================

// These types must be defined in lib.rs for ABI compatibility
use calimero_sdk::serde::{Deserialize, Serialize};
use thiserror::Error;

// Re-export types from modules
pub use board::{Board, Cell, Coordinate, BOARD_SIZE};
pub use events::Event;
pub use game::Match;
pub use players::PublicKey;
pub use validation::{
    validate_coordinates, validate_fleet_composition, validate_ship_placement,
    AdjacencyValidationStrategy, BoundsValidationStrategy, ContiguityValidationStrategy,
    FleetCompositionValidationStrategy, OverlapValidationStrategy, ShipAdjacencyValidationStrategy,
    ShipLengthValidationStrategy, ShipOverlapValidationStrategy, StraightLineValidationStrategy,
    UniquenessValidationStrategy, ValidationContext, ValidationInput, ValidationStrategy,
};

// Define ABI-critical types directly in lib.rs

/// Represents a game board view for API responses
///
/// This struct is used to return the current game board state.
/// The board is represented as a flat vector of u8 values where each value corresponds to a cell state.
///
/// # Fields
/// * `size` - The board size (always 3 for tic-tac-toe)
/// * `board` - Flat vector representation of the board cells
///
/// # Cell Values
/// * `0` - Empty cell
/// * `1` - X cell
/// * `2` - O cell
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct BoardView {
    /// The board size (always 3 for tic-tac-toe)
    pub size: u8,
    /// Flat vector representation of the board cells
    pub board: Vec<u8>,
}

/// Comprehensive error type for all game operations
///
/// This enum represents all possible errors that can occur during game operations.
/// It uses a tagged representation for JSON serialization, making it easy to
/// handle different error types on the client side.
///
/// # Variants
/// * `NotFound(String)` - Resource not found (e.g., match ID, player)
/// * `Invalid(&'static str)` - Invalid input or state (e.g., invalid coordinates, game rules)
/// * `Forbidden(&'static str)` - Operation not allowed (e.g., not your turn, not a player)
/// * `Finished` - Game has already ended
///
/// # Example
/// ```rust
/// use tictactoe::GameError;
///
/// match result {
///     Err(GameError::NotFound(id)) => println!("Match {} not found", id),
///     Err(GameError::Invalid(msg)) => println!("Invalid operation: {}", msg),
///     Err(GameError::Forbidden(msg)) => println!("Forbidden: {}", msg),
///     Err(GameError::Finished) => println!("Game has ended"),
///     Ok(_) => println!("Success!"),
/// }
/// ```
#[derive(Debug, Error, Serialize)]
#[serde(crate = "calimero_sdk::serde")]
#[serde(tag = "kind", content = "data")]
pub enum GameError {
    /// Resource not found (e.g., match ID, player)
    #[error("not found: {0}")]
    NotFound(String),
    /// Invalid input or state (e.g., invalid coordinates, game rules)
    #[error("invalid input: {0}")]
    Invalid(&'static str),
    /// Operation not allowed (e.g., not your turn, not a player)
    #[error("forbidden: {0}")]
    Forbidden(&'static str),
    /// Game has already ended
    #[error("already finished")]
    Finished,
}

// ============================================================================
// APPLICATION STATE
// ============================================================================

/// Main application state for the tic-tac-toe game
///
/// This struct holds the global state of the tic-tac-toe game application,
/// including the active match and metadata for ID generation. It implements
/// the Calimero SDK's state management system.
///
/// # Fields
/// * `id_nonce` - Counter for generating unique match IDs
/// * `created_ms` - Timestamp when the state was created
/// * `active_match` - Currently active match (if any)
///
/// # Example
/// ```rust
/// use tictactoe::TicTacToeState;
///
/// let state = TicTacToeState::init();
/// let match_id = state.create_match("player2_key".to_string())?;
/// ```
#[app::state(emits = for<'a> Event<'a>)]
#[derive(Debug, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TicTacToeState {
    /// Counter for generating unique match IDs
    id_nonce: u64,
    /// Timestamp when the state was created
    created_ms: u64,
    /// Currently active match (if any)
    active_match: Option<Match>,
}

#[app::logic]
impl TicTacToeState {
    #[app::init]
    pub fn init() -> TicTacToeState {
        TicTacToeState {
            id_nonce: 0,
            created_ms: env::time_now(),
            active_match: None,
        }
    }

    fn next_id(&mut self) -> String {
        self.id_nonce = self.id_nonce.wrapping_add(1);
        format!("match-{}-{}", env::time_now(), self.id_nonce)
    }

    fn get_active_match(&self) -> app::Result<&Match> {
        self.active_match
            .as_ref()
            .ok_or_else(|| calimero_sdk::types::Error::from(GameError::Invalid("no active match")))
    }

    fn get_active_match_mut(&mut self) -> app::Result<&mut Match> {
        self.active_match
            .as_mut()
            .ok_or_else(|| calimero_sdk::types::Error::from(GameError::Invalid("no active match")))
    }
}

// ============================================================================
// PUBLIC API - GAME OPERATIONS
// ============================================================================

/// Public API for game operations
///
/// This implementation provides all the public methods for interacting with
/// the tic-tac-toe game, including match creation and gameplay.
#[app::logic]
impl TicTacToeState {
    /// Creates a new match between the current player and another player
    ///
    /// This method creates a new tic-tac-toe match and sets up the initial
    /// game state. Only one active match is allowed at a time.
    ///
    /// # Arguments
    /// * `player2` - Base58-encoded public key of the second player
    ///
    /// # Returns
    /// * `Ok(String)` - The unique match ID
    /// * `Err(GameError)` - If another match is active or players are the same
    ///
    /// # Example
    /// ```rust
    /// let mut state = TicTacToeState::init();
    /// let match_id = state.create_match("player2_base58_key".to_string())?;
    /// println!("Created match: {}", match_id);
    /// ```
    pub fn create_match(&mut self, player2: String) -> app::Result<String> {
        if self.active_match.is_some() && !self.get_active_match()?.is_finished() {
            app::bail!(GameError::Invalid("another match is active"));
        }

        let player1 = PublicKey::from_executor_id()?;
        let player2_pk = PublicKey::from_base58(&player2)?;

        if player1 == player2_pk {
            app::bail!(GameError::Invalid("players must differ"));
        }

        let id = self.next_id();
        self.active_match = Some(Match::new(id.clone(), player1, player2_pk));

        app::emit!(Event::MatchCreated { id: &id });
        Ok(id)
    }

    /// Makes a move in the current match
    ///
    /// This method allows a player to make a move on the board.
    /// The move must be valid (empty cell, player's turn, etc.).
    ///
    /// # Arguments
    /// * `match_id` - The ID of the match
    /// * `x` - X coordinate (0-2)
    /// * `y` - Y coordinate (0-2)
    ///
    /// # Returns
    /// * `Ok(String)` - Result of the move ("win", "tie", "continue")
    /// * `Err(GameError)` - If match not found, not a player, or invalid move
    ///
    /// # Example
    /// ```rust
    /// let result = state.make_move(&match_id, 1, 1)?;
    /// match result.as_str() {
    ///     "win" => println!("Player won!"),
    ///     "tie" => println!("Game tied!"),
    ///     "continue" => println!("Game continues"),
    ///     _ => unreachable!(),
    /// }
    /// ```
    pub fn make_move(&mut self, match_id: &str, x: u8, y: u8) -> app::Result<String> {
        let match_state = self.get_active_match_mut()?;
        if match_id != match_state.id {
            app::bail!(GameError::NotFound(match_id.to_string()));
        }

        let caller = PublicKey::from_executor_id()?;
        match_state.make_move(caller.clone(), x, y)?;

        // Emit move event
        let player_symbol = if caller == match_state.player1 { "X" } else { "O" };
        app::emit!(Event::MoveMade {
            id: match_id,
            x,
            y,
            player: player_symbol,
        });

        // Check for game end
        if let Some(winner) = &match_state.winner {
            let winner_symbol = if *winner == match_state.player1 { "X" } else { "O" };
            app::emit!(Event::GameWon {
                id: match_id,
                winner: winner_symbol,
            });
            app::emit!(Event::MatchEnded { id: match_id });
        } else if match_state.board.is_full(BOARD_SIZE) {
            app::emit!(Event::GameTied { id: match_id });
            app::emit!(Event::MatchEnded { id: match_id });
        }

        if let Some(_winner) = &match_state.winner {
            Ok("win".to_string())
        } else if match_state.board.is_full(BOARD_SIZE) {
            Ok("tie".to_string())
        } else {
            Ok("continue".to_string())
        }
    }

    /// Gets the current board state
    ///
    /// This method returns the current state of the game board.
    ///
    /// # Arguments
    /// * `match_id` - The ID of the match
    ///
    /// # Returns
    /// * `Ok(BoardView)` - The current board state
    /// * `Err(GameError)` - If match not found
    ///
    /// # Example
    /// ```rust
    /// let board = state.get_board(&match_id)?;
    /// println!("Board size: {}", board.size);
    /// ```
    pub fn get_board(&self, match_id: &str) -> app::Result<BoardView> {
        let match_state = self.get_active_match()?;
        if match_id != match_state.id {
            app::bail!(GameError::NotFound(match_id.to_string()));
        }

        Ok(BoardView {
            size: BOARD_SIZE,
            board: match_state.board.0.clone(),
        })
    }

    /// Gets all matches
    ///
    /// This method returns a list of all match IDs.
    ///
    /// # Returns
    /// * `Ok(Vec<String>)` - List of match IDs
    ///
    /// # Example
    /// ```rust
    /// let matches = state.get_matches()?;
    /// println!("Found {} matches", matches.len());
    /// ```
    pub fn get_matches(&self) -> app::Result<Vec<String>> {
        if let Some(match_state) = &self.active_match {
            Ok(vec![match_state.id.clone()])
        } else {
            Ok(vec![])
        }
    }

    /// Gets the active match ID
    ///
    /// This method returns the ID of the currently active match.
    ///
    /// # Returns
    /// * `Ok(Option<String>)` - The active match ID if any
    ///
    /// # Example
    /// ```rust
    /// let match_id = state.get_active_match_id()?;
    /// if let Some(id) = match_id {
    ///     println!("Active match: {}", id);
    /// }
    /// ```
    pub fn get_active_match_id(&self) -> app::Result<Option<String>> {
        Ok(self.active_match.as_ref().map(|m| m.id.clone()))
    }

    /// Gets the current player's turn
    ///
    /// This method returns the public key of the player whose turn it is.
    ///
    /// # Returns
    /// * `Ok(Option<String>)` - The current player's public key if any
    ///
    /// # Example
    /// ```rust
    /// let turn = state.get_current_turn()?;
    /// if let Some(player) = turn {
    ///     println!("Current turn: {}", player);
    /// }
    /// ```
    pub fn get_current_turn(&self) -> app::Result<Option<String>> {
        Ok(self.active_match.as_ref().map(|m| m.turn.to_base58()))
    }

    /// Gets the current user's public key
    ///
    /// This method returns the public key of the current user.
    ///
    /// # Returns
    /// * `Ok(String)` - The current user's public key
    ///
    /// # Example
    /// ```rust
    /// let user = state.get_current_user()?;
    /// println!("Current user: {}", user);
    /// ```
    pub fn get_current_user(&self) -> app::Result<String> {
        Ok(PublicKey::from_executor_id()?.to_base58())
    }
}