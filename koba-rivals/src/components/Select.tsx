import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Game } from '../types';
import { CheckIcon, GameLogo } from './ui';

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary line, e.g. a category or a time description. */
  hint?: string;
  /** When present the option shows the game's logo instead of a dot. */
  game?: Game;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Accessible name for the trigger and the list. */
  label: string;
  placeholder?: string;
}

interface PanelRect {
  top: number;
  left: number;
  width: number;
}

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`select-caret${open ? ' is-open' : ''}`}
    >
      <path d="m6 9.5 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Styled replacement for the native <select>, which renders as an unbranded
 * system picker on mobile. Anchored with fixed positioning so it can never be
 * clipped by a scrolling card, and fully keyboard operable.
 */
export function Select({ value, options, onChange, label, placeholder = 'Select…' }: SelectProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const [rect, setRect] = useState<PanelRect | null>(null);

  const measure = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const panelHeight = Math.min(304, options.length * 44 + 14);
    const spaceBelow = window.innerHeight - box.bottom;
    const flip = spaceBelow < panelHeight && box.top > spaceBelow;
    const top = flip
      ? Math.max(10, box.top - panelHeight - 6)
      : Math.min(box.bottom + 6, Math.max(10, window.innerHeight - panelHeight - 10));
    const width = Math.min(Math.max(190, box.width), window.innerWidth - 20);
    const left = Math.max(10, Math.min(box.left, window.innerWidth - width - 10));
    setRect({ top, left, width });
  };

  const openMenu = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    measure();
    setOpen(true);
  };

  const commit = (next: string | undefined) => {
    if (next !== undefined && next !== value) onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const reposition = () => measure();

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => Math.min(options.length - 1, index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(options[active]?.value);
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="select">
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className="select-value">
          {selected?.game ? (
            <GameLogo game={selected.game} className="select-logo" />
          ) : (
            <span className="select-mark" aria-hidden="true" />
          )}
          <span className={`select-label${selected ? '' : ' is-placeholder'}`}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <CaretIcon open={open} />
      </button>

      {open && rect && (
        <div
          ref={panelRef}
          id={listId}
          className="select-panel"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              data-index={index}
              className={`select-option${option.value === value ? ' is-selected' : ''}${
                index === active ? ' is-active' : ''
              }`}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(option.value)}
            >
              {option.game ? (
                <GameLogo game={option.game} className="select-option-logo" />
              ) : (
                <span className="select-mark" aria-hidden="true" />
              )}
              <span className="select-option-text">
                <span>{option.label}</span>
                {option.hint && <small>{option.hint}</small>}
              </span>
              {option.value === value && (
                <span className="select-check">
                  <CheckIcon size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
