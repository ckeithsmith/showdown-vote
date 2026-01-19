import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from './api.js';

const PROFILE_KEY = ['showdown', 'vote', 'profile', 'v1'].join('_');
const VOTES_KEY = ['showdown', 'vote', 'votes', 'v1'].join('_');

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function App() {
  const [profile, setProfile] = useState(() => loadJson(PROFILE_KEY));
  const [votes, setVotes] = useState(() => loadJson(VOTES_KEY) || {});
  const [currentState, setCurrentState] = useState(null);
  const [loadingShowdown, setLoadingShowdown] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const contest = currentState?.contest || null;
  const showdown = currentState?.showdown || null;

  const existingChoice = useMemo(() => {
    if (!showdown?.id) return null;
    return votes[showdown.id] || null;
  }, [showdown, votes]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function parseTime(v) {
    if (!v) return null;
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const voteOpenMs = parseTime(showdown?.voteOpenTime);
  const voteCloseMs = parseTime(showdown?.voteCloseTime);
  const inWindow =
    (voteOpenMs === null || nowMs >= voteOpenMs) &&
    (voteCloseMs === null || nowMs <= voteCloseMs);
  const statusAllows = showdown?.status === 'VOTING_OPEN';
  const votingOpen = Boolean(showdown?.id && statusAllows && inWindow);

  function fmtCountdown(msLeft) {
    const s = Math.max(0, Math.floor(msLeft / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  async function refreshShowdown() {
    setLoadingShowdown(true);
    setError('');
    try {
      const data = await apiGet('/api/current-state');
      setCurrentState(data);
    } catch {
      setError('Could not load matchup. Please try again.');
    } finally {
      setLoadingShowdown(false);
    }
  }

  useEffect(() => {
    refreshShowdown();
  }, []);

  async function onRegister(e) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '').trim();
    if (!name || !email) {
      setError('Please enter your name and email.');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await apiPost('/api/register', { name, email });
      const next = { userId: resp.userId, name, email };
      saveJson(PROFILE_KEY, next);
      setProfile(next);
    } catch {
      setError('Could not register. Please check your email and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function castVote(choice) {
    if (!profile?.userId || !showdown?.id) return;
    setSubmitting(true);
    setError('');
    try {
      await apiPost('/api/vote', {
        userId: profile.userId,
        showdownId: showdown.id,
        choice,
      });
      const nextVotes = { ...votes, [showdown.id]: choice };
      saveJson(VOTES_KEY, nextVotes);
      setVotes(nextVotes);
    } catch (e) {
      const apiErr = e?.body?.error;
      if (apiErr === 'VOTING_CLOSED') setError('Voting is closed for this matchup.');
      else setError('Could not submit vote. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function editProfile() {
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
  }

  function clearVotes() {
    localStorage.removeItem(VOTES_KEY);
    setVotes({});
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">Showdown Vote</div>
        <button className="link" type="button" onClick={refreshShowdown} disabled={loadingShowdown}>
          Refresh
        </button>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {!profile ? (
        <section className="card">
          <h1 className="title">Enter your info</h1>
          <form onSubmit={onRegister} className="form">
            <label className="label">
              Display Name
              <input name="name" className="input" autoComplete="name" inputMode="text" required />
            </label>
            <label className="label">
              Email
              <input name="email" className="input" autoComplete="email" inputMode="email" required />
            </label>
            <button className="primary" type="submit" disabled={submitting}>
              Continue
            </button>
          </form>
        </section>
      ) : (
        <section className="card">
          <div className="meta">
            <div>
              Voting as <strong>{profile.name}</strong>
            </div>
            <div className="metaActions">
              <button className="link" type="button" onClick={editProfile}>
                Edit profile
              </button>
              <button className="link" type="button" onClick={clearVotes}>
                Clear saved votes
              </button>
            </div>
          </div>

          <h1 className="title">Current matchup</h1>

          {loadingShowdown ? (
            <div className="muted">Loading…</div>
          ) : showdown?.id ? (
            <>
              <div className="muted small">
                <div><strong>{contest?.name || 'Contest'}</strong></div>
                <div>
                  {contest?.currentRound ? `Round: ${contest.currentRound}` : null}
                  {showdown?.matchNumber ? ` • Match: ${showdown.matchNumber}` : null}
                </div>
              </div>

              <div className="matchup">
                <div className="side red">
                  <div className="sideLabel">RED</div>
                  <div className="name">
                    {showdown.red?.leadName || '—'} &amp; {showdown.red?.followName || '—'}
                  </div>
                </div>
                <div className="vs">vs</div>
                <div className="side blue">
                  <div className="sideLabel">BLUE</div>
                  <div className="name">
                    {showdown.blue?.leadName || '—'} &amp; {showdown.blue?.followName || '—'}
                  </div>
                </div>
              </div>

              {!votingOpen ? (
                <div className="status">Voting closed</div>
              ) : existingChoice ? (
                <div className="status">
                  Vote recorded: <strong>{existingChoice}</strong>
                </div>
              ) : (
                <div className="status muted">Tap to vote</div>
              )}

              {votingOpen && voteCloseMs ? (
                <div className="muted small">Closes in {fmtCountdown(voteCloseMs - nowMs)}</div>
              ) : null}

              {contest?.resultsVisibility === 'PUBLIC' && showdown?.winner ? (
                <div className="status">
                  Winner: <strong>{showdown.winner}</strong>
                </div>
              ) : null}

              <div className="buttons">
                <button
                  className="vote redBtn"
                  type="button"
                  onClick={() => castVote('RED')}
                  disabled={submitting || !votingOpen}
                >
                  Vote Red
                </button>
                <button
                  className="vote blueBtn"
                  type="button"
                  onClick={() => castVote('BLUE')}
                  disabled={submitting || !votingOpen}
                >
                  Vote Blue
                </button>
              </div>

              {existingChoice && votingOpen ? (
                <div className="muted small">You can change your vote by tapping the other button.</div>
              ) : null}
            </>
          ) : (
            <div className="muted">No active matchup yet.</div>
          )}
        </section>
      )}

      <footer className="footer">
        <div className="muted small">If the matchup changes, tap Refresh.</div>
      </footer>
    </div>
  );
}
