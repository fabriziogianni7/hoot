import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Grid,
  GridItem,
  Input,
  Navbar as MeroNavbar,
  NavbarBrand,
  NavbarMenu,
  NavbarItem,
  Menu,
  MenuGroup,
  MenuItem,
  Text,
  useToast,
  CopyToClipboard,
} from '@calimero-network/mero-ui';
import {
  CalimeroConnectButton,
  ConnectionType,
  useCalimero,
} from '@calimero-network/calimero-client';
import { createKvClient, AbiClient } from '../../features/kv/api';
import type { AllGameEvents } from '../../types/events';
import { useGameSubscriptions } from '../../hooks/useGameSubscriptions';

export default function TicTacToePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout, app, appUrl } = useCalimero();
  const { show } = useToast();

  // View state
  const [view, setView] = useState<'lobby' | 'game'>('lobby');

  // API and context
  const [api, setApi] = useState<AbiClient | null>(null);
  const [currentContext, setCurrentContext] = useState<{
    applicationId: string;
    contextId: string;
    nodeUrl: string;
  } | null>(null);

  // Match management
  const [matchId, setMatchId] = useState<string>('');
  const [player2, setPlayer2] = useState<string>('');
  const [myMatches, setMyMatches] = useState<string[]>([]);

  // Game state
  const [board, setBoard] = useState<number[]>([]);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const [gameStatus, setGameStatus] = useState<string>('waiting');

  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const loadBoard = useCallback(async () => {
    if (loadingRef.current || !api) return;
    if (!matchId) {
      show({ title: 'Set Active match id first', variant: 'error' });
      return;
    }
    loadingRef.current = true;
    try {
      const boardData = await api.getBoard({ match_id: matchId });
      setBoard(boardData.board.toArray());
    } catch (e) {
      console.error('loadBoard error', e);
      show({ title: 'Failed to load board', variant: 'error' });
    } finally {
      loadingRef.current = false;
    }
  }, [api, matchId, show]);

  const loadTurnInfo = useCallback(async () => {
    if (!api || !matchId) return;
    try {
      const turn = await api.getCurrentTurn();
      setCurrentTurn(turn);
    } catch (e) {
      console.error('Failed to load turn info:', e);
    }
  }, [api, matchId]);

  // Update isMyTurn whenever currentTurn or currentUser changes
  useEffect(() => {
    if (currentUser && currentTurn) {
      setIsMyTurn(currentUser === currentTurn);
    }
  }, [currentTurn, currentUser]);

  // Game event subscriptions
  const { isSubscribed: isEventSubscribed, events: gameEvents } =
    useGameSubscriptions({
      contextId: currentContext?.contextId || '',
      matchId,
      onBoardUpdate: () => {
        // Auto-refresh board when events occur
        loadBoard();
        loadTurnInfo();
      },
      onGameEvent: (event: AllGameEvents) => {
        if (event.type === 'GameWon') {
          setGameStatus('won');
        } else if (event.type === 'GameTied') {
          setGameStatus('tied');
        } else if (event.type === 'MatchEnded') {
          setGameStatus('ended');
        }
      },
    });

  useEffect(() => {
    if (!app) return;
    (async () => {
      try {
        const client = await createKvClient(app);
        setApi(client);
        const contexts = await app.fetchContexts();
        if (contexts.length > 0) {
          const context = contexts[0];
          setCurrentContext({
            applicationId: context.applicationId,
            contextId: context.contextId,
            nodeUrl: appUrl || 'http://node1.127.0.0.1.nip.io',
          });
        }
        // pick match_id from URL if present
        const params = new URLSearchParams(location.search);
        const mid = params.get('match_id');
        if (mid) {
          setMatchId(mid);
          setView('game');
        }
        // fetch my matches
        try {
          const ids = await client.getMatches();
          setMyMatches(ids);
        } catch (_) {}
        // fetch current user
        try {
          const user = await client.getCurrentUser();
          setCurrentUser(user);
        } catch (e) {
          console.error('Failed to get current user:', e);
        }
      } catch (e) {
        console.error(e);
        show({ title: 'Failed to initialize API client', variant: 'error' });
      }
    })();
  }, [app, appUrl, show, location.search]);

  const createMatch = useCallback(async () => {
    if (!api) return;
    try {
      const id = await api.createMatch({ player2 });
      setMatchId(id);
      setView('game');
      // Update URL with match_id so refresh works
      navigate(`/tic-tac-toe?match_id=${id}`, { replace: true });
      show({ title: `Match created: ${id}`, variant: 'success' });
    } catch (e) {
      console.error('createMatch', e);
      show({
        title: e instanceof Error ? e.message : 'Failed to create match',
        variant: 'error',
      });
    }
  }, [api, player2, show, navigate]);

  const openGame = useCallback(
    (id: string) => {
      setMatchId(id);
      setView('game');
      // Update URL with match_id so refresh works
      navigate(`/tic-tac-toe?match_id=${id}`, { replace: true });
      loadBoard();
    },
    [loadBoard, navigate],
  );

  useEffect(() => {
    if (view === 'game') {
      loadBoard();
      loadTurnInfo();
    }
  }, [view, loadBoard, loadTurnInfo]);

  const makeMove = useCallback(
    async (x: number, y: number) => {
      if (!api) return;
      if (!matchId) {
        show({ title: 'Set match id first', variant: 'error' });
        return;
      }
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const result = await api.makeMove({ match_id: matchId, x, y });
        show({ title: `Move made at (${x},${y})`, variant: 'success' });
        await loadBoard();
        await loadTurnInfo();
        
        if (result === 'win') {
          setGameStatus('won');
        } else if (result === 'tie') {
          setGameStatus('tied');
        }
      } catch (e) {
        console.error('makeMove', e);
        show({
          title: e instanceof Error ? e.message : 'Failed to make move',
          variant: 'error',
        });
      } finally {
        loadingRef.current = false;
      }
    },
    [api, matchId, show, loadBoard, loadTurnInfo],
  );

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (!isMyTurn || gameStatus !== 'waiting') return;
      makeMove(x, y);
    },
    [isMyTurn, gameStatus, makeMove],
  );

  const renderBoard = useCallback(() => {
    if (board.length === 0) {
      return <div style={{ color: '#aaa', padding: '1rem' }}>No board</div>;
    }

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 80px)',
          gap: '4px',
          margin: '1rem 0',
        }}
      >
        {board.map((cell, index) => {
          const x = index % 3;
          const y = Math.floor(index / 3);
          const isClickable = isMyTurn && gameStatus === 'waiting' && cell === 0;
          
          let content = '';
          let bgColor = '#1f2937';
          
          if (cell === 1) {
            content = 'X';
            bgColor = '#3b82f6';
          } else if (cell === 2) {
            content = 'O';
            bgColor = '#ef4444';
          }

          return (
            <div
              key={`${x}-${y}`}
              onClick={() => handleCellClick(x, y)}
              style={{
                width: 80,
                height: 80,
                background: bgColor,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                fontWeight: 'bold',
                color: 'white',
                cursor: isClickable ? 'pointer' : 'default',
                border: isClickable ? '2px solid #10b981' : '1px solid #374151',
                transition: 'all 0.2s ease-in-out',
              }}
              onMouseEnter={(e) => {
                if (isClickable) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (isClickable) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    );
  }, [board, isMyTurn, gameStatus, handleCellClick]);

  const doLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  // Lobby view
  if (view === 'lobby') {
    return (
      <>
        <MeroNavbar variant="elevated" size="md">
          <NavbarBrand text="Tic-Tac-Toe" />
          <NavbarMenu align="center">
            {currentContext && (
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Text size="sm" color="muted">
                    Node:
                  </Text>
                  <Text
                    size="sm"
                    style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                  >
                    {currentContext.nodeUrl
                      .replace('http://', '')
                      .replace('https://', '')}
                  </Text>
                  <CopyToClipboard
                    text={currentContext.nodeUrl}
                    variant="icon"
                    size="small"
                    successMessage="Node URL copied!"
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Text size="sm" color="muted">
                    Context ID:
                  </Text>
                  <Text
                    size="sm"
                    style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                  >
                    {currentContext.contextId.slice(0, 8)}...
                    {currentContext.contextId.slice(-8)}
                  </Text>
                  <CopyToClipboard
                    text={currentContext.contextId}
                    variant="icon"
                    size="small"
                    successMessage="Context ID copied!"
                  />
                </div>
                {currentUser && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <Text size="sm" color="muted">
                      Public Key:
                    </Text>
                    <Text
                      size="sm"
                      style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                    >
                      {currentUser.slice(0, 8)}...{currentUser.slice(-8)}
                    </Text>
                    <CopyToClipboard
                      text={currentUser}
                      variant="icon"
                      size="small"
                      successMessage="Public Key copied!"
                    />
                  </div>
                )}
              </div>
            )}
          </NavbarMenu>
          <NavbarMenu align="right">
            {isAuthenticated ? (
              <Menu variant="compact" size="md">
                <MenuGroup>
                  <MenuItem onClick={doLogout}>Logout</MenuItem>
                </MenuGroup>
              </Menu>
            ) : (
              <NavbarItem>
                <CalimeroConnectButton
                  connectionType={{
                    type: ConnectionType.Custom,
                    url: 'http://node1.127.0.0.1.nip.io',
                  }}
                />
              </NavbarItem>
            )}
          </NavbarMenu>
        </MeroNavbar>
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#111111',
            color: 'white',
          }}
        >
          <Grid
            columns={1}
            gap={32}
            maxWidth="100%"
            justify="center"
            align="center"
            style={{ minHeight: '100vh', padding: '2rem' }}
          >
            <GridItem>
              <main
                style={{
                  width: '100%',
                  maxWidth: '1000px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2rem',
                }}
              >
                <Card variant="rounded">
                  <CardHeader>
                    <CardTitle>Create New Match</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        createMatch();
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1rem',
                      }}
                    >
                      <Input
                        type="text"
                        placeholder="Player 2 public key (Base58)"
                        value={player2}
                        onChange={(e) => setPlayer2(e.target.value)}
                      />
                      <Button type="submit" variant="success">
                        Create
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card variant="rounded">
                  <CardHeader>
                    <CardTitle>My Matches</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {myMatches.length === 0 ? (
                      <div style={{ color: '#9ca3af' }}>
                        No matches yet. Create one above!
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}
                      >
                        {myMatches.map((id) => (
                          <div
                            key={id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem',
                              backgroundColor: '#1f2937',
                              borderRadius: '0.5rem',
                            }}
                          >
                            <div>
                              <Text
                                size="sm"
                                style={{ fontFamily: 'monospace' }}
                              >
                                {id}
                              </Text>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: '#9ca3af',
                                }}
                              >
                                Click to open
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              onClick={() => openGame(id)}
                            >
                              Open
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </main>
            </GridItem>
          </Grid>
        </div>
      </>
    );
  }

  // Game view
  return (
    <>
      <MeroNavbar variant="elevated" size="md">
        <NavbarBrand text="Tic-Tac-Toe" />
        <NavbarMenu align="left">
          <Button variant="secondary" onClick={() => setView('lobby')}>
            ← Back to Lobby
          </Button>
        </NavbarMenu>
        <NavbarMenu align="center">
          {currentContext && (
            <div
              style={{
                display: 'flex',
                gap: '1.5rem',
                alignItems: 'center',
                fontSize: '0.875rem',
                color: '#9ca3af',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Text size="sm" color="muted">
                  Node:
                </Text>
                <Text
                  size="sm"
                  style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                >
                  {currentContext.nodeUrl
                    .replace('http://', '')
                    .replace('https://', '')}
                </Text>
                <CopyToClipboard
                  text={currentContext.nodeUrl}
                  variant="icon"
                  size="small"
                  successMessage="Node URL copied!"
                />
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Text size="sm" color="muted">
                  Context ID:
                </Text>
                <Text
                  size="sm"
                  style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                >
                  {currentContext.contextId.slice(0, 8)}...
                  {currentContext.contextId.slice(-8)}
                </Text>
                <CopyToClipboard
                  text={currentContext.contextId}
                  variant="icon"
                  size="small"
                  successMessage="Context ID copied!"
                />
              </div>
              {currentUser && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Text size="sm" color="muted">
                    Public Key:
                  </Text>
                  <Text
                    size="sm"
                    style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                  >
                    {currentUser.slice(0, 8)}...{currentUser.slice(-8)}
                  </Text>
                  <CopyToClipboard
                    text={currentUser}
                    variant="icon"
                    size="small"
                    successMessage="Public Key copied!"
                  />
                </div>
              )}
            </div>
          )}
        </NavbarMenu>
        <NavbarMenu align="right">
          {isAuthenticated ? (
            <Menu variant="compact" size="md">
              <MenuGroup>
                <MenuItem onClick={doLogout}>Logout</MenuItem>
              </MenuGroup>
            </Menu>
          ) : (
            <NavbarItem>
              <CalimeroConnectButton
                connectionType={{
                  type: ConnectionType.Custom,
                  url: 'http://node1.127.0.0.1.nip.io',
                }}
              />
            </NavbarItem>
          )}
        </NavbarMenu>
      </MeroNavbar>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#111111',
          color: 'white',
        }}
      >
        <Grid
          columns={1}
          gap={32}
          maxWidth="100%"
          justify="center"
          align="center"
          style={{ minHeight: '100vh', padding: '2rem' }}
        >
          <GridItem>
            <main
              style={{
                width: '100%',
                maxWidth: '600px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2rem',
              }}
            >
              <Card variant="rounded">
                <CardHeader>
                  <CardTitle>Match: {matchId}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text size="sm" color="muted">
                      Status: {gameStatus === 'waiting' ? 'Playing' : gameStatus}
                    </Text>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: isEventSubscribed
                            ? '#10b981'
                            : '#f59e0b',
                        }}
                      />
                      <Text size="sm" color="muted">
                        {isEventSubscribed ? 'Live Updates' : 'Offline'}
                      </Text>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="rounded">
                <CardHeader>
                  <CardTitle>
                    Game Board
                    {isMyTurn && gameStatus === 'waiting' && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.875rem',
                          color: '#10b981',
                          fontWeight: 'normal',
                        }}
                      >
                        🎯 It's your turn!
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '1rem',
                    }}
                  >
                    {renderBoard()}
                    
                    <div
                      style={{
                        fontSize: '0.875rem',
                        color: '#9ca3af',
                        textAlign: 'center',
                        maxWidth: '400px',
                      }}
                    >
                      {gameStatus === 'waiting' && isMyTurn
                        ? 'Click on an empty cell to make your move!'
                        : gameStatus === 'waiting'
                        ? 'Waiting for your opponent...'
                        : gameStatus === 'won'
                        ? 'Game Over - Someone won!'
                        : gameStatus === 'tied'
                        ? 'Game Over - It\'s a tie!'
                        : 'Game ended'}
                    </div>

                    <Button
                      variant="secondary"
                      onClick={loadBoard}
                      disabled={loadingRef.current}
                    >
                      Refresh Board
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </main>
          </GridItem>
        </Grid>
      </div>
    </>
  );
}
