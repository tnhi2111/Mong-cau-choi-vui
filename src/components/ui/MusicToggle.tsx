import { useEffect, useState } from 'react';
import { birthdayConfig } from '../../config/birthday';
import { sound } from '../../lib/audio';

/** Sound is always opt-in. Hides its label once on, to stay out of the way. */
export function MusicToggle() {
  const [on, setOn] = useState(sound.on);
  const [hasMusic, setHasMusic] = useState<boolean | null>(null);

  useEffect(() => sound.subscribe(setOn), []);
  useEffect(() => {
    // probe lazily, after the first paint, so it never competes with the intro
    const id = setTimeout(() => void sound.probeMusic().then(setHasMusic), 2500);
    return () => clearTimeout(id);
  }, []);

  const label = hasMusic === false ? 'Sound' : birthdayConfig.music.label;
  const text = on ? (hasMusic === false ? 'Sound on' : 'On') : hasMusic === false ? 'Sound off' : `${label} ♫`;

  return (
    <button
      type="button"
      className={`music${on ? ' is-on' : ''}`}
      onClick={() => void sound.toggle()}
      aria-pressed={on}
      aria-label={on ? 'Turn sound off' : hasMusic === false ? 'Turn sound on' : label}
    >
      <span className="music__bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="music__label">{text}</span>
    </button>
  );
}
