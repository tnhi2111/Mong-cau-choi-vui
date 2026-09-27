import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { birthdayConfig } from './config/birthday';
import { gifts } from './data/gifts';
import type { FinalePhase, Stage, Veil } from './types';
import { loadProgress, saveProgress, clearProgress } from './lib/storage';
import { hasWebGL, initialTier, type Tier } from './lib/quality';
import { sound } from './lib/audio';
import { assetUrl } from './lib/text';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useViewport } from './hooks/useViewport';
import { IntroOverlay } from './components/experience/IntroOverlay';
import { PasswordGate } from './components/experience/PasswordGate';
import { Welcome } from './components/experience/Welcome';
import { RoomUI } from './components/experience/RoomUI';
import { FallbackScene } from './components/experience/FallbackScene';
import { MusicToggle } from './components/ui/MusicToggle';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Heavy pieces load only when needed.
const Scene3D = lazy(() => import('./components/3d/Scene3D'));
const MemoryView = lazy(() => import('./components/experience/MemoryView'));
const LoveLetter = lazy(() => import('./components/experience/LoveLetter'));
const FinalReveal = lazy(() => import('./components/experience/FinalReveal'));

const TAPS_NEEDED = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const saved = useMemo(loadProgress, []);
  const reducedMotion = useReducedMotion();
  const { portrait } = useViewport();

  const [stage, setStage] = useState<Stage>(saved.unlocked ? 'room' : 'intro');
  const [veil, setVeil] = useState<Veil>(saved.unlocked ? 'dark' : 'none');
  const [taps, setTaps] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [opened, setOpened] = useState<string[]>(saved.opened.filter((id) => gifts.some((g) => g.id === id)));
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [finalePhase, setFinalePhase] = useState<FinalePhase>('gather');
  const [webgl, setWebgl] = useState(hasWebGL);
  const [tier, setTier] = useState<Tier>(initialTier);
  const busy = useRef(false);
  // remember the last colour so the veil fades out in the same colour it faded in
  const lastVeil = useRef<Exclude<Veil, 'none'>>('dark');
  if (veil !== 'none') lastVeil.current = veil;
  const veilKind = lastVeil.current;

  const allOpened = opened.length >= gifts.length;
  const activeGift = gifts.find((g) => g.id === activeId) ?? null;

  useEffect(() => {
    document.title = birthdayConfig.pageTitle;
  }, []);

  // Coming back later: lift the dark veil over the room.
  useEffect(() => {
    if (!saved.unlocked) return;
    const id = setTimeout(() => setVeil('none'), 300);
    return () => clearTimeout(id);
  }, [saved.unlocked]);

  useEffect(() => {
    saveProgress({ unlocked: stage !== 'intro' && stage !== 'gate', opened, finaleSeen: saved.finaleSeen });
  }, [stage, opened, saved.finaleSeen]);

  /** Fade out → swap stage → fade in. */
  const transition = useCallback(async (next: Stage, kind: Exclude<Veil, 'none'> = 'dark', hold = 250) => {
    if (busy.current) return;
    busy.current = true;
    setVeil(kind);
    await wait(750);
    setStage(next);
    await wait(hold);
    setVeil('none');
    await wait(700);
    busy.current = false;
  }, []);

  /* ── Intro ─────────────────────────────────────────────────────────── */
  const tapHeart = useCallback(() => {
    if (stage === 'room') {
      if (allOpened && !openingId && !activeId) {
        sound.flourish();
        void transition('final', 'light', 400);
      }
      return;
    }
    if (stage !== 'intro') return;
    setTaps((t) => {
      if (t >= TAPS_NEEDED) return t;
      const next = t + 1;
      sound.chime(next * 2 - 2);
      if (next === TAPS_NEEDED) {
        sound.flourish();
        setTimeout(() => setStage('gate'), reducedMotion ? 1200 : 2600);
      }
      return next;
    });
    setPulseKey((k) => k + 1);
  }, [stage, allOpened, openingId, activeId, transition, reducedMotion]);

  /* ── Gate ──────────────────────────────────────────────────────────── */
  const unlock = useCallback(async () => {
    setPulseKey((k) => k + 1);
    sound.flourish();
    await wait(reducedMotion ? 300 : 1100);
    void transition('welcome', 'light', 500);
  }, [transition, reducedMotion]);

  /* ── Room ──────────────────────────────────────────────────────────── */
  const selectGift = useCallback(
    (id: string) => {
      if (openingId || activeId || busy.current) return;
      setFocusId(null);
      setOpeningId(id);
      sound.chime(gifts.findIndex((g) => g.id === id) + 2);
    },
    [openingId, activeId],
  );

  const giftOpened = useCallback(
    async (id: string) => {
      sound.chime(5, 0.06);
      setVeil('light');
      await wait(reducedMotion ? 150 : 520);
      setActiveId(id);
      setVeil('none');
    },
    [reducedMotion],
  );

  const closeGift = useCallback(() => {
    const id = activeId;
    setActiveId(null);
    setOpeningId(null);
    if (id) {
      setOpened((o) => (o.includes(id) ? o : [...o, id]));
      setPulseKey((k) => k + 1);
    }
  }, [activeId]);

  const goFinal = useCallback(() => {
    sound.flourish();
    setFinalePhase('gather');
    void transition('final', 'light', 400);
  }, [transition]);

  /* ── Finale ────────────────────────────────────────────────────────── */
  const finaleFormed = useCallback(() => {
    sound.flourish();
    setFinalePhase((p) => (p === 'gather' ? 'formed' : p));
    saveProgress({ unlocked: true, opened, finaleSeen: true });
  }, [opened]);

  // Safety net: on a very slow device the 3D clock may crawl — never keep her waiting.
  useEffect(() => {
    if (stage !== 'final' || finalePhase !== 'gather') return;
    const id = setTimeout(finaleFormed, 11000);
    return () => clearTimeout(id);
  }, [stage, finalePhase, finaleFormed]);

  const oneMore = useCallback(() => {
    sound.flourish();
    setFinalePhase('secret');
  }, []);

  const backToRoom = useCallback(() => void transition('room', 'dark'), [transition]);

  const replay = useCallback(() => {
    clearProgress();
    location.replace(location.pathname);
  }, []);

  const finalePhotos = useMemo(
    () => gifts.flatMap((g) => (g.coverImage ? [assetUrl(g.coverImage.src)] : [])).slice(0, 6),
    [],
  );

  const overlayOpen = !!activeGift;
  const sceneProps = {
    stage,
    gifts,
    opened,
    openingId,
    allOpened,
    pulseKey,
    onGiftSelect: selectGift,
    onGiftOpened: giftOpened,
    finalePhase,
    onFinaleFormed: finaleFormed,
    reducedMotion,
  };

  return (
    <>
      <div className="backdrop" data-stage={stage} aria-hidden="true" />

      <div className="scene-holder" aria-hidden="true" inert={overlayOpen}>
        {webgl ? (
          <ErrorBoundary onError={() => setWebgl(false)}>
            <Suspense fallback={null}>
              <Scene3D
                {...sceneProps}
                taps={taps}
                tapsNeeded={TAPS_NEEDED}
                onHeartTap={tapHeart}
                focusId={focusId}
                finalePhotos={finalePhotos}
                paused={overlayOpen}
                tier={tier}
                onTierChange={setTier}
                portrait={portrait}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <FallbackScene {...sceneProps} />
        )}
      </div>

      <main className="stage" data-stage={stage} inert={overlayOpen}>
        {stage === 'intro' && (
          <IntroOverlay taps={taps} tapsNeeded={TAPS_NEEDED} onTap={tapHeart} fallback={!webgl} />
        )}
        {stage === 'gate' && <PasswordGate onSuccess={unlock} onFail={() => sound.chime(0, 0.03)} />}
        {stage === 'welcome' && <Welcome onEnter={() => void transition('room', 'dark', 300)} />}
        {stage === 'room' && (
          <RoomUI
            gifts={gifts}
            opened={opened}
            busy={!!openingId || overlayOpen}
            onSelect={selectGift}
            onFocusGift={setFocusId}
            onFinal={goFinal}
          />
        )}
        {stage === 'final' && (
          <Suspense fallback={null}>
            <FinalReveal phase={finalePhase} onOneMore={oneMore} onBackToRoom={backToRoom} onReplay={replay} />
          </Suspense>
        )}
      </main>

      <Suspense fallback={null}>
        {activeGift?.kind === 'memory' && (
          <MemoryView gift={activeGift} index={gifts.indexOf(activeGift)} onClose={closeGift} />
        )}
        {activeGift?.kind === 'letter' && <LoveLetter onClose={closeGift} reducedMotion={reducedMotion} />}
      </Suspense>

      <MusicToggle />
      <div className="veil" data-kind={veilKind} data-on={veil !== 'none'} aria-hidden="true" />
    </>
  );
}
