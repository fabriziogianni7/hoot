import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCorsPreFlight } from "../_shared/cors.ts";
import { successResponse, errorResponse } from "../_shared/response.ts";
import { validateRequired, compareAddresses } from "../_shared/validation.ts";
import { initSupabaseClient } from "../_shared/supabase.ts";
async function fetchGameSession(supabase, roomCode) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select(
      `
      id,
      quiz_id,
      status,
      current_question_index,
      started_at,
      ended_at,
      creator_session_id,
      quizzes (
        id,
        title,
        description,
        prize_amount,
        prize_token,
        creator_address,
        status
      )
    `
    )
    .eq("room_code", roomCode)
    .single();
  if (error) return null;
  return data;
}
function validateGameSession(gameSession, isExistingPlayer = false) {
  if (!gameSession) {
    return "Game session already started! Create a new quiz.";
  }
  // Allow reconnection for existing players, but block new players if game has started
  if (!isExistingPlayer && gameSession.status !== 'waiting') {
    return 'Game has already started. New players cannot join.';
  }
  return null;
}
async function checkExistingPlayerByWallet(
  supabase,
  gameSessionId,
  walletAddress
) {
  const { data } = await supabase
    .from("player_sessions")
    .select("id, player_name, total_score, joined_at")
    .eq("game_session_id", gameSessionId)
    .eq("wallet_address", walletAddress)
    .single();
  return data;
}
async function checkExistingPlayerByName(supabase, gameSessionId, playerName) {
  const { data } = await supabase
    .from("player_sessions")
    .select("id, player_name, wallet_address, total_score, joined_at")
    .eq("game_session_id", gameSessionId)
    .eq("player_name", playerName)
    .single();
  return data;
}
async function createPlayerSession(
  supabase,
  gameSessionId,
  playerName,
  walletAddress,
  userId
) {
  const { data, error } = await supabase
    .from("player_sessions")
    .insert({
      game_session_id: gameSessionId,
      player_name: playerName,
      wallet_address: walletAddress || null,
      user_id: userId || null,
      total_score: 0,
    })
    .select()
    .single();
  if (error) {
    if (error) {
      console.error("Error creating player session:", error);
      throw new Error(
        `Failed to join game: ${error.message || JSON.stringify(error)}`
      );
    }
  }
  return data;
}
async function updateCreatorSession(supabase, gameSessionId, playerSessionId) {
  await supabase
    .from("game_sessions")
    .update({
      creator_session_id: playerSessionId,
    })
    .eq("id", gameSessionId);
}
async function fetchAllPlayers(supabase, gameSessionId) {
  const { data } = await supabase
    .from("player_sessions")
    .select("id, player_name, wallet_address, total_score, joined_at")
    .eq("game_session_id", gameSessionId)
    .order("joined_at", {
      ascending: true,
    });
  return data || [];
}
function isCreator(creatorAddress, playerAddress) {
  return compareAddresses(creatorAddress, playerAddress);
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreFlight();
  }
  try {
    const supabase = initSupabaseClient(req);
    const { room_code, player_name, wallet_address } = await req.json();
    
    // Get authenticated user from the session (if available)
    let userId = null;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (user && !authError) {
        userId = user.id;
        console.log('Player joining with authenticated user:', userId);
      }
    } catch (authError) {
      console.warn('Could not get authenticated user:', authError);
      // Continue without user_id - allow anonymous players
    }
    // Validate required fields
    const validationError = validateRequired({
      room_code,
      player_name,
    });
    if (validationError) {
      return errorResponse(validationError, 400);
    }
    // Fetch game session
    const gameSession = await fetchGameSession(supabase, room_code);
    if (!gameSession) {
      return errorResponse("Game session not found", 404);
    }
    // Check for existing player by wallet address first (if provided)
    let existingPlayer = null;
    if (wallet_address) {
      existingPlayer = await checkExistingPlayerByWallet(
        supabase,
        gameSession.id,
        wallet_address
      );
      if (existingPlayer) {
        // Validate game session for existing player (allows reconnection)
        const sessionError = validateGameSession(gameSession, true);
        if (sessionError) {
          return errorResponse(sessionError, 400);
        }
        const playerIsCreator = isCreator(
          gameSession.quizzes?.creator_address,
          wallet_address
        );
        // Fetch all players for the response
        const allPlayers = await fetchAllPlayers(supabase, gameSession.id);
        return successResponse({
          success: true,
          player_session_id: existingPlayer.id,
          game_session_id: gameSession.id,
          player_name: existingPlayer.player_name,
          is_creator: playerIsCreator,
          message: "Reconnected to existing player session",
          game_session: {
            id: gameSession.id,
            room_code,
            status: gameSession.status,
            current_question_index: gameSession.current_question_index,
            started_at: gameSession.started_at,
            ended_at: gameSession.ended_at,
          },
          quiz: gameSession.quizzes,
          players: allPlayers,
        });
      }
    }
    // Check for existing player by name (only if no wallet match found)
    const existingPlayerByName = await checkExistingPlayerByName(
      supabase,
      gameSession.id,
      player_name
    );
    if (existingPlayerByName) {
        // Validate game session for existing player (allows reconnection)
        const sessionError = validateGameSession(gameSession, true);
        if (sessionError) {
          return errorResponse(sessionError, 400);
        }
      // If someone tries to join with the same name but different wallet
      if (
        wallet_address &&
        existingPlayerByName.wallet_address &&
        !compareAddresses(existingPlayerByName.wallet_address, wallet_address)
      ) {
        return errorResponse(
          "Player name already taken by a different wallet in this game",
          400
        );
      }
      // If someone tries to join with the same name but no wallet (or same wallet)
      // Allow them to reconnect to the existing player
      const playerIsCreator = isCreator(
        gameSession.quizzes?.creator_address,
        wallet_address
      );
      // Fetch all players for the response
      const allPlayers = await fetchAllPlayers(supabase, gameSession.id);
      return successResponse({
        success: true,
        player_session_id: existingPlayerByName.id,
        game_session_id: gameSession.id,
        player_name: existingPlayerByName.player_name,
        is_creator: playerIsCreator,
        message: "Reconnected to existing player session",
        game_session: {
          id: gameSession.id,
          room_code,
          status: gameSession.status,
          current_question_index: gameSession.current_question_index,
          started_at: gameSession.started_at,
          ended_at: gameSession.ended_at,
        },
        quiz: gameSession.quizzes,
        players: allPlayers,
      });
    }
    // Validate game session for new player (must be in waiting status)
    const sessionError = validateGameSession(gameSession, false);
    if (sessionError) {
      return errorResponse(sessionError, 400);
    }
    // Create new player session
    const playerSession = await createPlayerSession(
      supabase,
      gameSession.id,
      player_name,
      wallet_address,
      userId
    );
    // Update creator session if applicable
    const playerIsCreator = isCreator(
      gameSession.quizzes?.creator_address,
      wallet_address
    );
    if (playerIsCreator && !gameSession.creator_session_id) {
      await updateCreatorSession(supabase, gameSession.id, playerSession.id);
    }
    // Fetch all players
    const allPlayers = await fetchAllPlayers(supabase, gameSession.id);
    return successResponse({
      success: true,
      player_session_id: playerSession.id,
      is_creator: playerIsCreator,
      game_session: {
        id: gameSession.id,
        room_code,
        status: gameSession.status,
        current_question_index: gameSession.current_question_index,
        started_at: gameSession.started_at,
        ended_at: gameSession.ended_at,
      },
      quiz: gameSession.quizzes,
      players: allPlayers,
    });
  } catch (error) {
    console.error("Error in join-game:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
