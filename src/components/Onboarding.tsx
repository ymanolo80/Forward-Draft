import { useEffect, useState, type ReactNode } from "react";

// First-run walkthrough of Forward Draft's distinctive features. Shown once
// (gated by a localStorage flag in App) and replayable from the Options menu.
// Illustrations are CSS/markup mock-ups built from the app's own theme tokens
// and script-line styling, so they mirror the real UI without going stale.

interface OnboardingProps {
  open: boolean;
  onClose: () => void;
}

interface Slide {
  title: string;
  body: string;
  illustration: ReactNode;
}

function WelcomeIllustration() {
  return (
    <div className="ob-illus ob-welcome" aria-hidden="true">
      <div className="ob-brand">
        <img src="/forward-draft-mark.svg" alt="" />
        <strong>Forward Draft</strong>
      </div>
      <div className="ob-stages">
        <span className="ob-stage ob-stage-1">Write</span>
        <span className="ob-arrow">→</span>
        <span className="ob-stage ob-stage-2">Review</span>
        <span className="ob-arrow">→</span>
        <span className="ob-stage ob-stage-3">Rewrite</span>
      </div>
    </div>
  );
}

function FadeIllustration() {
  return (
    <div className="ob-illus ob-fade" aria-hidden="true">
      <div className="ob-page">
        <div className="ob-line scene-heading ob-fade-3">INT. KITCHEN — DAY</div>
        <div className="ob-line ob-fade-2">She reads the letter again.</div>
        <div className="ob-line ob-fade-1">Then folds it, slowly.</div>
        <div className="ob-line ob-active">
          The kettle starts to scream<span className="ob-caret" />
        </div>
      </div>
      <div className="ob-controls">
        <div className="ob-control">
          <span>Visible text</span>
          <b>Last 3 lines</b>
        </div>
        <div className="ob-control">
          <span>Disappearing text</span>
          <b>Fade after 3s</b>
        </div>
      </div>
    </div>
  );
}

function ReviewIllustration() {
  return (
    <div className="ob-illus ob-review" aria-hidden="true">
      <div className="ob-page">
        <div className="ob-line scene-heading">INT. KITCHEN — DAY</div>
        <div className="ob-line">
          She reads <span className="ob-highlight">the letter</span> again.
        </div>
      </div>
      <div className="ob-note">
        <span className="ob-note-quote">“the letter”</span>
        <span>Clarify what it says</span>
      </div>
      <span className="ob-status">Needs Rewrite</span>
    </div>
  );
}

function RewriteIllustration() {
  return (
    <div className="ob-illus ob-rewrite2" aria-hidden="true">
      <div className="ob-reviewed">
        <span className="ob-mini-label">Reviewed scene</span>
        <div className="ob-line scene-heading">INT. KITCHEN — DAY</div>
        <div className="ob-line">
          She reads <span className="ob-highlight">the letter</span> again.
        </div>
        <span className="ob-note-inline">Clarify what it says</span>
      </div>
      <div className="ob-rewrite-panel">
        <span className="ob-mini-label">
          Your rewrite <span className="ob-version">v3</span>
        </span>
        <div className="ob-line scene-heading">INT. KITCHEN — DAY</div>
        <div className="ob-rw-line">
          <span className="ob-rw-old">She reads the letter again.</span>
          <span className="ob-rw-new">
            She reads it — then burns it.<span className="ob-caret" />
          </span>
        </div>
      </div>
    </div>
  );
}

function PrevNextIllustration() {
  return (
    <div className="ob-illus ob-rewrite" aria-hidden="true">
      <div className="ob-neighbor ob-prev">▲ Previous scene · INT. HALLWAY</div>
      <div className="ob-scene-active">
        <div className="ob-line scene-heading">INT. KITCHEN — DAY</div>
        <div className="ob-line">She folds the letter, slowly.</div>
      </div>
      <div className="ob-neighbor ob-next">▼ Next scene · EXT. STREET</div>
      <div className="ob-toggle">☑ Previous/next scene</div>
    </div>
  );
}

function CompareIllustration() {
  return (
    <div className="ob-illus ob-compare" aria-hidden="true">
      <div className="ob-compare-pages">
        <div className="ob-cmp-page">
          <span className="ob-mini-label">Compare · V2</span>
          <div className="ob-line scene-heading">INT. KITCHEN — DAY</div>
          <div className="ob-line">She reads the letter again.</div>
        </div>
        <div className="ob-cmp-page">
          <span className="ob-mini-label">Current · V3</span>
          <div className="ob-line scene-heading">INT. KITCHEN — DAY</div>
          <div className="ob-line">She reads the letter — then burns it.</div>
        </div>
      </div>
    </div>
  );
}

