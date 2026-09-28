/**
 * ────────────────────────────────────────────────────────────────────────────
 *  GIFTS — every glowing object in the gift room comes from this list.
 *
 *  • Add a gift  → copy one block, give it a new `id`.
 *  • Remove one  → delete its block.
 *  • Photos      → put files in /public/memories/ and change the paths.
 *                  (jpg / webp / avif all work — keep them ≤ 1600px wide.)
 *
 *  `shape` picks the 3D object:  'box' | 'capsule' | 'star' | 'orb' | 'envelope'
 *  `kind`  'memory' opens a memory page, 'letter' opens the love letter
 *          (the letter text lives in src/config/birthday.ts).
 *  `tint`  a soft accent colour for that object's glow.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type GiftShape = 'box' | 'capsule' | 'star' | 'orb' | 'envelope';

export interface Photo {
  src: string;
  alt: string;
  caption?: string;
}

export interface TimelineItem {
  date?: string;
  title: string;
  text?: string;
  image?: Photo;
}

export interface Gift {
  id: string;
  kind: 'memory' | 'letter';
  shape: GiftShape;
  tint: string;
  /** Short title shown on the object and on top of the memory page. */
  title: string;
  subtitle?: string;
  date?: string;
  location?: string;
  coverImage?: Photo;
  /** A short message shown under the cover photo. */
  message?: string;
  timeline?: TimelineItem[];
  /** Floating polaroids. */
  photos?: Photo[];
  /** A handwritten-style personal note at the end. */
  note?: string;
}

const img = (n: string, alt: string, caption?: string): Photo => ({
  src: `memories/${n}`,
  alt,
  caption,
});

export const gifts: Gift[] = [
  {
    id: 'the-day-we-met',
    kind: 'memory',
    shape: 'box',
    tint: '#e9b7c0',
    title: 'The day we met',
    subtitle: 'Ngày mình gặp nhau',
    date: '[MEMORY_01_DATE]',
    location: '[MEMORY_01_PLACE]',
    coverImage: img('memory-01.svg', '[MEMORY_01_IMAGE]'),
    message: '[MEMORY_01_MESSAGE] Anh vẫn nhớ khoảnh khắc đầu tiên nhìn thấy em.',
    timeline: [
      { date: '[DATE]', title: 'Lần đầu nhìn thấy em', text: '[Kể lại khoảnh khắc đó]', image: img('memory-01b.svg', '[MEMORY_01B_IMAGE]') },
      { date: '[DATE]', title: 'Tin nhắn đầu tiên', text: '[Em đã nhắn gì? Anh đã trả lời ra sao?]' },
    ],
    note: '[NOTE_01] Nếu được quay lại hôm đó, anh vẫn sẽ chọn bước tới chào em.',
  },
  {
    id: 'first-date',
    kind: 'memory',
    shape: 'capsule',
    tint: '#f1d3c4',
    title: 'Our first date',
    subtitle: 'Ngày đầu tiên đi chơi',
    date: '[MEMORY_02_DATE]',
    location: '[MEMORY_02_PLACE]',
    coverImage: img('memory-02.svg', '[MEMORY_02_IMAGE]'),
    message: '[MEMORY_02_MESSAGE] Hôm đó anh hồi hộp hơn em nghĩ nhiều.',
    timeline: [
      { date: '[TIME]', title: 'Đón em', text: '[Chi tiết nhỏ anh còn nhớ]' },
      { date: '[TIME]', title: 'Chỗ mình ngồi', text: '[Mình đã nói chuyện gì?]', image: img('memory-02b.svg', '[MEMORY_02B_IMAGE]') },
      { date: '[TIME]', title: 'Trên đường về', text: '[Cảm giác lúc đó]' },
    ],
    photos: [img('memory-02b.svg', '[PHOTO]', '[caption]'), img('memory-02.svg', '[PHOTO]', '[caption]')],
    note: '[NOTE_02]',
  },
  {
    id: 'first-trip',
    kind: 'memory',
    shape: 'star',
    tint: '#f3e3c8',
    title: 'Our first trip',
    subtitle: 'Lần đầu đi du lịch',
    date: '[MEMORY_03_DATE]',
    location: '[MEMORY_03_PLACE]',
    coverImage: img('memory-03.svg', '[MEMORY_03_IMAGE]'),
    message: '[MEMORY_03_MESSAGE]',
    timeline: [
      { date: '[DAY 1]', title: '[Khởi hành]', text: '[...]', image: img('memory-03b.svg', '[MEMORY_03B_IMAGE]') },
      { date: '[DAY 2]', title: '[Khoảnh khắc đẹp nhất]', text: '[...]' },
    ],
    photos: [
      img('memory-03.svg', '[PHOTO]', '[caption]'),
      img('memory-03b.svg', '[PHOTO]', '[caption]'),
      img('memory-01.svg', '[PHOTO]', '[caption]'),
    ],
    note: '[NOTE_03]',
  },
  {
    id: 'ordinary-day',
    kind: 'memory',
    shape: 'orb',
    tint: '#dcc6e0',
    title: 'An ordinary day',
    subtitle: 'Một ngày rất bình thường nhưng anh nhớ mãi',
    date: '[MEMORY_04_DATE]',
    coverImage: img('memory-04.svg', '[MEMORY_04_IMAGE]'),
    message:
      '[MEMORY_04_MESSAGE] Chẳng có gì đặc biệt cả — chỉ là em ở đó, và thế là đủ.',
    note: '[NOTE_04]',
  },
  {
    id: 'letter',
    kind: 'letter',
    shape: 'envelope',
    tint: '#f4e6d8',
    title: 'A letter for you',
    subtitle: 'Một lá thư',
  },
];
