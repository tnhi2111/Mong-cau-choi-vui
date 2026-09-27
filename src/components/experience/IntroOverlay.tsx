import { useEffect, useState } from 'react';
import { birthdayConfig } from '../../config/birthday';

interface Props {
  taps: number;
  tapsNeeded: number;
  onTap: () => void;
  /** No WebGL: the button itself becomes the visible, tappable heart. */
  fallback?: boolean;
}

/** Words around the first heart. Says very little on purpose. */
export function IntroOverlay({ taps, tapsNeeded, onTap, fallback }: Props) {
  const { teaser, hint, afterUnlock } = birthdayConfig.intro;
  const [showHint, setShowHint] = useState(false);
  const unlocked = taps >= tapsNeeded;

  useEffect(() => {
    if (taps > 0) return setShowHint(false);
    const id = setTimeout(() => setShowHint(true), 5200);
    return () => clearTimeout(id);
  }, [taps]);

  return (
    <div className="layer intro">
      <button
        type="button"
        className={`heart-hit${fallback ? ' heart-hit--visible' : ''}`}
        onClick={onTap}
        disabled={unlocked}
        aria-label={unlocked ? 'The heart is open' : `Touch the glowing heart (${taps} of ${tapsNeeded})`}
      >
        {fallback && <span className="css-heart" data-charge={Math.min(taps, tapsNeeded)} aria-hidden="true" />}
      </button>

      <div className="intro__words" aria-live="polite">
        {!unlocked ? (
          <p key="teaser" className="whisper fade" style={{ animationDelay: '1.2s' }}>
            {teaser}
          </p>
        ) : (
          <p key="after" className="whisper rise intro__after">
            {afterUnlock}
          </p>
        )}
        <p className={`intro__hint eyebrow${showHint && !unlocked ? ' is-on' : ''}`}>{hint}</p>
        <div className="intro__dots" aria-hidden="true">
          {Array.from({ length: tapsNeeded }, (_, i) => (
            <span key={i} className={i < taps ? 'is-lit' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
