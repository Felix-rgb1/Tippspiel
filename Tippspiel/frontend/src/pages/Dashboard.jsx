import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchAPI, tipAPI, leaderboardAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDateTimeDe, parseDateTimeLocal, toTimestamp } from '../utils/dateTime';
import { getMatchThemeStyle } from '../utils/teamTheme';
import BallLoader from '../components/BallLoader';
import './Dashboard.css';

const TEAM_ISO_MAP = {
  argentina: 'AR',
  argentinien: 'AR',
  algeria: 'DZ',
  aegypten: 'EG',
  agypten: 'EG',
  egypt: 'EG',
  algerien: 'DZ',
  australien: 'AU',
  australia: 'AU',
  belgien: 'BE',
  belgium: 'BE',
  bolivien: 'BO',
  bolivia: 'BO',
  bosnia: 'BA',
  'bosnia herzegovina': 'BA',
  'bosnia hercegovina': 'BA',
  bosnien: 'BA',
  'bosnien herzegowina': 'BA',
  'bosnien hercegowina': 'BA',
  brasilien: 'BR',
  brazil: 'BR',
  canada: 'CA',
  'cape verde': 'CV',
  'cape verde islands': 'CV',
  'cabo verde': 'CV',
  kapverden: 'CV',
  kanada: 'CA',
  chile: 'CL',
  china: 'CN',
  'costa rica': 'CR',
  congo: 'CG',
  'congo dr': 'CD',
  'dr congo': 'CD',
  'd r congo': 'CD',
  'congo rd': 'CD',
  'congo democratic republic': 'CD',
  'democratic republic of congo': 'CD',
  'democratic republic of the congo': 'CD',
  'congo kinshasa': 'CD',
  'congo brazzaville': 'CG',
  'republic of congo': 'CG',
  'congo republic': 'CG',
  curacao: 'CW',
  daenemark: 'DK',
  danemark: 'DK',
  denmark: 'DK',
  deutschland: 'DE',
  ecuador: 'EC',
  england: 'GB',
  frankreich: 'FR',
  france: 'FR',
  jordan: 'JO',
  georgien: 'GE',
  georgia: 'GE',
  germany: 'DE',
  ghana: 'GH',
  haiti: 'HT',
  iran: 'IR',
  irak: 'IQ',
  iraq: 'IQ',
  italien: 'IT',
  italy: 'IT',
  japan: 'JP',
  kamerun: 'CM',
  cameroon: 'CM',
  katar: 'QA',
  qatar: 'QA',
  kolumbien: 'CO',
  colombia: 'CO',
  kroatien: 'HR',
  croatia: 'HR',
  marokko: 'MA',
  morocco: 'MA',
  mexiko: 'MX',
  mexico: 'MX',
  neuseeland: 'NZ',
  'new zealand': 'NZ',
  niederlande: 'NL',
  netherlands: 'NL',
  norwegen: 'NO',
  norway: 'NO',
  paraguay: 'PY',
  peru: 'PE',
  polen: 'PL',
  poland: 'PL',
  panama: 'PA',
  portugal: 'PT',
  austria: 'AT',
  osterreich: 'AT',
  oesterreich: 'AT',
  rumaenien: 'RO',
  romania: 'RO',
  'saudi arabia': 'SA',
  'saudi arabien': 'SA',
  schweiz: 'CH',
  schweden: 'SE',
  sweden: 'SE',
  switzerland: 'CH',
  senegal: 'SN',
  serbien: 'RS',
  serbia: 'RS',
  schottland: 'GB',
  scotland: 'GB',
  spanien: 'ES',
  spain: 'ES',
  suedafrika: 'ZA',
  'south africa': 'ZA',
  suedkorea: 'KR',
  sudkorea: 'KR',
  'south korea': 'KR',
  tschechien: 'CZ',
  'czech republic': 'CZ',
  tunesien: 'TN',
  tunisia: 'TN',
  turkei: 'TR',
  tuerkei: 'TR',
  turkey: 'TR',
  uruguay: 'UY',
  usa: 'US',
  uzbekistan: 'UZ',
  'vereinigte staaten': 'US',
  'united states': 'US',
  venezuela: 'VE',
  'ivory coast': 'CI',
  'cote d ivoire': 'CI',
  'cote divoire': 'CI',
  elfenbeinkueste: 'CI',
  'elfenbeinkuste': 'CI'
};

function AvatarDisplay({ value }) {
  if (value && value.startsWith('data:')) {
    return <img src={value} alt="Avatar" className="bonus-public-avatar-img" />;
  }

  return <span className="bonus-public-avatar" aria-hidden="true">{value || '⚽'}</span>;
}

