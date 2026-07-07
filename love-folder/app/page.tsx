"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const BOOT_LINES = [
  "> establishing secure channel...",
  "> bypassing firewall [OK]",
  "> locating hidden partition...",
  "> partition found: /love/classified.enc",
  "> 3 access codes detected...",
  "> decrypting payload...",
];

const CHARSET = "01ABCDEF!@#$%&*<>/\\{}[]";
const HEART_SCALE = 1.95;

const LOVE_NOTE = `To my love,

I still remember counting the days until this one, and somehow every month since has felt just as new. You're the calmest part of my noisiest days and the first person I want to tell anything, good or small or silly.

Thank you for staying. Thank you for choosing us despite how difficult things can sometimes be. I know it isn't always easy, and I know there are times when we both wish circumstances were different. But instead of letting those moments pull us apart, they've only shown me how strong we really are. Every day we continue choosing each other reminds me that love isn't measured by how often we get to see one another, but by how much effort, patience, trust, and understanding we're willing to give.

I also want you to know that I understand your situation. I know your mom is only trying to protect you, and I respect that. As much as I wish we could spend more time together, I'll never want you to choose between your family and me. I'll gladly wait, because I truly believe that the best things in life are worth waiting for. One day, when the timing is finally right, we'll look back at these days and smile because we made it through together.

Thank you for staying, for laughing at the same jokes twice, for every ordinary afternoon that you made feel like it mattered. I don't say it enough, so let this hidden little code say it for me: I love you, completely and without a single doubt.

Here's to every month after this one too.

Always yours.`;

// Typewriter speed is derived from the letter's own length so it always
// takes roughly as long to type out as it would take a person to read it,
// rather than a fixed ms-per-character value.
const READING_WPM = 140; // slightly slower than average silent reading, since this is meant to be savored
const LOVE_NOTE_WORD_COUNT = LOVE_NOTE.trim().split(/\s+/).length;
const LOVE_NOTE_READ_MS = (LOVE_NOTE_WORD_COUNT / READING_WPM) * 60000;
const TYPE_SPEED_MS = LOVE_NOTE_READ_MS / LOVE_NOTE.length;

type PasscodeEntry = {
  code: string;
  label: string;
  dateLabel: string;
  heart: boolean;
};

const PASSCODES: PasscodeEntry[] = [
  {
    code: "071008",
    label: "Carlos pogi",
    dateLabel: "07.10.08",
    heart: false,
  },
  {
    code: "071609",
    label: "Daphne",
    dateLabel: "07.16.09",
    heart: false,
  },
  {
    code: "122725",
    label: "US",
    dateLabel: "12.27.25",
    heart: true,
  },
];

const REEL_CONFIG = [
  { min: 1, max: 12, label: "MM" },
  { min: 1, max: 31, label: "DD" },
  { min: 0, max: 99, label: "YY" },
];

const PHOTO_BUCKET = "vault-photos";

type VaultPhotoRow = {
  id: string;
  code: string;
  url: string;
  created_at: string;
};

type HeartPoint = {
  x: number;
  y: number;
  delay: number;
  size: number;
  opacity: number;
};

type RainColumn = {
  left: number;
  duration: number;
  delay: number;
  chars: string[];
};

type FloatHeart = {
  left: number;
  duration: number;
  delay: number;
  size: number;
  drift: number;
};

type LockModalMode = "setupFirst" | "setupConfirm" | "unlock" | null;

function randomChar() {
  return CHARSET[Math.floor(Math.random() * CHARSET.length)];
}

function heartCurve(t: number) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return { x, y };
}

function generateHeartPoints(): HeartPoint[] {
  const top = heartCurve(0).y;
  const bottom = heartCurve(Math.PI).y;
  const yCenter = (top + bottom) / 2;

  const pts: HeartPoint[] = [];

  const outerCount = 40;
  const outerStagger = 0.045;
  for (let i = 0; i < outerCount; i++) {
    const t = (i / outerCount) * Math.PI * 2;
    const { x, y } = heartCurve(t);
    pts.push({
      x,
      y: y - yCenter,
      delay: i * outerStagger,
      size: 1.3 + Math.random() * 0.25,
      opacity: 0.88 + Math.random() * 0.12,
    });
  }

  const innerScale = 0.58;
  const innerCount = 24;
  const innerStagger = 0.06;
  const innerBase = outerCount * outerStagger + 0.4;
  for (let i = 0; i < innerCount; i++) {
    const t = (i / innerCount) * Math.PI * 2;
    const { x, y } = heartCurve(t);
    pts.push({
      x: x * innerScale,
      y: (y - yCenter) * innerScale,
      delay: innerBase + i * innerStagger,
      size: 1.0 + Math.random() * 0.2,
      opacity: 0.55 + Math.random() * 0.2,
    });
  }

  return pts;
}

function wrap(value: number, min: number, max: number) {
  const range = max - min + 1;
  return ((((value - min) % range) + range) % range) + min;
}

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  volume = 0.04
) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
}

function playTick() {
  beep(500 + Math.random() * 300, 0.03, "square", 0.02);
}
function playError() {
  beep(160, 0.35, "sawtooth", 0.05);
}
function playSuccess() {
  [660, 880, 1100].forEach((f, i) =>
    setTimeout(() => beep(f, 0.22, "sine", 0.045), i * 90)
  );
}

