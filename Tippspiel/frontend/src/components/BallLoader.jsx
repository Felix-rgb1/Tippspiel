import { useState, useEffect } from 'react';
import './BallLoader.css';

function BallLoader({ loading, title = 'Wird geladen', subtitle = '', children }) {
  const [phase, setPhase] = useState(() => (loading ? 'loading' : 'done'));

  useEffect(() => {
    if (!loading && phase === 'loading') {
      setPhase('kick');
      const t1 = setTimeout(() => setPhase('expand'), 620);
      const t2 = setTimeout(() => setPhase('done'), 1260);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [loading, phase]);

  return (
    <>
      {phase !== 'done' && (
        <div className={`bl-overlay bl-phase-${phase}`} aria-hidden="true">
          <div className="bl-stage">
            <div className={`bl-ball bl-ball-${phase}`}>
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

            {phase === 'loading' && (
              <div className="bl-text" role="status" aria-live="polite">
                <h2 className="bl-title">{title}</h2>
                {subtitle && <p className="bl-subtitle">{subtitle}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={phase !== 'done' ? 'bl-hidden' : undefined}>
        {children}
      </div>
    </>
  );
}

export default BallLoader;