const TEAM_NAME_DE_MAP = {
  // Unique country mappings (English and German variants merged)
  argentina: 'Argentinien',
  argentinien: 'Argentinien',
  australia: 'Australien',
  australien: 'Australien',
  austria: 'Österreich',
  aegypten: 'Ägypten',
  egypt: 'Ägypten',
  belgium: 'Belgien',
  belgien: 'Belgien',
  bolivia: 'Bolivien',
  bolivien: 'Bolivien',
  'bosnia herzegovina': 'Bosnien-Herzegowina',
  'bosnia hercegovina': 'Bosnien-Herzegowina',
  bosnien: 'Bosnien-Herzegowina',
  'bosnien herzegowina': 'Bosnien-Herzegowina',
  'bosnien hercegowina': 'Bosnien-Herzegowina',
  brazil: 'Brasilien',
  brasilien: 'Brasilien',
  cameroon: 'Kamerun',
  kamerun: 'Kamerun',
  canada: 'Kanada',
  kanada: 'Kanada',
  'cape verde islands': 'Kapverden',
  kapverden: 'Kapverden',
  chile: 'Chile',
  china: 'China',
  colombia: 'Kolumbien',
  kolumbien: 'Kolumbien',
  'congo dr': 'Demokratische Republik Kongo',
  'dr congo': 'Demokratische Republik Kongo',
  'd r congo': 'Demokratische Republik Kongo',
  'congo rd': 'Demokratische Republik Kongo',
  'congo democratic republic': 'Demokratische Republik Kongo',
  'democratic republic of congo': 'Demokratische Republik Kongo',
  'republic of congo': 'Kongo',
  'congo republic': 'Kongo',
  congo: 'Kongo',
  kongo: 'Kongo',
  'costa rica': 'Costa Rica',
  croatia: 'Kroatien',
  kroatien: 'Kroatien',
  curacao: 'Curaçao',
  cyprus: 'Zypern',
  zypern: 'Zypern',
  'czech republic': 'Tschechien',
  czechia: 'Tschechien',
  tschechien: 'Tschechien',
  denmark: 'Dänemark',
  daenemark: 'Dänemark',
  danemark: 'Dänemark',
  ecuador: 'Ecuador',
  england: 'England',
  estonia: 'Estland',
  estland: 'Estland',
  finland: 'Finnland',
  finnland: 'Finnland',
  france: 'Frankreich',
  frankreich: 'Frankreich',
  gabon: 'Gabun',
  gabun: 'Gabun',
  georgia: 'Georgien',
  georgien: 'Georgien',
  germany: 'Deutschland',
  deutschland: 'Deutschland',
  ghana: 'Ghana',
  greece: 'Griechenland',
  griechenland: 'Griechenland',
  guinea: 'Guinea',
  haiti: 'Haiti',
  honduras: 'Honduras',
  hungary: 'Ungarn',
  ungarn: 'Ungarn',
  iceland: 'Island',
  island: 'Island',
  india: 'Indien',
  indien: 'Indien',
  indonesia: 'Indonesien',
  indonesien: 'Indonesien',
  iran: 'Iran',
  iraq: 'Irak',
  irak: 'Irak',
  ireland: 'Irland',
  irland: 'Irland',
  israel: 'Israel',
  italy: 'Italien',
  italien: 'Italien',
  ivory_coast: 'Elfenbeinküste',
  'ivory coast': 'Elfenbeinküste',
  'cote d ivoire': 'Elfenbeinküste',
  'cote divoire': 'Elfenbeinküste',
  elfenbeinkueste: 'Elfenbeinküste',
  elfenbeinkuste: 'Elfenbeinküste',
  jamaica: 'Jamaika',
  jamaika: 'Jamaika',
  japan: 'Japan',
  jordan: 'Jordanien',
  jordanien: 'Jordanien',
  kazakhstan: 'Kasachstan',
  kasachstan: 'Kasachstan',
  kenya: 'Kenia',
  kenia: 'Kenia',
  kosovo: 'Kosovo',
  kuwait: 'Kuwait',
  kyrgyzstan: 'Kirgistan',
  kirgistan: 'Kirgistan',
  latvia: 'Lettland',
  lettland: 'Lettland',
  lebanon: 'Libanon',
  libanon: 'Libanon',
  lesotho: 'Lesotho',
  liberia: 'Liberia',
  libya: 'Libyen',
  libyen: 'Libyen',
  liechtenstein: 'Liechtenstein',
  lithuania: 'Litauen',
  litauen: 'Litauen',
  luxembourg: 'Luxemburg',
  luxemburg: 'Luxemburg',
  malta: 'Malta',
  mali: 'Mali',
  mexico: 'Mexiko',
  mexiko: 'Mexiko',
  moldova: 'Moldawien',
  moldawien: 'Moldawien',
  monaco: 'Monaco',
  montenegro: 'Montenegro',
  morocco: 'Marokko',
  marokko: 'Marokko',
  mozambique: 'Mosambik',
  mosambik: 'Mosambik',
  namibia: 'Namibia',
  netherlands: 'Niederlande',
  niederlande: 'Niederlande',
  'new zealand': 'Neuseeland',
  neuseeland: 'Neuseeland',
  nicaragua: 'Nicaragua',
  niger: 'Niger',
  nigeria: 'Nigeria',
  'north korea': 'Nordkorea',
  nordkorea: 'Nordkorea',
  'north macedonia': 'Nordmazedonien',
  nordmazedonien: 'Nordmazedonien',
  norway: 'Norwegen',
  norwegen: 'Norwegen',
  oman: 'Oman',
  panama: 'Panama',
  paraguay: 'Paraguay',
  peru: 'Peru',
  philippines: 'Philippinen',
  philippinen: 'Philippinen',
  poland: 'Polen',
  polen: 'Polen',
  portugal: 'Portugal',
  qatar: 'Katar',
  katar: 'Katar',
  romania: 'Rumänien',
  rumaenien: 'Rumänien',
  rumänien: 'Rumänien',
  russia: 'Russland',
  russland: 'Russland',
  'saudi arabia': 'Saudi-Arabien',
  'saudi arabien': 'Saudi-Arabien',
  scotland: 'Schottland',
  schottland: 'Schottland',
  senegal: 'Senegal',
  serbia: 'Serbien',
  serbien: 'Serbien',
  singapore: 'Singapur',
  singapur: 'Singapur',
  slovakia: 'Slowakei',
  slowakei: 'Slowakei',
  slovenia: 'Slowenien',
  slowenien: 'Slowenien',
  'south africa': 'Südafrika',
  suedafrika: 'Südafrika',
  südafrika: 'Südafrika',
  'south korea': 'Südkorea',
  suedkorea: 'Südkorea',
  südkorea: 'Südkorea',
  sudkorea: 'Südkorea',
  spain: 'Spanien',
  spanien: 'Spanien',
  sudan: 'Sudan',
  suriname: 'Surinam',
  surinam: 'Surinam',
  sweden: 'Schweden',
  schweden: 'Schweden',
  switzerland: 'Schweiz',
  schweiz: 'Schweiz',
  syria: 'Syrien',
  syrien: 'Syrien',
  taiwan: 'Taiwan',
  tajikistan: 'Tadschikistan',
  tadschikistan: 'Tadschikistan',
  tanzania: 'Tansania',
  tansania: 'Tansania',
  thailand: 'Thailand',
  togo: 'Togo',
  'trinidad and tobago': 'Trinidad und Tobago',
  'trinidad und tobago': 'Trinidad und Tobago',
  tunisia: 'Tunesien',
  tunesien: 'Tunesien',
  turkey: 'Türkei',
  turkei: 'Türkei',
  tuerkei: 'Türkei',
  turkmenistan: 'Turkmenistan',
  uganda: 'Uganda',
  ukraine: 'Ukraine',
  'united arab emirates': 'Vereinigte Arabische Emirate',
  'vereinigte arabische emirate': 'Vereinigte Arabische Emirate',
  'united kingdom': 'Vereinigtes Königreich',
  'vereinigtes koenigreich': 'Vereinigtes Königreich',
  'united states': 'Vereinigte Staaten',
  usa: 'Vereinigte Staaten',
  'vereinigte staaten': 'Vereinigte Staaten',
  uruguay: 'Uruguay',
  uzbekistan: 'Usbekistan',
  venezuela: 'Venezuela',
  vietnam: 'Vietnam',
  wales: 'Wales',
  zambia: 'Sambia',
  zimbabwe: 'Simbabwe'
};

const TEAM_NAME_SHORT_MAP = {
  'bosnien herzegowina': 'Bosnien-Herz.',
  'vereinigte staaten': 'USA',
  'vereinigtes konigreich': 'UK',
  'vereinigte arabische emirate': 'VAE',
  'demokratische republik kongo': 'DR Kongo',
  'trinidad und tobago': 'Trinidad/Tob.',
  'saudi arabien': 'Saudi-Arab.'
};

