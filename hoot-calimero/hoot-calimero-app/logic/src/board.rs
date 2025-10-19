//! # Board Module
//!
//! This module contains all types and functionality related to game boards,
//! coordinates, and cell states in the tic-tac-toe game.
//!
//! ## Key Types
//!
//! - **`Coordinate`** - Represents a position on the board with x,y coordinates
//! - **`Cell`** - Represents the state of a board cell (Empty, X, O)
//! - **`Board`** - Represents the game board as a flat vector of cells
//!
//! ## Board Layout
//!
//! The board is a 3x3 grid where:
//! - Coordinates are 0-indexed (0-2 for both x and y)
//! - Cells are stored in row-major order (y * width + x)
//! - The board size is defined by the `BOARD_SIZE` constant
//!
//! ## Usage Examples
//!
//! ### Creating Coordinates
//! ```rust
//! use tictactoe::board::{Coordinate, BOARD_SIZE};
//!
//! let coord = Coordinate::new(1, 2)?; // (1, 2) position
//! assert!(coord.is_valid());
//! ```
//!
//! ### Working with Boards
//! ```rust
//! use tictactoe::board::{Board, Cell, BOARD_SIZE};
//!
//! let mut board = Board::new_zeroed(BOARD_SIZE);
//! board.set(BOARD_SIZE, 0, 0, Cell::X);
//! let cell = board.get(BOARD_SIZE, 0, 0);
//! assert_eq!(cell, Cell::X);
//! ```

use crate::GameError;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};

// ============================================================================
// BOARD MODULE - Everything related to game boards and coordinates
// ============================================================================

/// Standard board size for tic-tac-toe (3x3 grid)
pub const BOARD_SIZE: u8 = 3;

/// Represents a coordinate position on the game board
///
/// Coordinates are 0-indexed and must be within the board bounds (0 to BOARD_SIZE-1).
/// This struct implements ordering traits to allow use in collections like BTreeSet.
///
/// # Fields
/// * `x` - The x-coordinate (column, 0-2)
/// * `y` - The y-coordinate (row, 0-2)
///
/// # Example
/// ```rust
/// use tictactoe::board::Coordinate;
///
/// let coord = Coordinate::new(1, 2)?;
/// assert_eq!(coord.x, 1);
/// assert_eq!(coord.y, 2);
/// assert!(coord.is_valid());
/// ```
#[derive(
    Debug,
    Clone,
    Copy,
    BorshSerialize,
    BorshDeserialize,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Coordinate {
    /// The x-coordinate (column, 0-9)
    pub x: u8,
    /// The y-coordinate (row, 0-9)
    pub y: u8,
}

impl Coordinate {
    pub fn new(x: u8, y: u8) -> Result<Coordinate, GameError> {
        if x >= BOARD_SIZE || y >= BOARD_SIZE {
            return Err(GameError::Invalid("coordinate out of bounds"));
        }
        Ok(Coordinate { x, y })
    }

    pub fn is_valid(&self) -> bool {
        self.x < BOARD_SIZE && self.y < BOARD_SIZE
    }
}

/// Represents the state of a cell on the game board
///
/// Each cell can be in one of three states, representing different game conditions.
/// The enum provides conversion methods to/from u8 for serialization.
///
/// # Variants
/// * `Empty` - Empty cell (no move made)
/// * `X` - Cell contains an X mark
/// * `O` - Cell contains an O mark
///
/// # Example
/// ```rust
/// use tictactoe::board::Cell;
///
/// let cell = Cell::X;
/// assert_eq!(cell.to_u8(), 1);
/// assert_eq!(Cell::from_u8(1), Cell::X);
/// ```
#[derive(
    Debug, Clone, Copy, BorshSerialize, BorshDeserialize, Serialize, Deserialize, PartialEq, Eq,
)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub enum Cell {
    /// Empty cell (no move made)
    Empty,
    /// Cell contains an X mark
    X,
    /// Cell contains an O mark
    O,
}

