import { useEffect, useState } from "react";
import { Link } from "../router";
import { Nav } from "../ui";

/** The v2 walkthrough on YouTube. Empty shows the "being recorded" placeholder. */
const YOUTUBE_ID = "";

/**
 * The walkthrough video: the real app, step by step, with a voice over. Nothing loads from YouTube until the viewer
 * presses play: the page shows the video's thumbnail, and only then embeds YouTube's privacy-enhanced player
 * (youtube-nocookie.com), so opening this page sets no YouTube cookies and sends YouTube nothing.
 */
export function Demo() {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    document.title = "Cloak · Demo";
    return () => { document.title = "Cloak · Fair launches and private trading on Elysium"; };
  }, []);

  return (
    <>
      <Nav />
      <div className="wrap demo-page">
        <div className="eyebrow">Walkthrough</div>
        <h1>How to use Cloak</h1>
        <p className="lede">A full screen tour of the live app. Shielding funds, launching a token, bidding privately, trading and sending, start to finish.</p>
        <div className="demo-frame">
          {!YOUTUBE_ID ? (
            <div className="demo-soon">
              <h3>The walkthrough is being recorded</h3>
              <p>Check back soon. Meanwhile you can try the app yourself on Elysium.</p>
              <Link to="/app" className="btn btn-primary">Open the app</Link>
            </div>
          ) : playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1`}
              title="How to use Cloak"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button className="demo-play" onClick={() => setPlaying(true)} aria-label="Play the walkthrough">
              <img
                src={`https://i.ytimg.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`}
                alt=""
                loading="lazy"
                // the full-HD thumbnail exists for HD uploads; the standard one (with letterbox bars) is the fallback
                onError={(e) => { const i = e.currentTarget; if (!i.src.endsWith("/hqdefault.jpg")) i.src = `https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg`; }}
              />
              <span className="demo-play-btn" aria-hidden>
                <svg width="28" height="28" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
              </span>
              <span className="demo-play-note">Plays from YouTube</span>
            </button>
          )}
        </div>
        <div className="demo-links">
          <Link to="/app" className="btn btn-primary">Open the app</Link>
          <Link to="/docs" className="btn btn-ghost">Read the docs</Link>
          {YOUTUBE_ID && <a href={`https://www.youtube.com/watch?v=${YOUTUBE_ID}`} target="_blank" rel="noreferrer" className="btn btn-ghost">Watch on YouTube ↗</a>}
        </div>
      </div>
    </>
  );
}
