import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Campaign } from '../lib/ads';
import { compatibility, primaryGame } from '../lib/matchmaking';
import type { Direction, Filters, Player } from '../types';
import { PlayerCard } from './PlayerCard';
import { SponsoredCard } from './SponsoredCard';
import { CopyIcon, SlidersIcon, UndoIcon, XIcon, SwordsIcon } from './ui';

const SWIPE_THRESHOLD = 92;
const EXIT_MS = 270;

interface SwipeDeckProps {
  me: Player;
  players: Player[];
  filters: Filters;
  canUndo: boolean;
  /** Block gestures/keys while a sheet or match overlay is open. */
  paused?: boolean;
  /** Paid placement currently occupying the top of the deck. */
  sponsored?: Campaign | null;
  onSponsoredOpen?: () => void;
  onSponsoredHide?: () => void;
  onDecide: (player: Player, direction: Direction) => void;
  onUndo: () => void;
  onOpenFilters: () => void;
  onReset: () => void;
}

interface DragState {
  x: number;
  y: number;
  rotate: number;
  active: boolean;
}

const IDLE: DragState = { x: 0, y: 0, rotate: 0, active: false };

export function SwipeDeck({
  me,
  players,
  filters,
  canUndo,
  paused = false,
  sponsored = null,
  onSponsoredOpen,
  onSponsoredHide,
  onDecide,
  onUndo,
  onOpenFilters,
  onReset,
}: SwipeDeckProps) {
  const [drag, setDrag] = useState<DragState>(IDLE);
  const [exiting, setExiting] = useState<Direction | null>(null);
  const start = useRef({ pointerX: 0, pointerY: 0, originX: 0, originY: 0 });
  const timer = useRef<number | null>(null);
  const top = players[0];
  const topId = top?.id;

  useEffect(() => {
    setDrag(IDLE);
    setExiting(null);
  }, [topId]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const commit = (direction: Direction) => {
    if (!top || exiting || paused || sponsored) return;
    setExiting(direction);
    setDrag({
      x: direction === 'right' ? window.innerWidth + 240 : -(window.innerWidth + 240),
      y: -30,
      rotate: direction === 'right' ? 20 : -20,
      active: false,
    });
    timer.current = window.setTimeout(() => onDecide(top, direction), EXIT_MS);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paused || sponsored) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        commit('left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        commit('right');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!top || exiting || paused || sponsored) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: drag.x,
      originY: drag.y,
    };
    setDrag({ x: drag.x, y: drag.y, rotate: drag.rotate, active: true });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.active || exiting || paused) return;
    const dx = event.clientX - start.current.pointerX;
    const dy = event.clientY - start.current.pointerY;
    const x = start.current.originX + dx;
    setDrag({ x, y: start.current.originY + dy * 0.3, rotate: x / 18, active: true });
  };

  const onPointerUp = () => {
    if (!drag.active || exiting || paused) return;
    if (drag.x > SWIPE_THRESHOLD) commit('right');
    else if (drag.x < -SWIPE_THRESHOLD) commit('left');
    else setDrag(IDLE);
  };

  const cards = useMemo(() => players.slice(0, 3).reverse(), [players]);
  const rivalWeight = Math.min(1, Math.max(0, drag.x / 100));
  const passWeight = Math.min(1, Math.max(0, -drag.x / 100));

  if (!top) {
    return (
      <div className="empty-state">
        <div className="empty-glyph" aria-hidden="true">
          <SwordsIcon size={28} />
        </div>
        <h2>Deck cleared</h2>
        <p>
          You have seen every player that matches your filters. Widen matchmaking, or reset the deck
          and take another pass.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn btn-soft" onClick={onOpenFilters}>
            <SlidersIcon size={15} /> Adjust filters
          </button>
          <button type="button" className="btn btn-gradient" onClick={onReset}>
            Reset deck
          </button>
        </div>
      </div>
    );
  }

  if (sponsored) {
    return (
      <div className="deck-wrap">
        <div className="deck">
          <div className="card-slot is-top" style={{ zIndex: 20 }}>
            <SponsoredCard
              campaign={sponsored}
              onOpen={() => onSponsoredOpen?.()}
              onHide={() => onSponsoredHide?.()}
            />
          </div>
        </div>

        <div className="deck-meta">
          <span className="queue-count">
            <strong>{players.length}</strong> rivals waiting
          </span>
          <span className="key-hint">Sponsored slot</span>
        </div>

        <div className="actions">
          <button
            type="button"
            className="act act-pass"
            onClick={onSponsoredHide}
            aria-label="Hide this sponsored card"
            title="Hide this card"
          >
            <XIcon size={24} />
          </button>
          <button
            type="button"
            className="act act-rival"
            onClick={onSponsoredOpen}
            aria-label="Open the sponsored arena"
            title="Open sponsored arena"
          >
            <CopyIcon size={24} />
          </button>
        </div>

        <p className="deck-note">
          Ad by <strong>{sponsored.sponsor ?? 'a partner'}</strong> · hide it and the deck keeps
          going
        </p>
      </div>
    );
  }

  const fit = compatibility(me, top, filters);
  const topGame = primaryGame(top, filters);

  return (
    <div className="deck-wrap">
      <div
        className="deck"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {cards.map((player, index) => {
          const depth = cards.length - 1 - index;
          const isTop = depth === 0;
          const style = isTop
            ? {
                transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.rotate}deg)`,
                transition:
                  drag.active || exiting
                    ? 'transform 280ms cubic-bezier(.2,.8,.2,1)'
                    : 'transform 280ms cubic-bezier(.2,.8,.2,1)',
              }
            : {
                transform: `translate3d(0, ${depth * 12}px, 0) scale(${1 - depth * 0.035})`,
                opacity: 1 - depth * 0.35,
                transition: 'transform 260ms ease, opacity 260ms ease',
              };

          return (
            <div
              key={player.id}
              className={`card-slot${isTop ? ' is-top' : ''}${isTop && drag.active ? ' is-dragging' : ''}`}
              style={{ ...style, zIndex: 10 - depth }}
              aria-hidden={!isTop}
            >
              <PlayerCard player={player} filters={filters} />
              {isTop && (
                <>
                  <span className="stamp stamp-pass" style={{ opacity: passWeight }}>
                    Pass
                  </span>
                  <span className="stamp stamp-rival" style={{ opacity: rivalWeight }}>
                    Rival
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="deck-meta">
        <span className="queue-count">
          <strong>{players.length}</strong> in your pool
        </span>
        <span className="key-hint">← pass · rival →</span>
      </div>

      <div className="actions">
        <button
          type="button"
          className="act act-undo"
          onClick={onUndo}
          disabled={!canUndo || paused}
          aria-label="Undo last swipe"
          title="Undo last swipe"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="act act-pass"
          onClick={() => commit('left')}
          disabled={paused}
          aria-label={`Pass on ${top.displayName}`}
          title="Pass (←)"
        >
          <XIcon size={24} />
        </button>
        <button
          type="button"
          className="act act-rival"
          onClick={() => commit('right')}
          disabled={paused}
          aria-label={`Rival ${top.displayName}`}
          title="Rival (→)"
        >
          <SwordsIcon size={26} />
        </button>
        <div className="act-spacer" aria-hidden="true" />
      </div>

      <p className="deck-note">
        <strong>{fit.score}% fit</strong> · {topGame.rank} · {fit.reasons[0] ?? 'Fresh opponent'}
      </p>
    </div>
  );
}
