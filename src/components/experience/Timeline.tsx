import type { RefObject } from 'react';
import type { TimelineItem } from '../../data/gifts';
import { assetUrl } from '../../lib/text';
import { Reveal } from '../ui/Reveal';

export function Timeline({ items, root }: { items: TimelineItem[]; root: RefObject<HTMLElement | null> }) {
  return (
    <ol className="timeline">
      {items.map((it, i) => (
        <Reveal as="li" key={i} className="timeline__item" root={root}>
          <span className="timeline__dot" aria-hidden="true" />
          {it.date && <p className="eyebrow timeline__date">{it.date}</p>}
          <h3 className="timeline__title">{it.title}</h3>
          {it.text && <p className="timeline__text">{it.text}</p>}
          {it.image && (
            <figure className="timeline__figure">
              <img src={assetUrl(it.image.src)} alt={it.image.alt} loading="lazy" decoding="async" />
              {it.image.caption && <figcaption>{it.image.caption}</figcaption>}
            </figure>
          )}
        </Reveal>
      ))}
    </ol>
  );
}
