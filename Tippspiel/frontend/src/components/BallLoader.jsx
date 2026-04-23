import { useEffect, useRef, useState } from 'react';
import './BallLoader.css';

const SESSION_KEY = 'wm-loader-full-seen';
const EXIT_DURATION_MS = 640;
const MINI_EXIT_DURATION_MS = 160;

const getInitialMode = () => {
  if (typeof window === 'undefined') {
    return 'full';
  }

  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1' ? 'mini' : 'full';
  } catch {
    return 'full';
  }
};

function BallLoader({ loading, title = 'Wird geladen', subtitle = '', children }) {
  const [isExiting, setIsExiting] = useState(false);
  const [mode, setMode] = useState(getInitialMode);
  const previousLoadingRef = useRef(loading);

  useEffect(() => {
    const previousLoading = previousLoadingRef.current;
    let timeoutId;

    if (previousLoading && !loading) {
      setIsExiting(true);
      const activeDuration = mode === 'full' ? EXIT_DURATION_MS : MINI_EXIT_DURATION_MS;

      timeoutId = setTimeout(() => {
        setIsExiting(false);

        if (mode === 'full') {
          try {
            window.sessionStorage.setItem(SESSION_KEY, '1');
          } catch {
            // ignore storage limitations and keep behavior functional
          }
          setMode('mini');
        }
      }, activeDuration);
    }

    if (!previousLoading && loading) {
      setIsExiting(false);
    }

    previousLoadingRef.current = loading;

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loading]);

  const showOverlay = loading || isExiting;
  const overlayClassName = `bl-overlay bl-mode-${mode} ${loading ? 'bl-is-loading' : 'bl-is-exiting'}`;

  return (
    <>
      {showOverlay && (
        <div className={overlayClassName} aria-hidden={!loading}>
          <div className="bl-aurora bl-aurora-a" />
          <div className="bl-aurora bl-aurora-b" />
          <div className="bl-stage">
            <div className="bl-ball-wrap">
              <div className="bl-ball-glow" />
              <div className="bl-ball-shadow" />
              <div className="bl-trail" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="bl-ball">
                <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <defs>
                    <radialGradient id="bl-ball-base" cx="32%" cy="28%" r="70%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="62%" stopColor="#f3f6fb" />
                      <stop offset="100%" stopColor="#d7dee9" />
                    </radialGradient>
                  </defs>

                  <circle cx="60" cy="60" r="56" fill="url(#bl-ball-base)" />

                  <g fill="#111827">
                    <polygon points="60,39 73,48 68,63 52,63 47,48" />
                    <polygon points="60,15 72,23 68,35 52,35 48,23" />
                    <polygon points="86,27 95,41 86,52 73,48 74,34" />
                    <polygon points="95,74 85,90 70,91 67,75 80,63" />
                    <polygon points="60,105 47,96 52,80 68,80 73,96" />
                    <polygon points="24,74 34,63 48,67 52,84 38,91" />
                    <polygon points="24,41 34,52 48,48 46,34 34,27" />
                  </g>

                  <g stroke="#5b6474" strokeWidth="2.1" fill="none" strokeLinecap="round">
                    <path d="M60 39 L60 15" />
                    <path d="M73 48 L86 27" />
                    <path d="M68 63 L95 74" />
                    <path d="M52 63 L24 74" />
                    <path d="M47 48 L24 41" />
                    <path d="M68 80 L60 105" />
                    <path d="M52 80 L60 105" />
                    <path d="M73 96 L85 90" />
                    <path d="M47 96 L38 91" />
                  </g>

                  <circle cx="60" cy="60" r="56" fill="none" stroke="#111827" strokeWidth="2.8" />
                  <ellipse cx="44" cy="36" rx="19" ry="12" fill="#ffffff" opacity="0.22" />
                </svg>
              </div>
            </div>

            {loading && mode === 'full' && (
              <div className="bl-text" role="status" aria-live="polite">
                <h2 className="bl-title">{title}</h2>
                {subtitle && <p className="bl-subtitle">{subtitle}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {children}
    </>
  );
}

export default BallLoader;
