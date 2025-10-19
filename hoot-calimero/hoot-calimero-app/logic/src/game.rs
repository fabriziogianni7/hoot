//! # Game Module
//!
//! This module contains the core game logic and match management functionality
//! for the tic-tac-toe game. It handles match creation, turn management, move
//! processing, and game state transitions.
//!
//! ## Key Types
//!
//! - **`Match`** - Represents a game match between two players
//! - **`MoveResolver`** - Service for processing moves and checking win conditions
//!
//! ## Game Flow
//!
//! 1. **Match Creation**: Two players create a match
//! 2. **Turn-based Gameplay**: Players take turns making moves
//! 3. **Move Processing**: Moves are validated and recorded
//! 4. **Win Condition**: Game ends when a player gets 3 in a row or board is full
//!
//! ## Match State
//!
//! Each match tracks:
//! - Player information and turn order
//! - Game board state
//! - Current player turn
//! - Winner determination
//!
//! ## Usage Examples
//!
//! ### Creating a Match
//! ```rust
//! use tictactoe::game::Match;
//! use tictactoe::players::PublicKey;
//!
//! let player1 = PublicKey::from_executor_id()?;
//! let player2 = PublicKey::from_base58("player2_key")?;
//! let match_id = "match-123".to_string();
//! let game = Match::new(match_id, player1, player2);
//! ```
//!
//! ### Processing Moves
//! ```rust
//! use tictactoe::game::MoveResolver;
//!
//! let result = MoveResolver::process_move(&mut match_state, x, y)?;
//! println!("Move result: {}", result);
//! ```

use crate::board::{Board, Cell, BOARD_SIZE};
use crate::players::PublicKey;
use crate::GameError;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};

// ============================================================================
// GAME MODULE - Core game logic and match management
// ============================================================================

/// Represents a game match between two players
///
/// The Match struct encapsulates all the state and logic for a single tic-tac-toe
/// game between two players. It tracks the current game state, manages turns,
/// handles move processing, and determines winners.
///
/// # Fields
/// * `id` - Unique identifier for the match
/// * `player1` - First player's public key (plays as X)
/// * `player2` - Second player's public key (plays as O)
/// * `turn` - Current player's turn (PublicKey)
/// * `board` - The 3x3 game board
/// * `winner` - Winner of the match (if any)
///
/// # Game Flow
/// 1. Players take turns making moves
/// 2. Each move is validated and recorded
/// 3. Game continues until someone wins or board is full
///
/// # Example
/// ```rust
/// use tictactoe::game::Match;
/// use tictactoe::players::PublicKey;
///
/// let player1 = PublicKey::from_executor_id()?;
/// let player2 = PublicKey::from_base58("player2_key")?;
/// let match_id = "match-123".to_string();
/// let game = Match::new(match_id, player1, player2);
/// ```
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Match {
    /// Unique identifier for the match
    pub id: String,
    /// First player's public key (plays as X)
    pub player1: PublicKey,
    /// Second player's public key (plays as O)
    pub player2: PublicKey,
    /// Current player's turn
    pub turn: PublicKey,
    /// The 3x3 game board
    pub board: Board,
    /// Winner of the match (if any)
    pub winner: Option<PublicKey>,
}

impl Match {
    pub fn new(id: String, player1: PublicKey, player2: PublicKey) -> Match {
        Match {
            id,
            player1: player1.clone(),
            player2: player2.clone(),
            turn: player1,
            board: Board::new_zeroed(BOARD_SIZE),
            winner: None,
        }
    }

    pub fn is_player(&self, player: &PublicKey) -> bool {
        *player == self.player1 || *player == self.player2
    }

    pub fn is_finished(&self) -> bool {
        self.winner.is_some() || self.board.is_full(BOARD_SIZE)
    }

    pub fn get_current_player_symbol(&self) -> Cell {
        if self.turn == self.player1 {
            Cell::X
        } else {
            Cell::O
        }
    }

    pub fn make_move(&mut self, player: PublicKey, x: u8, y: u8) -> Result<(), GameError> {
        if self.is_finished() {
            return Err(GameError::Finished);
        }

        if !self.is_player(&player) {
            return Err(GameError::Forbidden("not a player"));
        }

        if player != self.turn {
            return Err(GameError::Forbidden("not your turn"));
        }

        if x >= BOARD_SIZE || y >= BOARD_SIZE {
            return Err(GameError::Invalid("coordinates out of bounds"));
        }

        if self.board.get(BOARD_SIZE, x, y) != Cell::Empty {
            return Err(GameError::Invalid("cell already occupied"));
        }

        // Make the move
        let symbol = self.get_current_player_symbol();
        self.board.set(BOARD_SIZE, x, y, symbol);

        // Check for winner
        if let Some(_winner_symbol) = self.board.check_winner(BOARD_SIZE) {
            self.winner = Some(player);
        } else if self.board.is_full(BOARD_SIZE) {
            // Game is tied
            self.winner = None;
        } else {
            // Switch turns
            self.turn = if self.turn == self.player1 {
                self.player2.clone()
            } else {
                self.player1.clone()
            };
        }

        Ok(())
    }
}

// ============================================================================
// MOVE RESOLVER SERVICE
// ============================================================================


// ============================================================================
// DOMAIN ERRORS
// ============================================================================

// GameError is now defined in lib.rs for ABI compatibility