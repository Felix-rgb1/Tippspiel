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
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <clipPath id="bl-clip">
                    <circle cx="50" cy="50" r="46" />
                  </clipPath>
                </defs>
                {/* Base circle */}
                <circle cx="50" cy="50" r="47" fill="#f8fafc" />
                {/* Football patches */}
                <g clipPath="url(#bl-clip)" fill="#111827">
                  {/* Center pentagon */}
                  <polygon points="50,33 62,43 57,58 43,58 38,43" />
                  {/* Top */}
                  <polygon points="50,13 62,22 58,33 42,33 38,22" />
                  {/* Top-right */}
                  <polygon points="73,22 81,35 73,45 62,42 63,29" />
                  {/* Bottom-right */}
                  <polygon points="81,63 73,77 60,78 57,65 68,55" />
                  {/* Bottom */}
                  <polygon points="50,87 38,78 43,65 57,65 62,78" />
                  {/* Bottom-left */}
                  <polygon points="19,63 27,55 38,58 43,72 30,78" />
                  {/* Top-left */}
                  <polygon points="19,35 27,45 38,42 37,29 27,22" />
                </g>
                {/* Outline */}
                <circle cx="50" cy="50" r="46" fill="none" stroke="#111827" strokeWidth="2.5" />
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
