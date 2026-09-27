import { useEffect, useRef } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { daysTogether, fill } from '../../lib/text';
import type { FinalePhase } from '../../types';

interface Props {
  phase: FinalePhase;
  onOneMore: () => void;
  onBackToRoom: () => void;
  onReplay: () => void;
}

/** Words for the finale; the 3D heart does the rest. */
export default function FinalReveal({ phase, onOneMore, onBackToRoom, onReplay }: Props) {
  const cfg = birthdayConfig.final;
  const days = daysTogether(birthdayConfig.togetherSince);
  const more = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase !== 'formed') return;
    const id = setTimeout(() => more.current?.focus({ preventScroll: true }), 3600);
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <div className="layer finale" aria-live="polite">
      {phase === 'formed' && (
        <div className="finale__block" key="formed">
          <h1 className="display finale__title rise" style={{ animationDelay: '0.3s' }}>
            {fill(cfg.title)} <span className="finale__heart">❤</span>
          </h1>
          <p className="finale__message rise" style={{ animationDelay: '1.3s' }}>
            {fill(cfg.message)}
          </p>
          {days !== null && (
            <p className="eyebrow rise" style={{ animationDelay: '2.1s' }}>
              {days.toLocaleString('vi-VN')} days together — and counting
            </p>
          )}
          <button
            ref={more}
            type="button"
            className="btn rise"
            style={{ animationDelay: '2.9s' }}
            onClick={onOneMore}
          >
            {cfg.oneMoreThing}
          </button>
        </div>
      )}

      {phase === 'secret' && (
        <div className="finale__block finale__block--secret" key="secret">
          {cfg.secretMessage.map((line, i) => (
            <p
              key={i}
              className={`rise ${i === 0 ? 'title' : 'whisper finale__line'}`}
              style={{ animationDelay: `${0.8 + i * 1.6}s` }}
            >
              {fill(line)}
            </p>
          ))}
          <p className="finale__sign rise" style={{ animationDelay: `${0.8 + cfg.secretMessage.length * 1.6}s` }}>
            {fill(cfg.signature)}
          </p>
          <div className="finale__actions rise" style={{ animationDelay: `${1.8 + cfg.secretMessage.length * 1.6}s` }}>
            <button type="button" className="btn btn--quiet" onClick={onBackToRoom}>
              Back to our room
            </button>
            <button type="button" className="btn btn--quiet" onClick={onReplay}>
              From the beginning
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