function ExportIllustration() {
  return (
    <div className="ob-illus ob-export" aria-hidden="true">
      <div className="ob-menu">
        <div className="ob-menu-item">Fountain</div>
        <div className="ob-menu-item">Final Draft</div>
        <div className="ob-menu-item">PDF — full script</div>
        <div className="ob-menu-item">Revision PDF — full script, marked changes</div>
        <div className="ob-menu-item ob-menu-hot">Changes PDF — changed scenes only, with notes</div>
      </div>
    </div>
  );
}

function DoneIllustration() {
  return (
    <div className="ob-illus ob-done" aria-hidden="true">
      <div className="ob-cloud">
        <svg viewBox="-4 -6 72 56" width="92" height="72" role="img">
          <path
            d="M20 40h26a12 12 0 0 0 2-23.8A16 16 0 0 0 16 14 11 11 0 0 0 20 40Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path className="ob-check" d="M25 27l5 5 9-11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p>Autosaved &amp; backed up</p>
    </div>
  );
}

const slides: Slide[] = [
  {
    title: "Welcome to Forward Draft",
    body: "A focused home for your script through three stages — Write, Review, and Rewrite. Here's what makes each one different.",
    illustration: <WelcomeIllustration />,
  },
  {
    title: "Write with disappearing text",
    body: "Stay in flow: only your most recent lines stay on screen and older text gently fades, so you keep moving forward instead of editing. Tune it with the Visible text window (current line, last few lines, or previous scene) and how quickly text disappears.",
    illustration: <FadeIllustration />,
  },
  {
    title: "Review",
    body: "Mark a scene For Review or Approved, then highlight any line and attach a note to it — so every change you want is pinned to the exact words.",
    illustration: <ReviewIllustration />,
  },
  {
    title: "Rewrite with everything in view",
    body: "Your reviewed scene and its notes stay on top and your rewrite panel sits below, so you can work through each note as you write the new version. Every pass is saved to the scene's history.",
    illustration: <RewriteIllustration />,
  },
  {
    title: "Stay oriented",
    body: "Toggle Previous/next scene to peek at the scenes on either side without leaving your rewrite — so you always know where you are in the flow of the script.",
    illustration: <PrevNextIllustration />,
  },
  {
    title: "Compare versions",
    body: "Back in Review, set an earlier version beside the current one to see exactly what changed between drafts — and promote the older take if you prefer it.",
    illustration: <CompareIllustration />,
  },
  {
    title: "Export however you need",
    body: "Export to Fountain, plain text, or PDF — the full script, a revision PDF with changes marked, or a changes-only PDF with your notes. You can also import Fountain, TXT and Final Draft files.",
    illustration: <ExportIllustration />,
  },
  {
    title: "Your work is safe",
    body: "Everything autosaves and is backed up automatically on your device. To begin, create a new script from Options → File, or import an existing one from Options → Import.",
    illustration: <DoneIllustration />,
  },
];

export function Onboarding({ open, onClose }: OnboardingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") setIndex((current) => Math.min(slides.length - 1, current + 1));
      else if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="How Forward Draft works">
      <section className="onboarding-card">
        <button className="onboarding-skip" onClick={onClose} aria-label="Skip the walkthrough">
          Skip
        </button>
        <div className="onboarding-stage" key={index}>
          {slide.illustration}
        </div>
        <div className="onboarding-copy">
          <strong>{slide.title}</strong>
          <p>{slide.body}</p>
        </div>
        <footer className="onboarding-footer">
          <div className="onboarding-dots" aria-hidden="true">
            {slides.map((_, dot) => (
              <span key={dot} className={dot === index ? "active" : ""} />
            ))}
          </div>
          <div className="onboarding-nav">
            {index > 0 && (
              <button onClick={() => setIndex((current) => Math.max(0, current - 1))}>Back</button>
            )}
            {isLast ? (
              <button className="primary" onClick={onClose}>
                Start writing
              </button>
            ) : (
              <button className="primary" onClick={() => setIndex((current) => Math.min(slides.length - 1, current + 1))}>
                Next
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
