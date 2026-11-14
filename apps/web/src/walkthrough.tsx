import { useState } from "react";

/** The v2 walkthrough on YouTube (6:37, every transaction made for real on testnet). */
export const WALKTHROUGH_ID = "V5BmI2lDing";
export const WALKTHROUGH_URL = `https://www.youtube.com/watch?v=${WALKTHROUGH_ID}`;

/**
 * The walkthrough, embedded. Nothing loads from YouTube until the viewer presses play: the frame shows the video's
 * thumbnail, and only then embeds YouTube's privacy-enhanced player (youtube-nocookie.com), so opening the page sets no
 * YouTube cookies and sends YouTube nothing.
 */
export function Walkthrough() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="demo-frame">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${WALKTHROUGH_ID}?autoplay=1&rel=0&modestbranding=1`}
          title="How to use Cloak"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button className="demo-play" onClick={() => setPlaying(true)} aria-label="Play the walkthrough, 6 minutes 37 seconds">
          <img
            src={`https://i.ytimg.com/vi/${WALKTHROUGH_ID}/maxresdefault.jpg`}
            alt=""
            loading="lazy"
            // the full-HD thumbnail exists for HD uploads; the standard one (with letterbox bars) is the fallback
            onError={(e) => { const i = e.currentTarget; if (!i.src.endsWith("/hqdefault.jpg")) i.src = `https://i.ytimg.com/vi/${WALKTHROUGH_ID}/hqdefault.jpg`; }}
          />
          <span className="demo-play-btn" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
          </span>
          <span className="demo-play-note">6:37 · plays from YouTube</span>
        </button>
      )}
    </div>
  );
}