function normalizeTeamName(teamName) {
  return (teamName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getFlagImageUrl(isoCode) {
  return `https://flagcdn.com/w40/${isoCode.toLowerCase()}.png`;
}

function getTeamDisplay(teamName) {
  const normalized = normalizeTeamName(teamName);
  const isoCode = TEAM_ISO_MAP[normalized];
  const germanLabel = TEAM_NAME_DE_MAP[normalized];
  const fullLabel = germanLabel || String(teamName || '').trim();
  const shortLabel = TEAM_NAME_SHORT_MAP[normalizeTeamName(fullLabel)];

  const label = shortLabel || fullLabel;

  return {
    isoCode,
    label,
    fullLabel
  };
}

function TeamFlag({ teamDisplay }) {
  if (!teamDisplay.isoCode) {
    return <span className="team-flag-fallback" aria-hidden="true">🏳️</span>;
  }

  return (
    <img
      className="team-flag-img"
      src={getFlagImageUrl(teamDisplay.isoCode)}
      alt={`Flagge ${teamDisplay.fullLabel || teamDisplay.label}`}
      loading="lazy"
      width="20"
      height="14"
    />
  );
}

function normalizeLiveStatus(statusText) {
  return String(statusText || '').trim().toUpperCase();
}

function getLiveStatusLabel(liveUpdate) {
  const rawStatus = normalizeLiveStatus(liveUpdate?.statusText);

  if (
    rawStatus.includes('HT')
    || rawStatus.includes('HALF TIME')
    || rawStatus.includes('HALF-TIME')
    || rawStatus.includes('HALFTIME')
    || rawStatus.includes('PAUSE')
    || rawStatus.includes('BREAK')
    || rawStatus.includes('INTERVAL')
  ) {
    return 'Halbzeit';
  }

  const stageMap = {
    HT: 'Halbzeit',
    'HALF TIME': 'Halbzeit',
    'HALF-TIME': 'Halbzeit',
    HALFTIME: 'Halbzeit',
    PAUSE: 'Halbzeit',
    BREAK: 'Halbzeit',
    INT: 'Unterbrechung',
    '1H': '1. Halbzeit',
    '2H': '2. Halbzeit',
    ET: 'Verlaengerung',
    AET: 'Verlaengerung',
    PEN: 'Elfmeterschiessen'
  };

  if (stageMap[rawStatus]) {
    return stageMap[rawStatus];
  }

  const minute = Number(liveUpdate?.minute);
  if (Number.isFinite(minute) && minute > 0) {
    return `Live ${minute}'`;
  }

  return 'Live';
}

function getRedCardCounts(liveUpdate) {
  // Use direct red card counts from fixture data (provided by Flashscore API)
  const home = Number(liveUpdate?.homeRedCards) || 0;
  const away = Number(liveUpdate?.awayRedCards) || 0;
  // Also count from incidents array as fallback (in case of future API changes)
  const incidents = Array.isArray(liveUpdate?.incidents) ? liveUpdate.incidents : [];
  const incidentHome = incidents.filter(i => (i?.type === 'red' || i?.type === 'yellow_red') && i?.isHome === true).length;
  const incidentAway = incidents.filter(i => (i?.type === 'red' || i?.type === 'yellow_red') && i?.isHome === false).length;
  return {
    home: Math.max(home, incidentHome),
    away: Math.max(away, incidentAway),
    unknown: 0
  };
}

function normalizeRoundLabel(round) {
  const normalized = String(round || '').trim().toLowerCase();

  if (
    normalized === 'achtelfinale'
    || normalized === 'round of 16'
    || normalized === 'last 16'
    || normalized === '1/16 finale'
    || normalized === '1/16 final'
    || normalized === '16th final'
    || normalized === 'sixteenth final'
  ) {
    return '16tel Finale';
  }

  return round;
}

function Dashboard() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [savedTips, setSavedTips] = useState({});
  const [visibleTipsByMatch, setVisibleTipsByMatch] = useState({});
  const [expandedTipsMatches, setExpandedTipsMatches] = useState({});
  const [nextTipSavedByMatch, setNextTipSavedByMatch] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeRound, setActiveRound] = useState('Alle');
  const [matchStatusFilter, setMatchStatusFilter] = useState('Alle');
  const [bonusTip, setBonusTip] = useState({ champion_team: '', runner_up_team: '' });
  const [bonusLocked, setBonusLocked] = useState(false);
  const [bonusDeadline, setBonusDeadline] = useState(null);
  const [publicBonusTips, setPublicBonusTips] = useState([]);
  const [publicBonusTipsExpanded, setPublicBonusTipsExpanded] = useState(false);
  const [savingBonus, setSavingBonus] = useState(false);
  const [now, setNow] = useState(new Date());
  const [liveUpdatesByMatch, setLiveUpdatesByMatch] = useState({});
  const [scoreFlashByMatch, setScoreFlashByMatch] = useState({});
  const [liveUpdateFlashByMatch, setLiveUpdateFlashByMatch] = useState({});
  const [goalToasts, setGoalToasts] = useState([]);
  const [lastWinner, setLastWinner] = useState(null);
  const [liveConnectionMode, setLiveConnectionMode] = useState('idle');
  const [lastLiveEventAt, setLastLiveEventAt] = useState(null);
  const previousLiveScoreRef = useRef({});
  const previousLiveMetaRef = useRef({});
  const scoreFlashTimersRef = useRef({});
  const liveUpdateFlashTimersRef = useRef({});
  const goalToastTimersRef = useRef({});
  const { user } = useAuth();

  useEffect(() => {
    fetchMatches();
  }, [user]);

  useEffect(() => {
    if (!bonusLocked) {
      setPublicBonusTipsExpanded(false);
    }
  }, [bonusLocked]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const isFlashscoreSource = (match) => {
      const source = String(match.external_source || '').toLowerCase();
      return source.includes('flashscore') && !source.includes('test-bundesliga');
    };
    const isInTrackingWindow = (match) => {
      const source = String(match.external_source || '').toLowerCase();
      if (source === 'flashscore-wm' || source === 'flashscore-bundesliga') {
        return true;
      }

      const matchTs = toTimestamp(match.match_date);
      if (!Number.isFinite(matchTs)) {
        return false;
      }

      return Math.abs(Date.now() - matchTs) <= 8 * 60 * 60 * 1000;
    };

    const candidateIds = matches
      .filter((match) => !match.finished && isFlashscoreSource(match) && isInTrackingWindow(match))
      .map((match) => match.id);

    console.log('[POLL-DEBUG] Dashboard poll check:', {
      totalMatches: matches.length,
      notFinished: matches.filter(m => !m.finished).length,
      isFlashscore: matches.filter(m => isFlashscoreSource(m)).length,
      inWindow: matches.filter(m => isInTrackingWindow(m)).length,
      candidateIds,
      details: matches.slice(0, 3).map(m => ({
        id: m.id,
        finished: m.finished,
        external_source: m.external_source,
        home: m.home_team
      }))
    });

    if (!candidateIds.length) {
      console.log('[POLL-DEBUG] No candidates for polling - skipping');
      setLiveConnectionMode('idle');
      return undefined;
    }

    console.log('[POLL-DEBUG] Starting live stream for', candidateIds.length, 'matches:', candidateIds);

    let stopped = false;
    let timer = null;
    let eventSource = null;

    const isPageVisible = () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible');

    const applyPayload = (payload) => {
      const updates = payload?.updates || {};
      if (!stopped) {
        setLastLiveEventAt(new Date());
        setLiveUpdatesByMatch((prev) => ({
          ...prev,
          ...updates
        }));
      }
    };

    const scheduleNextPoll = (delayMs) => {
      if (stopped) {
        return;
      }
      timer = setTimeout(runPoll, delayMs);
    };

    const runPoll = async () => {
      if (!isPageVisible()) {
        scheduleNextPoll(60000);
        return;
      }

      try {
        const response = await matchAPI.getLive(candidateIds);
        const payload = response?.data || {};
        setLiveConnectionMode('polling');
        applyPayload(payload);

        const nextPollInMs = Number(payload.nextPollInMs) || 60000;
        const updates = payload?.updates || {};
        const hasLiveMatch = Object.values(updates).some((entry) => Boolean(entry?.isLive));
        const minDelay = hasLiveMatch ? 5000 : 15000;
        const delay = Math.max(minDelay, Math.min(300000, nextPollInMs));
        scheduleNextPoll(delay);
      } catch (err) {
        scheduleNextPoll(60000);
      }
    };

    const startPollingFallback = (initialDelayMs = 0) => {
      if (stopped) {
        return;
      }
      if (initialDelayMs > 0) {
        scheduleNextPoll(initialDelayMs);
      } else {
        runPoll();
      }
    };

    const supportsSSE = typeof window !== 'undefined' && typeof window.EventSource !== 'undefined';
    const streamUrl = matchAPI.getLiveStreamUrl(candidateIds);

    if (supportsSSE && streamUrl) {
      setLiveConnectionMode('connecting');
      eventSource = new window.EventSource(streamUrl);

      eventSource.onopen = () => {
        setLiveConnectionMode('sse');
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          setLiveConnectionMode('sse');
          applyPayload(payload);
        } catch {
          // Ignore malformed stream event and keep connection alive.
        }
      };

      eventSource.onerror = () => {
        setLiveConnectionMode('polling');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        startPollingFallback(5000);
      };
    } else {
      setLiveConnectionMode('polling');
      startPollingFallback();
    }

    return () => {
      stopped = true;
      if (eventSource) {
        eventSource.close();
      }
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [matches]);

  useEffect(() => {
    Object.entries(liveUpdatesByMatch || {}).forEach(([matchId, update]) => {
      const homeGoals = Number(update?.homeGoals);
      const awayGoals = Number(update?.awayGoals);
      const hasScore = Number.isFinite(homeGoals) && Number.isFinite(awayGoals);
      const nextScore = hasScore ? `${homeGoals}:${awayGoals}` : null;
      const previousScore = previousLiveScoreRef.current[matchId];

      const nextMeta = {
        isLive: Boolean(update?.isLive),
        isFinished: Boolean(update?.isFinished),
        statusText: normalizeLiveStatus(update?.statusText),
        minute: Number.isFinite(Number(update?.minute)) ? Number(update.minute) : null,
        score: nextScore
      };
      const previousMeta = previousLiveMetaRef.current[matchId];

      const statusChanged = Boolean(
        previousMeta
        && (
          previousMeta.isLive !== nextMeta.isLive
          || previousMeta.isFinished !== nextMeta.isFinished
          || previousMeta.statusText !== nextMeta.statusText
        )
      );

      if (statusChanged) {
        setLiveUpdateFlashByMatch((prev) => ({ ...prev, [matchId]: true }));
        if (liveUpdateFlashTimersRef.current[matchId]) {
          clearTimeout(liveUpdateFlashTimersRef.current[matchId]);
        }
        liveUpdateFlashTimersRef.current[matchId] = setTimeout(() => {
          setLiveUpdateFlashByMatch((prev) => ({ ...prev, [matchId]: false }));
        }, 1800);
      }

      if (hasScore && previousScore && previousScore !== nextScore) {
        const [prevHome, prevAway] = previousScore.split(':').map((goal) => Number(goal) || 0);
        const homeDiff = homeGoals - prevHome;
        const awayDiff = awayGoals - prevAway;
        const currentMatch = matches.find((match) => String(match.id) === String(matchId));

        if (currentMatch && (homeDiff > 0 || awayDiff > 0)) {
          const homeTeamLabel = getTeamDisplay(currentMatch.home_team).label;
          const awayTeamLabel = getTeamDisplay(currentMatch.away_team).label;

          let headline = 'Tor!';
          if (homeDiff > awayDiff) {
            headline = `Tor ${homeTeamLabel}!`;
          } else if (awayDiff > homeDiff) {
            headline = `Tor ${awayTeamLabel}!`;
          }

          const toastId = `${matchId}-${Date.now()}`;
          setGoalToasts((prev) => [
            {
              id: toastId,
              headline,
              detail: `${homeTeamLabel} ${homeGoals}:${awayGoals} ${awayTeamLabel}`,
            },
            ...prev,
          ].slice(0, 4));

          goalToastTimersRef.current[toastId] = setTimeout(() => {
            setGoalToasts((prev) => prev.filter((toast) => toast.id !== toastId));
            delete goalToastTimersRef.current[toastId];
          }, 5500);
        }

        setScoreFlashByMatch((prev) => ({ ...prev, [matchId]: true }));
        setLiveUpdateFlashByMatch((prev) => ({ ...prev, [matchId]: true }));

        if (scoreFlashTimersRef.current[matchId]) {
          clearTimeout(scoreFlashTimersRef.current[matchId]);
        }
        if (liveUpdateFlashTimersRef.current[matchId]) {
          clearTimeout(liveUpdateFlashTimersRef.current[matchId]);
        }

        scoreFlashTimersRef.current[matchId] = setTimeout(() => {
          setScoreFlashByMatch((prev) => ({ ...prev, [matchId]: false }));
        }, 1100);

        liveUpdateFlashTimersRef.current[matchId] = setTimeout(() => {
          setLiveUpdateFlashByMatch((prev) => ({ ...prev, [matchId]: false }));
        }, 1800);
      }

      if (hasScore) {
        previousLiveScoreRef.current[matchId] = nextScore;
      }
      previousLiveMetaRef.current[matchId] = nextMeta;
    });
  }, [liveUpdatesByMatch, matches]);

  useEffect(() => {
    return () => {
      Object.values(scoreFlashTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      Object.values(liveUpdateFlashTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      Object.values(goalToastTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
    };
  }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const [syncResult, matchesResult, bonusResult, publicBonusResult, lastWinnerResult] = await Promise.allSettled([
        matchAPI.syncResultsOnOpen(),
        matchAPI.getAll(),
        tipAPI.getBonusTip(),
        tipAPI.getVisibleBonusTips(),
        leaderboardAPI.getLastWinner()
      ]);

      if (matchesResult.status !== 'fulfilled') {
        throw matchesResult.reason;
      }

      let nextMatches = matchesResult.value.data;

      if (syncResult.status === 'fulfilled') {
        const syncData = syncResult.value?.data || {};
        const changedCount =
          (Number(syncData?.backfill?.finishedUpdates) || 0)
          + (Number(syncData?.wm?.updatedCount) || 0)
          + (Number(syncData?.wm?.createdCount) || 0)
          + (Number(syncData?.bundesliga?.updatedCount) || 0)
          + (Number(syncData?.bundesliga?.createdCount) || 0);

        if (syncData.executed && changedCount > 0) {
          const refreshedMatches = await matchAPI.getAll();
          nextMatches = refreshedMatches.data;
        }
      } else {
        console.warn('[DASHBOARD] Ergebnis-Sync beim Oeffnen fehlgeschlagen:', syncResult.reason?.message || syncResult.reason);
      }

      setMatches(nextMatches);

      // Fetch user's tips
      const [tipsResponse, visibleTipsResponse] = await Promise.all([
        tipAPI.getUserTips(user.id),
        tipAPI.getVisibleTips()
      ]);
      const tipsMap = {};
      tipsResponse.data.forEach(tip => {
        tipsMap[tip.match_id] = {
          home_goals: tip.home_goals,
          away_goals: tip.away_goals
        };
      });
      setTips(tipsMap);
      setSavedTips(tipsMap);

      const groupedVisibleTips = {};
      visibleTipsResponse.data.forEach((tip) => {
        if (!groupedVisibleTips[tip.match_id]) {
          groupedVisibleTips[tip.match_id] = [];
        }

        groupedVisibleTips[tip.match_id].push(tip);
      });
      setVisibleTipsByMatch(groupedVisibleTips);

      if (bonusResult.status === 'fulfilled' && bonusResult.value?.data) {
        setBonusLocked(Boolean(bonusResult.value.data.locked));
        setBonusDeadline(bonusResult.value.data.deadline);
        setBonusTip({
          champion_team: bonusResult.value.data.bonusTip?.champion_team || '',
          runner_up_team: bonusResult.value.data.bonusTip?.runner_up_team || ''
        });
      } else {
        setBonusLocked(true);
        setBonusDeadline(null);
        setBonusTip({ champion_team: '', runner_up_team: '' });
      }

      if (publicBonusResult.status === 'fulfilled' && publicBonusResult.value?.data?.locked) {
        setPublicBonusTips(Array.isArray(publicBonusResult.value.data.tips) ? publicBonusResult.value.data.tips : []);
      } else {
        setPublicBonusTips([]);
      }

      if (lastWinnerResult.status === 'fulfilled' && lastWinnerResult.value?.data?.winner) {
        setLastWinner(lastWinnerResult.value.data);
      }
    } catch (err) {
      setError('Fehler beim Laden der Spiele');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBonusTipSubmit = async () => {
    if (bonusLocked) {
      setError('Die Deadline für Bonusfragen ist bereits abgelaufen');
      return;
    }

    if (!bonusTip.champion_team || !bonusTip.runner_up_team) {
      setError('Bitte Weltmeister und Vizemeister auswählen');
      return;
    }

    if (bonusTip.champion_team === bonusTip.runner_up_team) {
      setError('Weltmeister und Vizemeister müssen unterschiedlich sein');
      return;
    }

    try {
      setSavingBonus(true);
      setError('');
      await tipAPI.submitBonusTip(bonusTip.champion_team, bonusTip.runner_up_team);
      setSuccess('Bonusfragen gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern der Bonusfragen');
    } finally {
      setSavingBonus(false);
    }
  };

  const handleTipChange = (matchId, field, value) => {
    setTips(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [field]: parseInt(value) || 0
      }
    }));
  };
  const inputRefs = useRef({});

  const handleTipStep = (matchId, field, delta) => {
    setTips(prev => {
      const current = prev[matchId] || { home_goals: 0, away_goals: 0 };
      const newVal = Math.max(0, Math.min(20, (current[field] ?? 0) + delta));
      return { ...prev, [matchId]: { ...current, [field]: newVal } };
    });
  };

  const handleSubmitTip = async (matchId, source = 'default') => {
    try {
      const tip = tips[matchId] || {};
      const homeGoals = tip.home_goals ?? 0;
      const awayGoals = tip.away_goals ?? 0;
      await tipAPI.submit(matchId, homeGoals, awayGoals);

      setSavedTips((prev) => ({
        ...prev,
        [matchId]: {
          home_goals: homeGoals,
          away_goals: awayGoals
        }
      }));

      setSuccess('Tipp abgegeben!');

      setNextTipSavedByMatch((prev) => ({ ...prev, [matchId]: true }));
      setTimeout(() => {
        setNextTipSavedByMatch((prev) => ({ ...prev, [matchId]: false }));
      }, source === 'next' ? 1600 : 1400);

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Abgeben des Tipps');
    }
  };

  const getTipSaveState = (matchId) => {
    const current = tips[matchId];
    const persisted = savedTips[matchId];
    const hasSavedTip = Boolean(persisted);

    if (!current && !persisted) {
      return {
        hasSavedTip: false,
        isDirty: true,
        buttonLabel: 'Tipp speichern'
      };
    }

    const currentHome = Number(current?.home_goals ?? persisted?.home_goals ?? 0);
    const currentAway = Number(current?.away_goals ?? persisted?.away_goals ?? 0);
    const savedHome = Number(persisted?.home_goals ?? 0);
    const savedAway = Number(persisted?.away_goals ?? 0);

    const isDirty = !hasSavedTip || currentHome !== savedHome || currentAway !== savedAway;

    return {
      hasSavedTip,
      isDirty,
      buttonLabel: !hasSavedTip
        ? 'Tipp speichern'
        : (isDirty ? 'Aenderungen speichern' : 'Tipp gespeichert')
    };
  };

  const isDeadlinePassed = (matchDate) => {
    const parsedDate = parseDateTimeLocal(matchDate);
    if (!parsedDate) return false;
    const deadline = new Date(parsedDate.getTime() - 60 * 60 * 1000);
    return new Date() > deadline;
  };

  const formatDate = (date) => formatDateTimeDe(date, true);

  const getCountdown = (matchDate) => {
    const parsedDate = parseDateTimeLocal(matchDate);
    if (!parsedDate) return null;
    const deadline = new Date(parsedDate.getTime() - 60 * 60 * 1000);
    const diff = deadline - now;
    if (diff <= 0 || diff > 2 * 60 * 60 * 1000) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const toggleVisibleTips = (matchId) => {
    setExpandedTipsMatches((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  const togglePublicBonusTips = () => {
    setPublicBonusTipsExpanded((prev) => !prev);
  };

  const getMatchStatus = (match, liveUpdate) => {
    if (liveUpdate?.isLive) {
      return { label: getLiveStatusLabel(liveUpdate), className: 'status-live' };
    }

    if (liveUpdate?.isFinished || match.finished) {
      return { label: 'Abgeschlossen', className: 'status-finished' };
    }

    if (isDeadlinePassed(match.match_date)) {
      return { label: 'Gesperrt', className: 'status-locked' };
    }

    return { label: 'Offen', className: 'status-open' };
  };

  const openMatchInfo = (matchId) => {
    const match = matches.find((m) => m.id === matchId);
    navigate(`/match/${matchId}`, { state: { match: match || null } });
  };

  const allTeams = Array.from(
    new Set(matches.flatMap((match) => [match.home_team, match.away_team]).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'de'));



  const rounds = ['Alle', ...Array.from(
    new Set(matches.map((match) => normalizeRoundLabel(match.round)).filter(Boolean))
  )];

  const roundFilteredMatches = activeRound === 'Alle'
    ? matches
    : matches.filter((match) => normalizeRoundLabel(match.round) === activeRound);

  const statusFilteredMatches = matchStatusFilter === 'Alle'
    ? roundFilteredMatches
    : roundFilteredMatches.filter((match) =>
      matchStatusFilter === 'Offen' ? !match.finished : Boolean(match.finished)
    );

  const visibleMatches = statusFilteredMatches.slice().sort((firstMatch, secondMatch) => {
    if (matchStatusFilter === 'Alle' && firstMatch.finished !== secondMatch.finished) {
      return firstMatch.finished ? 1 : -1;
    }

    return toTimestamp(firstMatch.match_date) - toTimestamp(secondMatch.match_date);
  });

  const finishedCount = matches.filter((m) => m.finished).length;
  const openCount = matches.length - finishedCount;
  const submittedTipsCount = Object.keys(savedTips).length;
  const upcomingMatches = matches
    .filter((match) => !match.finished)
    .slice()
    .sort((firstMatch, secondMatch) => toTimestamp(firstMatch.match_date) - toTimestamp(secondMatch.match_date))
    .slice(0, 3);

  const missingTipsCount = matches.filter(
    m => !m.finished && !isDeadlinePassed(m.match_date) && !tips[m.id]
  ).length;

  const liveConnectionText = (() => {
    if (liveConnectionMode === 'sse') return 'Live verbunden (SSE)';
    if (liveConnectionMode === 'polling') return 'Live verbunden (Fallback)';
    if (liveConnectionMode === 'connecting') return 'Live verbindet...';
    return 'Live inaktiv';
  })();

  return (
    <BallLoader loading={loading} title="Dashboard wird geladen" subtitle="Spiele und Tipps werden vorbereitet...">
    <div className="container">
      <div className="page-title">
        <h1>Dashboard</h1>
        <p>Geben Sie Ihre Tipps ab!</p>
        <div className={`live-connection-chip is-${liveConnectionMode}`}>
          <span className="dot" aria-hidden="true" />
          <span>{liveConnectionText}</span>
          {lastLiveEventAt && (
            <span className="ts">letztes Update {lastLiveEventAt.toLocaleTimeString('de-DE')}</span>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {goalToasts.length > 0 && (
        <div className="goal-toast-stack" aria-live="polite" aria-atomic="false">
          {goalToasts.map((toast) => (
            <div key={toast.id} className="goal-toast">
              <span className="goal-toast-icon" aria-hidden="true">⚽</span>
              <div className="goal-toast-content">
                <strong>{toast.headline}</strong>
                <span>{toast.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {missingTipsCount > 0 && (
        <div className="missing-tips-banner">
          ⚠️ Du hast noch <strong>{missingTipsCount}</strong> {missingTipsCount === 1 ? 'Spiel' : 'Spiele'} ohne Tipp!
        </div>
      )}

      {lastWinner && (
        <div className="matchday-winner-banner">
          <span className="matchday-winner-trophy">🏆</span>
          <div className="matchday-winner-text">
            <span className="matchday-winner-round">{lastWinner.round}</span>
            <span className="matchday-winner-name">{lastWinner.winner.username}</span>
            <span className="matchday-winner-points">{lastWinner.winner.round_points} Punkte</span>
          </div>
          <span className="matchday-winner-label">Spieltag-Sieger</span>
        </div>
      )}

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="label">Spiele gesamt</span>
          <span className="value">{matches.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">Noch offen</span>
          <span className="value">{openCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Abgeschlossen</span>
          <span className="value">{finishedCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Meine Tipps</span>
          <span className="value">{submittedTipsCount}</span>
        </div>
      </div>

      {upcomingMatches.length > 0 && (
        <div className="next-matches-panel">
          <div className="next-matches-headline">
            <h2>Heute / Als Nächstes</h2>
            <span>{upcomingMatches.length} Spiele</span>
          </div>
          <div className="next-matches-list">
            {upcomingMatches.map((match) => {
              const liveUpdate = liveUpdatesByMatch[match.id];
              const isFinished = Boolean(match.finished || liveUpdate?.isFinished);
              const isScoreFlashing = Boolean(scoreFlashByMatch[match.id]);
              const status = getMatchStatus(match, liveUpdate);
              const redCards = getRedCardCounts(liveUpdate);
              const tip = tips[match.id] || { home_goals: 0, away_goals: 0 };
              const tipSaveState = getTipSaveState(match.id);
              const deadlinePasssed = isDeadlinePassed(match.match_date);
              const savedInline = Boolean(nextTipSavedByMatch[match.id]);
              const homeTeamDisplay = getTeamDisplay(match.home_team);
              const awayTeamDisplay = getTeamDisplay(match.away_team);

              return (
                <div key={`next-${match.id}`} className={`next-match-card${liveUpdateFlashByMatch[match.id] ? ' next-match-card-updated' : ''}`}>
                  <div
                    className="next-match-teams match-info-trigger"
                    role="button"
                    tabIndex={0}
                    onClick={() => openMatchInfo(match.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openMatchInfo(match.id);
                      }
                    }}
                  >
                    <span className="next-match-team">
                      <TeamFlag teamDisplay={homeTeamDisplay} />
                      <span className="team-name">{homeTeamDisplay.label}</span>
                      {redCards.home > 0 && <span className="red-card-symbols" title={`${redCards.home} Rote Karte${redCards.home > 1 ? 'n' : ''}`}>{'🟥'.repeat(redCards.home)}</span>}
                    </span>
                    <span className="next-vs">vs</span>
                    <span className="next-match-team">
                      <TeamFlag teamDisplay={awayTeamDisplay} />
                      <span className="team-name">{awayTeamDisplay.label}</span>
                      {redCards.away > 0 && <span className="red-card-symbols" title={`${redCards.away} Rote Karte${redCards.away > 1 ? 'n' : ''}`}>{'🟥'.repeat(redCards.away)}</span>}
                    </span>
                  </div>
                  <div className="next-match-meta">
                    <span>{formatDate(match.match_date)}</span>
                    {match.round && <span>{normalizeRoundLabel(match.round)}</span>}
                    {getCountdown(match.match_date) && (
                      <span className="countdown-badge">⏱ {getCountdown(match.match_date)}</span>
                    )}
                  </div>
                  <span className={`match-status-badge ${status.className}`}>{status.label}</span>

                  {liveUpdate?.isLive && liveUpdate.homeGoals !== null && liveUpdate.awayGoals !== null && (
                    <div className={`next-live-score${isScoreFlashing ? ' score-flash' : ''}`}>{liveUpdate.homeGoals}:{liveUpdate.awayGoals}</div>
                  )}
                  {!isFinished && (
                    <div className="next-match-tip-row">
                      <div className="next-tip-grid">
                        <div className="next-tip-team-block">
                          <span className="next-tip-team-label">{homeTeamDisplay.label}</span>
                          <div className="tip-stepper">
                            <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'home_goals', -1)} disabled={deadlinePasssed} aria-label="Weniger">−</button>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={tip.home_goals}
                              onChange={(e) => handleTipChange(match.id, 'home_goals', e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inputRefs.current[`n${match.id}`]?.away?.focus(); } }}
                              disabled={deadlinePasssed}
                              ref={(el) => { if (!inputRefs.current[`n${match.id}`]) inputRefs.current[`n${match.id}`] = {}; inputRefs.current[`n${match.id}`].home = el; }}
                            />
                            <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'home_goals', 1)} disabled={deadlinePasssed} aria-label="Mehr">+</button>
                          </div>
                        </div>

                        <span className="next-tip-separator">:</span>

                        <div className="next-tip-team-block">
                          <span className="next-tip-team-label">{awayTeamDisplay.label}</span>
                          <div className="tip-stepper">
                            <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'away_goals', -1)} disabled={deadlinePasssed} aria-label="Weniger">−</button>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={tip.away_goals}
                              onChange={(e) => handleTipChange(match.id, 'away_goals', e.target.value)}
                              disabled={deadlinePasssed}
                              ref={(el) => { if (!inputRefs.current[`n${match.id}`]) inputRefs.current[`n${match.id}`] = {}; inputRefs.current[`n${match.id}`].away = el; }}
                            />
                            <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'away_goals', 1)} disabled={deadlinePasssed} aria-label="Mehr">+</button>
                          </div>
                        </div>
                      </div>

                      <div className="next-tip-actions">
                      {deadlinePasssed ? (
                        <div className="next-tip-locked">Deadline verpasst</div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`btn-primary next-tip-submit${savedInline ? ' tip-submit-saved' : ''}`}
                            onClick={() => handleSubmitTip(match.id, 'next')}
                            disabled={!tipSaveState.isDirty}
                          >
                            {tipSaveState.buttonLabel}
                          </button>
                          {savedInline && <span className="next-tip-saved">Tipp gespeichert</span>}
                        </>
                      )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bonus-card">
        <h2>⭐ Bonusfragen</h2>
        <p>
          Tipp auf Weltmeister und Vizemeister für Extrapunkte.
          {bonusDeadline && (
            <span className="bonus-deadline">
              {' '}Deadline: {formatDate(bonusDeadline)}
            </span>
          )}
        </p>
        <div className="bonus-grid">
          <div>
            <label>Weltmeister</label>
            <select
              value={bonusTip.champion_team}
              disabled={bonusLocked || savingBonus}
              onChange={(e) => setBonusTip((prev) => ({ ...prev, champion_team: e.target.value }))}
            >
              <option value="">-- wählen --</option>
              {allTeams.map((team) => (
                <option key={`champ-${team}`} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Vizemeister</label>
            <select
              value={bonusTip.runner_up_team}
              disabled={bonusLocked || savingBonus}
              onChange={(e) => setBonusTip((prev) => ({ ...prev, runner_up_team: e.target.value }))}
            >
              <option value="">-- wählen --</option>
              {allTeams.map((team) => (
                <option key={`runner-${team}`} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleBonusTipSubmit}
            disabled={bonusLocked || savingBonus}
          >
            {bonusLocked ? 'Deadline abgelaufen' : (savingBonus ? 'Speichert...' : 'Bonusfragen speichern')}
          </button>
        </div>
      </div>

      {bonusLocked && publicBonusTips.length > 0 && (
        <div className="bonus-public-panel">
          <button
            type="button"
            className="bonus-public-toggle"
            onClick={togglePublicBonusTips}
          >
            <span className="bonus-public-title">WM-Tipps aller Spieler</span>
            <span className="bonus-public-meta">
              {publicBonusTips.length} {publicBonusTips.length === 1 ? 'Tipp' : 'Tipps'} {publicBonusTipsExpanded ? 'ausblenden' : 'anzeigen'}
            </span>
          </button>

          {publicBonusTipsExpanded && (
            <div className="bonus-public-list">
              {publicBonusTips.map((tip) => (
                <div key={tip.user_id} className="bonus-public-row">
                  <span className="bonus-public-user">
                    <AvatarDisplay value={tip.avatar} />
                    <span>{tip.username}</span>
                  </span>
                  <span className="bonus-public-pair">
                    <strong>{tip.champion_team}</strong>
                    <span>•</span>
                    <strong>{tip.runner_up_team}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="round-filter">
        {['Alle', 'Offen', 'Abgeschlossen'].map((status) => (
          <button
            key={status}
            className={`round-btn${matchStatusFilter === status ? ' active' : ''}`}
            onClick={() => setMatchStatusFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      {rounds.length > 1 && (
        <div className="round-filter">
          {rounds.map(r => (
            <button
              key={r}
              className={`round-btn${activeRound === r ? ' active' : ''}`}
              onClick={() => setActiveRound(r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="matches-grid">
        {visibleMatches.map(match => {
          const liveUpdate = liveUpdatesByMatch[match.id];
          const effectiveFinished = Boolean(match.finished || liveUpdate?.isFinished);
          const effectiveHomeGoals = liveUpdate?.homeGoals ?? match.home_goals;
          const effectiveAwayGoals = liveUpdate?.awayGoals ?? match.away_goals;
          const isScoreFlashing = Boolean(scoreFlashByMatch[match.id]);
          const redCards = getRedCardCounts(liveUpdate);
          const tip = tips[match.id] || { home_goals: 0, away_goals: 0 };
          const tipSaveState = getTipSaveState(match.id);
          const deadlinePasssed = isDeadlinePassed(match.match_date);
          const status = getMatchStatus(match, liveUpdate);
          const homeTeamDisplay = getTeamDisplay(match.home_team);
          const awayTeamDisplay = getTeamDisplay(match.away_team);
          const visibleTips = (visibleTipsByMatch[match.id] || []).slice().sort((firstTip, secondTip) => {
            if (firstTip.user_id === user.id && secondTip.user_id !== user.id) {
              return -1;
            }

            if (firstTip.user_id !== user.id && secondTip.user_id === user.id) {
              return 1;
            }

            return firstTip.username.localeCompare(secondTip.username, 'de');
          });
          const isTipsExpanded = Boolean(expandedTipsMatches[match.id]);
          const countdown = getCountdown(match.match_date);
          const savedInline = Boolean(nextTipSavedByMatch[match.id]);

          return (
            <div key={match.id} className={`match-card${liveUpdate?.isLive ? ' match-card-live' : ''}${liveUpdateFlashByMatch[match.id] ? ' match-card-updated' : ''}${effectiveFinished ? ' match-card-finished' : deadlinePasssed ? ' match-card-locked' : ''}`} style={getMatchThemeStyle(match.home_team, match.away_team)}>
              <div className="match-topline">
                <div className="match-date">
                  {formatDate(match.match_date)}{match.round ? ` · ${match.round}` : ''}
                  {countdown && <span className="countdown-badge">⏱ {countdown}</span>}
                </div>
                <span className={`match-status-badge ${status.className}`}>{status.label}</span>
              </div>
              
              <div
                className="match-teams match-info-trigger"
                role="button"
                tabIndex={0}
                onClick={() => openMatchInfo(match.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMatchInfo(match.id);
                  }
                }}
              >
                <div className="team">
                  <TeamFlag teamDisplay={homeTeamDisplay} />
                  <span className="team-name">{homeTeamDisplay.label}</span>
                  {redCards.home > 0 && <span className="red-card-symbols" title={`${redCards.home} Rote Karte${redCards.home > 1 ? 'n' : ''}`}>{'🟥'.repeat(redCards.home)}</span>}
                </div>
                <div className="score">
                  {effectiveFinished || liveUpdate?.isLive ? (
                    <div className={`final-score${isScoreFlashing ? ' score-flash' : ''}`}>
                      <span>{effectiveHomeGoals}</span>
                      <span>:</span>
                      <span>{effectiveAwayGoals}</span>
                    </div>
                  ) : (
                    <div>vs</div>
                  )}
                </div>
                <div className="team">
                  <TeamFlag teamDisplay={awayTeamDisplay} />
                  <span className="team-name">{awayTeamDisplay.label}</span>
                  {redCards.away > 0 && <span className="red-card-symbols" title={`${redCards.away} Rote Karte${redCards.away > 1 ? 'n' : ''}`}>{'🟥'.repeat(redCards.away)}</span>}
                </div>
              </div>

              {!effectiveFinished && (
                <>
                  <div className="tip-inputs">
                    <div className="tip-stepper">
                      <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'home_goals', -1)} disabled={deadlinePasssed} aria-label="Weniger">−</button>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={tip.home_goals}
                        onChange={(e) => handleTipChange(match.id, 'home_goals', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inputRefs.current[match.id]?.away?.focus(); } }}
                        disabled={deadlinePasssed}
                        ref={(el) => { if (!inputRefs.current[match.id]) inputRefs.current[match.id] = {}; inputRefs.current[match.id].home = el; }}
                      />
                      <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'home_goals', 1)} disabled={deadlinePasssed} aria-label="Mehr">+</button>
                    </div>
                    <span className="tip-colon">:</span>
                    <div className="tip-stepper">
                      <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'away_goals', -1)} disabled={deadlinePasssed} aria-label="Weniger">−</button>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={tip.away_goals}
                        onChange={(e) => handleTipChange(match.id, 'away_goals', e.target.value)}
                        disabled={deadlinePasssed}
                        ref={(el) => { if (!inputRefs.current[match.id]) inputRefs.current[match.id] = {}; inputRefs.current[match.id].away = el; }}
                      />
                      <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'away_goals', 1)} disabled={deadlinePasssed} aria-label="Mehr">+</button>
                    </div>
                  </div>

                  {deadlinePasssed ? (
                    <div className="deadline-passed">Deadline verpasst</div>
                  ) : (
                    <div className="tip-submit-wrap">
                      <button
                        className={`btn-primary${savedInline ? ' tip-submit-saved' : ''}`}
                        onClick={() => handleSubmitTip(match.id)}
                        disabled={!tipSaveState.isDirty}
                      >
                        {tipSaveState.buttonLabel}
                      </button>
                      {savedInline && <span className="tip-saved-chip">✓ Gespeichert</span>}
                    </div>
                  )}
                </>
              )}

              {effectiveFinished && tip.home_goals !== undefined && (
                <div className="submitted-tip">
                  Mein Tipp: {tip.home_goals}:{tip.away_goals}
                </div>
              )}

              {visibleTips.length > 0 && (
                <div className="visible-tips-panel">
                  <button
                    type="button"
                    className="visible-tips-toggle"
                    onClick={() => toggleVisibleTips(match.id)}
                  >
                    <span className="visible-tips-title">Tipps aller Spieler</span>
                    <span className="visible-tips-meta">
                      {visibleTips.length} {visibleTips.length === 1 ? 'Tipp' : 'Tipps'} {isTipsExpanded ? 'ausblenden' : 'anzeigen'}
                    </span>
                  </button>
                  {isTipsExpanded && (
                    <div className="visible-tips-list">
                      {visibleTips.map((visibleTip) => (
                        <div
                          key={`${match.id}-${visibleTip.user_id}`}
                          className={`visible-tip-row${visibleTip.user_id === user.id ? ' own-tip-row' : ''}`}
                        >
                          <span className="visible-tip-user">
                            {visibleTip.username}
                            {visibleTip.user_id === user.id && <span className="visible-tip-badge">Du</span>}
                          </span>
                          <strong className="visible-tip-score">{visibleTip.home_goals}:{visibleTip.away_goals}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </BallLoader>
  );
}

export default Dashboard;