impl Cell {
    pub fn to_u8(self) -> u8 {
        match self {
            Cell::Empty => 0,
            Cell::X => 1,
            Cell::O => 2,
        }
    }

    pub fn from_u8(value: u8) -> Cell {
        match value {
            1 => Cell::X,
            2 => Cell::O,
            _ => Cell::Empty,
        }
    }
}

/// Represents a game board as a flat vector of cells
///
/// The board is stored as a flat vector in row-major order (y * width + x).
/// This provides efficient access and serialization while maintaining a simple
/// interface for board operations.
///
/// # Storage Format
/// The board is stored as `Vec<u8>` where each element represents a cell state:
/// - Index calculation: `y * BOARD_SIZE + x`
/// - Cell values: 0=Empty, 1=X, 2=O
///
/// # Example
/// ```rust
/// use tictactoe::board::{Board, Cell, BOARD_SIZE};
///
/// let mut board = Board::new_zeroed(BOARD_SIZE);
/// board.set(BOARD_SIZE, 0, 0, Cell::X);
/// let cell = board.get(BOARD_SIZE, 0, 0);
/// assert_eq!(cell, Cell::X);
/// ```
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Board(pub Vec<u8>);

impl Board {
    pub fn new_zeroed(size: u8) -> Board {
        Board(vec![0; (size as usize) * (size as usize)])
    }

    pub fn idx(size: u8, x: u8, y: u8) -> usize {
        (y as usize) * (size as usize) + (x as usize)
    }

    pub fn in_bounds(size: u8, x: u8, y: u8) -> bool {
        x < size && y < size
    }

    pub fn get(&self, size: u8, x: u8, y: u8) -> Cell {
        Cell::from_u8(self.0[Board::idx(size, x, y)])
    }

    pub fn set(&mut self, size: u8, x: u8, y: u8, cell: Cell) {
        self.0[Board::idx(size, x, y)] = cell.to_u8();
    }

    /// Check if the board has a winning condition
    pub fn check_winner(&self, size: u8) -> Option<Cell> {
        // Check rows
        for y in 0..size {
            let first_cell = self.get(size, 0, y);
            if first_cell != Cell::Empty {
                let mut win = true;
                for x in 1..size {
                    if self.get(size, x, y) != first_cell {
                        win = false;
                        break;
                    }
                }
                if win {
                    return Some(first_cell);
                }
            }
        }

        // Check columns
        for x in 0..size {
            let first_cell = self.get(size, x, 0);
            if first_cell != Cell::Empty {
                let mut win = true;
                for y in 1..size {
                    if self.get(size, x, y) != first_cell {
                        win = false;
                        break;
                    }
                }
                if win {
                    return Some(first_cell);
                }
            }
        }

        // Check main diagonal
        let first_cell = self.get(size, 0, 0);
        if first_cell != Cell::Empty {
            let mut win = true;
            for i in 1..size {
                if self.get(size, i, i) != first_cell {
                    win = false;
                    break;
                }
            }
            if win {
                return Some(first_cell);
            }
        }

        // Check anti-diagonal
        let first_cell = self.get(size, size - 1, 0);
        if first_cell != Cell::Empty {
            let mut win = true;
            for i in 1..size {
                if self.get(size, size - 1 - i, i) != first_cell {
                    win = false;
                    break;
                }
            }
            if win {
                return Some(first_cell);
            }
        }

        None
    }

    /// Check if the board is full (no empty cells)
    pub fn is_full(&self, size: u8) -> bool {
        for y in 0..size {
            for x in 0..size {
                if self.get(size, x, y) == Cell::Empty {
                    return false;
                }
            }
        }
        true
    }
}

// ============================================================================
// BOARD VIEWS - Data transfer objects for API responses
// ============================================================================

// OwnBoardView and ShotsView are now defined in lib.rs for ABI compatibility