export default function HackerHeart() {
  const [phase, setPhase] = useState<
    "terminal" | "decrypting" | "password" | "reveal"
  >("terminal");
  const [renderedLines, setRenderedLines] = useState<string[]>([]);
  const [heartPoints, setHeartPoints] = useState<HeartPoint[]>([]);
  const [rain, setRain] = useState<RainColumn[]>([]);
  const [floatHearts, setFloatHearts] = useState<FloatHeart[]>([]);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [reels, setReels] = useState<number[]>([1, 1, 0]);
  const [directions, setDirections] = useState<number[]>([0, 0, 0]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const [unlocked, setUnlocked] = useState<PasscodeEntry | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showLoveNote, setShowLoveNote] = useState(false);

  // --- shared photo vault state (backed by Supabase) ---
  const [photoMap, setPhotoMap] = useState<Record<string, string[]>>({});
  const [photoIdMap, setPhotoIdMap] = useState<Record<string, string[]>>({});
  const [locked, setLocked] = useState(false);
  const [lockCode, setLockCode] = useState<string | null>(null);
  const [lockModal, setLockModal] = useState<LockModalMode>(null);
  const [lockDraft, setLockDraft] = useState("");
  const [lockFirstDraft, setLockFirstDraft] = useState("");
  const [lockError, setLockError] = useState(false);
  const [lockErrorMessage, setLockErrorMessage] = useState(
    "PASSCODES DID NOT MATCH — TRY AGAIN"
  );
  const [pendingUploadCode, setPendingUploadCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- typewriter state for the love note ---
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const typeIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loveNotePanelRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<HTMLSpanElement | null>(null);

  // --- background music ---
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setHeartPoints(generateHeartPoints());

    const cols = 28;
    setRain(
      Array.from({ length: cols }, (_, i) => ({
        left: (i / cols) * 100 + Math.random() * 2,
        duration: 4 + Math.random() * 5,
        delay: Math.random() * -8,
        chars: Array.from({ length: 18 }, () => randomChar()),
      }))
    );

    setFloatHearts(
      Array.from({ length: 16 }, () => ({
        left: Math.random() * 100,
        duration: 8 + Math.random() * 10,
        delay: Math.random() * -12,
        size: 10 + Math.random() * 16,
        drift: (Math.random() - 0.5) * 60,
      }))
    );

    return () => {
      timeouts.current.forEach(clearTimeout);
      if (typeIntervalRef.current) clearTimeout(typeIntervalRef.current);
    };
  }, []);

  // Groups the flat list of photo rows from Supabase into { code: [urls] }
  // and a matching { code: [ids] } map (kept in the same order) so a photo
  // can be deleted by id without losing track of which entry it belongs to.
  const applyPhotoRows = useCallback((rows: VaultPhotoRow[]) => {
    const urlMap: Record<string, string[]> = {};
    const idMap: Record<string, string[]> = {};
    for (const row of rows) {
      if (!urlMap[row.code]) urlMap[row.code] = [];
      if (!idMap[row.code]) idMap[row.code] = [];
      urlMap[row.code].push(row.url);
      idMap[row.code].push(row.id);
    }
    setPhotoMap(urlMap);
    setPhotoIdMap(idMap);
  }, []);

  // Loads the shared vault state (lock + passcode) and shared photos from
  // Supabase on mount, then subscribes to live changes so that if someone
  // else locks/unlocks or adds/removes a photo, this tab updates too.
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const { data: stateRow } = await supabase
        .from("vault_state")
        .select("locked, passcode")
        .eq("id", 1)
        .maybeSingle();

      if (!cancelled && stateRow) {
        setLocked(!!stateRow.locked);
        setLockCode(stateRow.passcode ?? null);
      }

      const { data: photoRows } = await supabase
        .from("vault_photos")
        .select("id, code, url, created_at")
        .order("created_at", { ascending: true });

      if (!cancelled && photoRows) {
        applyPhotoRows(photoRows as VaultPhotoRow[]);
      }
    }

    loadInitial();

    const stateChannel = supabase
      .channel("vault_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vault_state" },
        (payload) => {
          const row = payload.new as { locked: boolean; passcode: string | null };
          setLocked(!!row.locked);
          setLockCode(row.passcode ?? null);
        }
      )
      .subscribe();

    const photosChannel = supabase
      .channel("vault_photos_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vault_photos" },
        async () => {
          const { data: photoRows } = await supabase
            .from("vault_photos")
            .select("id, code, url, created_at")
            .order("created_at", { ascending: true });
          if (photoRows) applyPhotoRows(photoRows as VaultPhotoRow[]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(photosChannel);
    };
  }, [applyPhotoRows]);

  // Drives the typewriter effect whenever the love note is opened/closed.
  // Uses a recursive setTimeout (instead of a fixed setInterval) so each
  // character's delay can vary slightly — small random jitter for a more
  // human cadence, plus longer pauses at punctuation and paragraph breaks —
  // rather than a robotic constant tick.
  useEffect(() => {
    if (typeIntervalRef.current) {
      clearTimeout(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }

    if (!showLoveNote) {
      setTypedText("");
      setTypingDone(false);
      return;
    }

    let i = 0;
    setTypedText("");
    setTypingDone(false);

    const scheduleNext = () => {
      if (i >= LOVE_NOTE.length) {
        typeIntervalRef.current = null;
        setTypingDone(true);
        return;
      }

      const char = LOVE_NOTE[i];
      i++;
      setTypedText(LOVE_NOTE.slice(0, i));

      // +/-35% random jitter so characters don't land at a perfectly even beat
      const jitter = TYPE_SPEED_MS * 0.35 * (Math.random() * 2 - 1);
      let delay = TYPE_SPEED_MS + jitter;

      if (char === "\n") delay += 260; // breathe at line/paragraph breaks
      else if (char === "." || char === "!" || char === "?") delay += 200;
      else if (char === ",") delay += 90;

      delay = Math.max(delay, 4);

      typeIntervalRef.current = setTimeout(scheduleNext, delay);
    };

    scheduleNext();

    return () => {
      if (typeIntervalRef.current) {
        clearTimeout(typeIntervalRef.current);
        typeIntervalRef.current = null;
      }
    };
  }, [showLoveNote]);

  // Keeps the caret gently in view as the letter grows past the panel's height.
  // Falls back to scrolling the panel to the bottom once typing is complete
  // (e.g. right after Skip, when the caret has already been removed).
  useEffect(() => {
    if (!showLoveNote) return;
    if (caretRef.current) {
      caretRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else if (typingDone && loveNotePanelRef.current) {
      loveNotePanelRef.current.scrollTo({
        top: loveNotePanelRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [typedText, showLoveNote, typingDone]);

  // Keeps the gallery index in bounds if photos are removed while viewing them.
  useEffect(() => {
    if (!unlocked) return;
    const list = photoMap[unlocked.code] || [];
    if (galleryIndex >= list.length) {
      setGalleryIndex(list.length > 0 ? list.length - 1 : 0);
    }
  }, [photoMap, unlocked, galleryIndex]);

  const resetAll = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    if (typeIntervalRef.current) clearTimeout(typeIntervalRef.current);
    setReels([1, 1, 0]);
    setDirections([0, 0, 0]);
    setError(false);
    setShake(false);
    setUnlocked(null);
    setGalleryOpen(false);
    setGalleryIndex(0);
    setShowLoveNote(false);
    setTypedText("");
    setTypingDone(false);
    setRenderedLines([]);
    setHeartPoints(generateHeartPoints());
    setPhase("terminal");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // Note: photos, the shared passcode, and the lock state live in Supabase
    // and are intentionally NOT reset here — they persist for every visitor.
  }, []);

  const runDecrypt = useCallback(() => {
    if (phase !== "terminal") return;
    getAudioCtx();
    setPhase("decrypting");

    let lineIdx = 0;
    setRenderedLines([]);

    const typeLine = () => {
      if (lineIdx >= BOOT_LINES.length) {
        timeouts.current.push(setTimeout(() => setPhase("password"), 700));
        return;
      }
      const target = BOOT_LINES[lineIdx];
      setRenderedLines((prev) => [...prev, ""]);
      let revealed = 0;

      const tick = () => {
        revealed++;
        if (revealed % 2 === 0) playTick();
        const scrambled = target
          .split("")
          .map((ch, i) => {
            if (ch === " ") return " ";
            return i < revealed ? ch : randomChar();
          })
          .join("");
        setRenderedLines((prev) => {
          const next = [...prev];
          next[lineIdx] = scrambled;
          return next;
        });
        if (revealed >= target.length) {
          lineIdx++;
          timeouts.current.push(setTimeout(typeLine, 180));
        } else {
          timeouts.current.push(setTimeout(tick, 22));
        }
      };
      tick();
    };
    typeLine();
  }, [phase]);

  const adjustReel = (index: number, delta: number) => {
    const { min, max } = REEL_CONFIG[index];
    setReels((prev) => {
      const next = [...prev];
      next[index] = wrap(next[index] + delta, min, max);
      return next;
    });
    setDirections((prev) => {
      const next = [...prev];
      next[index] = delta > 0 ? 1 : -1;
      return next;
    });
    setError(false);
    playTick();
  };

  const handleWheel = (index: number, e: React.WheelEvent) => {
    e.preventDefault();
    adjustReel(index, e.deltaY > 0 ? -1 : 1);
  };

  const handleReelKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      adjustReel(index, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      adjustReel(index, -1);
    }
  };

  const checkPassword = useCallback(() => {
    const combined = reels.map((n) => String(n).padStart(2, "0")).join("");
    const match = PASSCODES.find((p) => p.code === combined);

    if (match) {
      playSuccess();
      setUnlocked(match);
      setGalleryIndex(0);
      setShowLoveNote(false);

      if (match.heart) {
        setGalleryOpen(false);
        timeouts.current.push(setTimeout(() => setPhase("reveal"), 500));
        timeouts.current.push(setTimeout(() => setGalleryOpen(true), 5200));
      } else {
        setGalleryOpen(true);
        timeouts.current.push(setTimeout(() => setPhase("reveal"), 500));
      }
    } else {
      playError();
      setError(true);
      setShake(true);
      timeouts.current.push(setTimeout(() => setShake(false), 700));
    }
  }, [reels]);

  const nextPhoto = useCallback(() => {
    if (!unlocked) return;
    const list = photoMap[unlocked.code] || [];
    if (list.length < 2) return;
    playTick();
    setGalleryIndex((i) => (i + 1) % list.length);
  }, [unlocked, photoMap]);

  const prevPhoto = useCallback(() => {
    if (!unlocked) return;
    const list = photoMap[unlocked.code] || [];
    if (list.length < 2) return;
    playTick();
    setGalleryIndex((i) => (i - 1 + list.length) % list.length);
  }, [unlocked, photoMap]);

  // Opens the OS file picker for the given entry's code (e.g. "122725").
  // Blocked while the vault is locked, since locking hides the ability to add.
  const triggerAddPhotos = useCallback(
    (code: string) => {
      if (locked) return;
      setPendingUploadCode(code);
      fileInputRef.current?.click();
    },
    [locked]
  );

  // Uploads the selected image files to Supabase Storage, then records each
  // one as a row in vault_photos under that entry's code. Since storage and
  // the table are shared, every visitor sees the same photos immediately
  // (the realtime subscription above refreshes everyone's view).
  const handleFilesSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      const code = pendingUploadCode;
      if (!files || files.length === 0 || !code || locked) {
        e.target.value = "";
        setPendingUploadCode(null);
        return;
      }

      setUploading(true);

      try {
        for (const file of Array.from(files)) {
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${code}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, file, { upsert: false });

          if (uploadError) continue;

          const { data: publicUrlData } = supabase.storage
            .from(PHOTO_BUCKET)
            .getPublicUrl(path);

          await supabase.from("vault_photos").insert({
            code,
            url: publicUrlData.publicUrl,
          });
        }

        // Refresh immediately rather than waiting for the realtime event.
        const { data: photoRows } = await supabase
          .from("vault_photos")
          .select("id, code, url, created_at")
          .order("created_at", { ascending: true });
        if (photoRows) applyPhotoRows(photoRows as VaultPhotoRow[]);

        playTick();
      } finally {
        setUploading(false);
        e.target.value = "";
        setPendingUploadCode(null);
      }
    },
    [pendingUploadCode, locked, applyPhotoRows]
  );

  // Removes a single photo by index for the given entry. Blocked while
  // locked, mirroring the upload restriction.
  const removePhoto = useCallback(
    async (code: string, index: number) => {
      if (locked) return;
      const id = (photoIdMap[code] || [])[index];
      if (!id) return;

      // Optimistic local update so the UI feels instant.
      setPhotoMap((prev) => {
        const arr = [...(prev[code] || [])];
        arr.splice(index, 1);
        return { ...prev, [code]: arr };
      });
      setPhotoIdMap((prev) => {
        const arr = [...(prev[code] || [])];
        arr.splice(index, 1);
        return { ...prev, [code]: arr };
      });

      await supabase.from("vault_photos").delete().eq("id", id);
    },
    [locked, photoIdMap]
  );

  // --- lock flow ---
  // Tapping the lock icon:
  //  - if currently locked -> opens the "enter passcode" prompt
  //  - if unlocked and no passcode has ever been set (by anyone) -> opens
  //    the "set passcode" flow, then locks
  //  - if unlocked and a passcode already exists -> locks immediately, no
  //    code needed (locking itself doesn't require re-entering the code)
  const openLockFlow = useCallback(async () => {
    setLockError(false);
    setLockDraft("");
    if (locked) {
      setLockModal("unlock");
    } else if (lockCode) {
      setLocked(true);
      await supabase.from("vault_state").update({ locked: true }).eq("id", 1);
    } else {
      setLockModal("setupFirst");
    }
  }, [locked, lockCode]);

  const cancelLockModal = useCallback(() => {
    setLockModal(null);
    setLockDraft("");
    setLockFirstDraft("");
    setLockError(false);
  }, []);

  const submitLockModal = useCallback(async () => {
    if (lockModal === "setupFirst") {
      if (lockDraft.trim().length === 0) return;
      setLockFirstDraft(lockDraft);
      setLockDraft("");
      setLockModal("setupConfirm");
      setLockError(false);
      return;
    }

    if (lockModal === "setupConfirm") {
      if (lockDraft === lockFirstDraft && lockDraft.trim().length > 0) {
        // Guard against a race where someone else set a passcode in the
        // moments since this flow started: only write if it's still empty.
        const { data: current } = await supabase
          .from("vault_state")
          .select("passcode")
          .eq("id", 1)
          .maybeSingle();

        if (current?.passcode) {
          // Someone else already set one first — adopt theirs instead.
          setLockCode(current.passcode);
          setLockErrorMessage(
            "A PASSCODE WAS ALREADY SET BY SOMEONE ELSE — USE THAT ONE"
          );
          setLockError(true);
          setLockDraft("");
          setLockFirstDraft("");
          setLockModal("unlock");
          playError();
          return;
        }

        const { error: updateError } = await supabase
          .from("vault_state")
          .update({ passcode: lockDraft, locked: true })
          .eq("id", 1);

        if (updateError) {
          setLockErrorMessage("SOMETHING WENT WRONG — TRY AGAIN");
          setLockError(true);
          playError();
          return;
        }

        setLockCode(lockDraft);
        setLocked(true);
        setLockModal(null);
        setLockDraft("");
        setLockFirstDraft("");
        setLockError(false);
        playSuccess();
      } else {
        setLockErrorMessage("PASSCODES DID NOT MATCH — TRY AGAIN");
        setLockError(true);
        setLockDraft("");
        setLockFirstDraft("");
        setLockModal("setupFirst");
        playError();
      }
      return;
    }

    if (lockModal === "unlock") {
      if (lockDraft === lockCode) {
        setLocked(false);
        setLockModal(null);
        setLockDraft("");
        setLockError(false);
        playSuccess();
        await supabase
          .from("vault_state")
          .update({ locked: false })
          .eq("id", 1);
      } else {
        setLockErrorMessage("INCORRECT PASSCODE");
        setLockError(true);
        setLockDraft("");
        playError();
      }
    }
  }, [lockModal, lockDraft, lockFirstDraft, lockCode]);

  // Opens the love note AND starts the background music.
  const openLoveNote = useCallback(() => {
    setShowLoveNote(true);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Autoplay can be blocked by the browser until the user interacts;
        // since this fires from a click handler it should generally succeed.
      });
    }
  }, []);

  // Closes the love note AND stops the music.
  const closeLoveNote = useCallback(() => {
    setShowLoveNote(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  // Instantly reveals the rest of the letter without waiting for the typewriter.
  const skipTyping = useCallback(() => {
    if (typeIntervalRef.current) {
      clearTimeout(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    setTypedText(LOVE_NOTE);
    setTypingDone(true);
  }, []);

  const currentPhotos = unlocked ? photoMap[unlocked.code] || [] : [];
  const canEdit = !locked;

  return (
    <div
      className="hh-root"
      style={{
        position: "relative",
        width: "100vw",
        background:
          "radial-gradient(ellipse at 50% 30%, #0d1a0d 0%, #050705 65%, #020302 100%)",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      {/*
        Background music for the love note.
        Drop your own audio file into the project's public folder as
        "about-you.mp3" (e.g. a track you own a licensed copy of).
        This component does not ship any actual audio — you supply the file.
      */}
      <audio ref={audioRef} src="/about-you.mp3" preload="auto" />

      {/* Hidden file input used by every entry's "+ ADD PHOTO" button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        .hh-root {
          height: 100vh; /* fallback for older browsers */
          height: 100dvh; /* accounts for mobile browser chrome */
        }

        @keyframes fall {
          from { transform: translateY(-100%); }
          to { transform: translateY(100vh); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0) rotate(-8deg); }
          60% { opacity: 1; transform: scale(1.15) rotate(2deg); }
          100% { opacity: var(--target-opacity, 1); transform: scale(1) rotate(0deg); }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        @keyframes scanline {
          from { transform: translateY(0); }
          to { transform: translateY(100vh); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        @keyframes floatUp {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-115vh) translateX(var(--drift, 0px)); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes photoIn {
          from { opacity: 0; transform: scale(0.97) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.06); }
        }
        @keyframes slideDigit {
          from { transform: translateX(var(--dir, 14px)); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes cornerPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes caretBlink {
          0%, 45% { opacity: 1; }
          55%, 100% { opacity: 0; }
        }

        .btn {
          font-family: inherit;
          background: transparent;
          padding: clamp(9px, 2.4vw, 11px) clamp(18px, 6vw, 30px);
          font-size: clamp(11px, 3vw, 13px);
          font-weight: 500;
          letter-spacing: clamp(1.5px, 0.7vw, 3px);
          border-radius: 3px;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .btn:active { transform: translateY(1px) scale(0.98); }
        .btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .btn-accent {
          color: #3dff6e;
          border: 1px solid #3dff6e;
        }
        .btn-accent:hover {
          background: #3dff6e;
          color: #050705;
          box-shadow: 0 0 26px rgba(61,255,110,0.55);
          transform: translateY(-1px);
        }
        .btn-danger {
          color: #ff4d6d;
          border: 1px solid #ff4d6d;
        }
        .btn-danger:hover {
          background: #ff4d6d;
          color: #050705;
          box-shadow: 0 0 26px rgba(255,77,109,0.55);
          transform: translateY(-1px);
        }
        .btn-love {
          color: #ffb3c1;
          border: 1px solid #ff4d6d;
          font-size: clamp(10px, 2.8vw, 12px);
          padding: clamp(8px, 2vw, 9px) clamp(14px, 4.5vw, 20px);
          background: rgba(255,77,109,0.08);
        }
        .btn-love:hover {
          background: #ff4d6d;
          color: #050705;
          box-shadow: 0 0 22px rgba(255,77,109,0.6);
        }

        .panel {
          border: 1px solid #1f3f1f;
          background: rgba(10, 18, 10, 0.45);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border-radius: 6px;
          padding: clamp(18px, 5vw, 32px) clamp(16px, 6vw, 40px);
        }

        .reel-group {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          flex-wrap: wrap;
          gap: clamp(6px, 2.5vw, 14px);
        }
        .reel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          user-select: none;
          outline: none;
        }
        .reel-row {
          display: flex;
          align-items: center;
          gap: clamp(4px, 1.5vw, 6px);
        }
        .reel-arrow {
          background: none;
          border: 1px solid #1f3f1f;
          color: #3dff6e;
          font-size: clamp(13px, 4vw, 16px);
          width: clamp(24px, 7vw, 30px);
          height: clamp(46px, 13vw, 56px);
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          opacity: 0.8;
        }
        .reel-arrow:hover {
          opacity: 1;
          border-color: #3dff6e;
          box-shadow: 0 0 10px rgba(61,255,110,0.4);
        }
        .reel-window {
          width: clamp(48px, 14vw, 64px);
          height: clamp(46px, 13vw, 56px);
          background: #0a0f0a;
          border: 1px solid #2c5a2c;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: ew-resize;
          transition: border-color 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .reel:focus .reel-window {
          border-color: #3dff6e;
          box-shadow: 0 0 12px rgba(61,255,110,0.5);
        }
        .reel-window.reel-error {
          border-color: #ff3d5a;
          box-shadow: 0 0 12px rgba(255,61,90,0.6);
        }
        .reel-value {
          font-size: clamp(19px, 5.5vw, 26px);
          font-weight: 600;
          color: #3dff6e;
          letter-spacing: 2px;
          animation: slideDigit 0.28s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .reel-value.reel-value-error {
          color: #ff3d5a;
        }
        .reel-label {
          font-size: clamp(9px, 2.5vw, 10px);
          letter-spacing: 3px;
          color: #4a7a4a;
        }
        .reel-sep {
          color: #2c5a2c;
          font-size: clamp(18px, 5vw, 24px);
          align-self: center;
          margin-top: -18px;
        }

        .hud-corner {
          position: absolute;
          width: clamp(18px, 5vw, 26px);
          height: clamp(18px, 5vw, 26px);
          animation: cornerPulse 4s ease-in-out infinite;
        }

        .nav-arrow {
          background: rgba(10,15,10,0.6);
          border: 1px solid #2c5a2c;
          color: #3dff6e;
          font-size: clamp(16px, 4.5vw, 20px);
          width: clamp(32px, 9vw, 42px);
          height: clamp(32px, 9vw, 42px);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          flex-shrink: 0;
        }
        .nav-arrow:hover:not(:disabled) {
          border-color: #3dff6e;
          box-shadow: 0 0 14px rgba(61,255,110,0.5);
          transform: scale(1.06);
        }
        .nav-arrow:disabled {
          cursor: default;
        }

        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #2c5a2c;
          transition: background 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .dot.dot-active {
          background: #ff4d6d;
          transform: scale(1.35);
        }

        .love-note {
          white-space: pre-line;
          color: #f2e6e9;
          font-size: clamp(12.5px, 3.4vw, 14px);
          line-height: 1.85;
          letter-spacing: 0.3px;
        }

        .love-note-caret {
          display: inline-block;
          width: 8px;
          margin-left: 1px;
          color: #ff4d6d;
          animation: caretBlink 0.9s steps(1) infinite;
        }

        .lock-toggle {
          background: rgba(10,15,10,0.6);
          border: 1px solid #2c5a2c;
          color: #3dff6e;
          font-size: clamp(14px, 4vw, 17px);
          width: clamp(30px, 8vw, 36px);
          height: clamp(30px, 8vw, 36px);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .lock-toggle:hover {
          border-color: #3dff6e;
          box-shadow: 0 0 12px rgba(61,255,110,0.45);
          transform: scale(1.06);
        }

        .lock-input {
          font-family: inherit;
          background: #0a0f0a;
          border: 1px solid #2c5a2c;
          color: #3dff6e;
          font-size: clamp(16px, 4vw, 20px);
          letter-spacing: 6px;
          text-align: center;
          padding: 10px 14px;
          border-radius: 4px;
          outline: none;
          width: min(220px, 70vw);
          transition: border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .lock-input:focus {
          border-color: #3dff6e;
          box-shadow: 0 0 12px rgba(61,255,110,0.5);
        }

        .photo-frame {
          position: relative;
        }
        .photo-remove {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 1px solid #ff4d6d;
          background: rgba(5,7,5,0.75);
          color: #ff4d6d;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .photo-remove:hover {
          background: #ff4d6d;
          color: #050705;
        }
      `}</style>

      <div className="hud-corner" style={{ top: "clamp(10px, 3vw, 18px)", left: "clamp(10px, 3vw, 18px)", borderTop: "2px solid", borderLeft: "2px solid", borderColor: "#3dff6e" }} />
      <div className="hud-corner" style={{ top: "clamp(10px, 3vw, 18px)", right: "clamp(10px, 3vw, 18px)", borderTop: "2px solid", borderRight: "2px solid", borderColor: "#3dff6e" }} />
      <div className="hud-corner" style={{ bottom: "clamp(10px, 3vw, 18px)", left: "clamp(10px, 3vw, 18px)", borderBottom: "2px solid", borderLeft: "2px solid", borderColor: "#3dff6e" }} />
      <div className="hud-corner" style={{ bottom: "clamp(10px, 3vw, 18px)", right: "clamp(10px, 3vw, 18px)", borderBottom: "2px solid", borderRight: "2px solid", borderColor: "#3dff6e" }} />

      {phase !== "reveal" && (
        <div style={{ position: "absolute", inset: 0, opacity: 0.28 }}>
          {rain.map((col, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${col.left}%`,
                top: 0,
                color: "#1f7a3a",
                fontSize: "13px",
                lineHeight: "16px",
                whiteSpace: "pre",
                animation: `fall ${col.duration}s linear ${col.delay}s infinite`,
              }}
            >
              {col.chars.map((c, j) => (
                <div key={j}>{c}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {phase !== "reveal" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(transparent 0%, rgba(61,255,110,0.06) 50%, transparent 100%)",
            height: "60px",
            animation: "scanline 5s linear infinite",
            pointerEvents: "none",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {floatHearts.map((h, i) => (
          <div
            key={i}
            style={
              {
                position: "absolute",
                left: `${h.left}%`,
                bottom: "-10%",
                fontSize: `${h.size}px`,
                color: "#ff4d6d",
                opacity: phase === "reveal" ? 0.5 : 0.1,
                "--drift": `${h.drift}px`,
                animation: `floatUp ${h.duration}s linear ${h.delay}s infinite`,
                textShadow: "0 0 8px rgba(255,77,109,0.6)",
                transition: "opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
              } as React.CSSProperties
            }
          >
            ♥
          </div>
        ))}
      </div>

      {(phase === "terminal" || phase === "decrypting") && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "28px",
            padding: "20px",
            animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          <div className="panel" style={{ width: "min(560px, 88vw)" }}>
            <div
              style={{
                color: "#3dff6e",
                fontSize: "clamp(11px, 3vw, 13px)",
                letterSpacing: "2px",
                minHeight: "140px",
                textAlign: "left",
                textShadow: "0 0 8px rgba(61,255,110,0.5)",
                animation: "flicker 3s infinite",
              }}
            >
              {phase === "terminal" ? (
                <div style={{ opacity: 0.6 }}>&gt; system idle. awaiting command_</div>
              ) : (
                renderedLines.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
          </div>

          {phase === "terminal" && (
            <button className="btn btn-accent" onClick={runDecrypt}>
              DECRYPT
            </button>
          )}
        </div>
      )}

      {phase === "password" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "26px",
            padding: "20px",
            animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          <div
            className="panel"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "22px",
              animation: shake ? "shake 0.5s ease" : "none",
            }}
          >
            <div
              style={{
                color: "#3dff6e",
                fontSize: "clamp(11px, 3vw, 13px)",
                letterSpacing: "3px",
                textShadow: "0 0 8px rgba(61,255,110,0.5)",
                textAlign: "center",
              }}
            >
              &gt; SCROLL TO SET DATE CODE
            </div>

            <div className="reel-group">
              {REEL_CONFIG.map((cfg, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
                  <div
                    className="reel"
                    tabIndex={0}
                    onWheel={(e) => handleWheel(i, e)}
                    onKeyDown={(e) => handleReelKeyDown(i, e)}
                  >
                    <div className="reel-row">
                      <button
                        className="reel-arrow"
                        onClick={() => adjustReel(i, -1)}
                        aria-label={`decrease ${cfg.label}`}
                      >
                        ‹
                      </button>
                      <div
                        className={`reel-window${error ? " reel-error" : ""}`}
                        onWheel={(e) => handleWheel(i, e)}
                      >
                        <div
                          key={`${reels[i]}-${directions[i]}`}
                          className={`reel-value${error ? " reel-value-error" : ""}`}
                          style={
                            {
                              "--dir": `${directions[i] >= 0 ? 14 : -14}px`,
                            } as React.CSSProperties
                          }
                        >
                          {String(reels[i]).padStart(2, "0")}
                        </div>
                      </div>
                      <button
                        className="reel-arrow"
                        onClick={() => adjustReel(i, 1)}
                        aria-label={`increase ${cfg.label}`}
                      >
                        ›
                      </button>
                    </div>
                    <div className="reel-label">{cfg.label}</div>
                  </div>
                  {i < REEL_CONFIG.length - 1 && (
                    <div className="reel-sep">/</div>
                  )}
                </div>
              ))}
            </div>

            <button className="btn btn-accent" onClick={checkPassword}>
              UNLOCK
            </button>

            <div
              style={{
                minHeight: "18px",
                fontSize: "clamp(10px, 2.8vw, 12px)",
                letterSpacing: "2px",
                color: "#ff3d5a",
                textShadow: "0 0 8px rgba(255,61,90,0.6)",
                opacity: error ? 1 : 0,
                transition: "opacity 0.2s ease",
                textAlign: "center",
              }}
            >
              ACCESS DENIED — INCORRECT CODE
            </div>
          </div>
        </div>
      )}

      {phase === "reveal" && unlocked && (
        <div style={{ position: "absolute", inset: 0, animation: "fadeIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "70vmin",
              height: "70vmin",
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgba(255,77,109,0.35) 0%, transparent 70%)",
              animation: "pulseGlow 3.5s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "absolute",
              top: "8%",
              left: "50%",
              transform: "translateX(-50%)",
              textAlign: "center",
              width: "min(90vw, 480px)",
              animation: "fadeIn 0.8s ease both",
            }}
          >
            <div
              style={{
                color: "#3dff6e",
                fontSize: "clamp(13px, 4vw, 16px)",
                letterSpacing: "clamp(2px, 1vw, 5px)",
                textShadow: "0 0 10px rgba(61,255,110,0.6)",
              }}
            >
              ACCESS GRANTED
            </div>
            <div
              style={{
                color: "#ff4d6d",
                fontSize: "clamp(10px, 3vw, 12px)",
                letterSpacing: "clamp(1.5px, 0.8vw, 3px)",
                marginTop: "6px",
                textShadow: "0 0 8px rgba(255,77,109,0.6)",
              }}
            >
              {unlocked.label} — {unlocked.dateLabel}
            </div>
          </div>

          {unlocked.heart && !galleryOpen && (
            <svg
              viewBox="0 0 24 24"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "58vmin",
                height: "58vmin",
                transform: "translate(-50%, -50%)",
                opacity: 0,
                animation:
                  "fadeIn 1.2s ease 0.1s both, pulseGlow 3.5s ease-in-out 1.3s infinite",
                filter: "drop-shadow(0 0 26px rgba(255,77,109,0.55))",
                pointerEvents: "none",
              }}
            >
              <defs>
                <linearGradient id="heartFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ff8fa3" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#ff2d55" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              <path
                d="M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09 C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5 c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"
                fill="url(#heartFill)"
              />
            </svg>
          )}

          {unlocked.heart && !galleryOpen &&
            heartPoints.map((p, i) => (
              <span
                key={i}
                style={
                  {
                    position: "absolute",
                    left: `calc(50% + ${p.x * HEART_SCALE}vmin)`,
                    top: `calc(50% + ${-p.y * HEART_SCALE}vmin)`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `${p.size}vmin`,
                    fontWeight: 600,
                    color: "#ff4d6d",
                    textShadow: "0 0 10px rgba(255,77,109,0.6)",
                    whiteSpace: "nowrap",
                    opacity: 0,
                    "--target-opacity": p.opacity,
                    animation: `popIn 0.7s ${p.delay}s cubic-bezier(0.34,1.56,0.64,1) forwards`,
                  } as React.CSSProperties
                }
              >
                I love you
              </span>
            ))}

          {!galleryOpen && (
            <button
              className="btn btn-danger"
              onClick={resetAll}
              style={{
                position: "absolute",
                bottom: "8%",
                left: "50%",
                transform: "translateX(-50%)",
                animation: "fadeIn 1s ease 0.6s both",
              }}
            >
              REPLAY
            </button>
          )}

          {unlocked.heart && (
            <button
              className="btn btn-love"
              onClick={openLoveNote}
              style={{
                position: "absolute",
                top: "clamp(12px, 3vw, 20px)",
                right: "clamp(12px, 3vw, 20px)",
                zIndex: 15,
                animation: "fadeIn 1s ease 4.6s both",
              }}
            >
              To my love -
            </button>
          )}

          {galleryOpen && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(2,3,2,0.92)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "18px",
                zIndex: 10,
                animation: "fadeIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "14px",
                  width: "min(94vw, 420px)",
                }}
              >
                <div
                  style={{
                    color: "#3dff6e",
                    fontSize: "clamp(10px, 3vw, 12px)",
                    letterSpacing: "3px",
                    textShadow: "0 0 8px rgba(61,255,110,0.5)",
                  }}
                >
                  {unlocked.dateLabel}
                </div>
                <button
                  className="lock-toggle"
                  onClick={openLockFlow}
                  aria-label={locked ? "unlock photo vault" : "lock photo vault"}
                  title={locked ? "Unlock photo vault" : "Lock photo vault"}
                >
                  {locked ? "🔒" : "🔓"}
                </button>
              </div>

              {locked && (
                <div
                  style={{
                    color: "#9fb89f",
                    fontSize: "clamp(10px, 2.8vw, 11px)",
                    letterSpacing: "2px",
                    textAlign: "center",
                  }}
                >
                  🔒 VAULT LOCKED — VIEW ONLY
                </div>
              )}

              {currentPhotos.length === 0 ? (
                <div
                  style={{
                    color: "#6a8a6a",
                    fontSize: "clamp(11px, 3vw, 12px)",
                    letterSpacing: "1.5px",
                    textAlign: "center",
                    padding: "18px 10px",
                  }}
                >
                  {canEdit
                    ? "No photos yet — tap + to add some"
                    : "No photos yet"}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "clamp(8px, 3vw, 16px)",
                    maxWidth: "94vw",
                  }}
                >
                  <button
                    className="nav-arrow"
                    onClick={prevPhoto}
                    aria-label="previous photo"
                    disabled={currentPhotos.length < 2}
                    style={{ opacity: currentPhotos.length < 2 ? 0.25 : 1 }}
                  >
                    ‹
                  </button>

                  <div className="photo-frame">
                    <img
                      key={galleryIndex}
                      src={currentPhotos[galleryIndex]}
                      alt={`${unlocked.label} photo ${galleryIndex + 1}`}
                      style={{
                        maxWidth: "min(70vw, 60vh)",
                        maxHeight: "50vh",
                        display: "block",
                        borderRadius: "6px",
                        boxShadow: "0 0 40px rgba(255,77,109,0.4)",
                        border: "1px solid #2c5a2c",
                        animation: "photoIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
                      }}
                    />
                    {canEdit && (
                      <button
                        className="photo-remove"
                        onClick={() => removePhoto(unlocked.code, galleryIndex)}
                        aria-label="remove this photo"
                        title="Remove photo"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <button
                    className="nav-arrow"
                    onClick={nextPhoto}
                    aria-label="next photo"
                    disabled={currentPhotos.length < 2}
                    style={{ opacity: currentPhotos.length < 2 ? 0.25 : 1 }}
                  >
                    ›
                  </button>
                </div>
              )}

              {currentPhotos.length > 0 && (
                <div style={{ display: "flex", gap: "8px" }}>
                  {currentPhotos.map((_, i) => (
                    <div
                      key={i}
                      className={`dot${i === galleryIndex ? " dot-active" : ""}`}
                    />
                  ))}
                </div>
              )}

              {currentPhotos.length > 0 && (
                <div
                  style={{
                    color: "#9fb89f",
                    fontSize: "clamp(10px, 2.8vw, 11px)",
                    letterSpacing: "2px",
                  }}
                >
                  {galleryIndex + 1} / {currentPhotos.length}
                </div>
              )}

              {canEdit && (
                <button
                  className="btn btn-accent"
                  onClick={() => triggerAddPhotos(unlocked.code)}
                  disabled={uploading}
                >
                  {uploading ? "UPLOADING..." : "+ ADD PHOTO"}
                </button>
              )}

              <div
                style={{
                  color: "#ff4d6d",
                  fontSize: "clamp(13px, 3.6vw, 15px)",
                  letterSpacing: "3px",
                  textShadow: "0 0 10px rgba(255,77,109,0.6)",
                }}
              >
                {unlocked.label}
              </div>

              <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", justifyContent: "center" }}>
                {unlocked.heart && (
                  <button
                    className="btn btn-accent"
                    onClick={() => setGalleryOpen(false)}
                  >
                    CLOSE
                  </button>
                )}
                <button className="btn btn-danger" onClick={resetAll}>
                  REPLAY
                </button>
              </div>
            </div>
          )}

          {lockModal && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(2,3,2,0.96)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 30,
                padding: "20px",
                animation: "fadeIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
            >
              <div
                className="panel"
                style={{
                  width: "min(360px, 90vw)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "18px",
                  alignItems: "center",
                  animation: lockError ? "shake 0.5s ease" : "none",
                }}
              >
                <div
                  style={{
                    color: "#3dff6e",
                    letterSpacing: "3px",
                    fontSize: "clamp(11px, 3vw, 13px)",
                    textAlign: "center",
                    textShadow: "0 0 8px rgba(61,255,110,0.5)",
                  }}
                >
                  {lockModal === "setupFirst" && "> SET VAULT PASSCODE"}
                  {lockModal === "setupConfirm" && "> CONFIRM PASSCODE"}
                  {lockModal === "unlock" && "> ENTER VAULT PASSCODE"}
                </div>

                <input
                  type="password"
                  value={lockDraft}
                  onChange={(e) => {
                    setLockDraft(e.target.value);
                    setLockError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitLockModal();
                  }}
                  autoFocus
                  className="lock-input"
                  placeholder="••••••"
                />

                <div
                  style={{
                    minHeight: "16px",
                    fontSize: "clamp(10px, 2.8vw, 12px)",
                    letterSpacing: "2px",
                    color: "#ff3d5a",
                    textShadow: "0 0 8px rgba(255,61,90,0.6)",
                    opacity: lockError ? 1 : 0,
                    transition: "opacity 0.2s ease",
                    textAlign: "center",
                  }}
                >
                  {lockErrorMessage}
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <button className="btn btn-accent" onClick={submitLockModal}>
                    {lockModal === "unlock" ? "UNLOCK" : "NEXT"}
                  </button>
                  <button className="btn btn-danger" onClick={cancelLockModal}>
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          )}

          {showLoveNote && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(2,3,2,0.96)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 20,
                padding: "clamp(12px, 4vw, 24px)",
                animation: "fadeIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
            >
              <div
                ref={loveNotePanelRef}
                className="panel"
                style={{
                  width: "min(560px, 92vw)",
                  maxHeight: "72vh",
                  overflowY: "auto",
                  scrollBehavior: "smooth",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <div
                  style={{
                    color: "#ff4d6d",
                    fontSize: "clamp(10px, 3vw, 12px)",
                    letterSpacing: "4px",
                    textShadow: "0 0 8px rgba(255,77,109,0.6)",
                  }}
                >
                  ♥ 12.27.25
                </div>
                <div className="love-note">
                  {typedText}
                  {!typingDone && (
                    <span ref={caretRef} className="love-note-caret">
                      ▌
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "22px", flexWrap: "wrap", justifyContent: "center" }}>
                {!typingDone && (
                  <button className="btn btn-love" onClick={skipTyping}>
                    SKIP
                  </button>
                )}
                <button className="btn btn-love" onClick={closeLoveNote}>
                  CLOSE
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}