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
  const [showdown, setShowdown] = useState(null);
  const [loadingShowdown, setLoadingShowdown] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const existingChoice = useMemo(() => {
    if (!showdown?.showdownId) return null;
    return votes[showdown.showdownId] || null;
  }, [showdown, votes]);

  async function refreshShowdown() {
    setLoadingShowdown(true);
    setError('');
    try {
      const data = await apiGet('/api/current-showdown');
      setShowdown(data);
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
    if (!profile?.userId || !showdown?.showdownId) return;
    setSubmitting(true);
    setError('');
    try {
      await apiPost('/api/vote', {
        userId: profile.userId,
        showdownId: showdown.showdownId,
        choice,
      });
      const nextVotes = { ...votes, [showdown.showdownId]: choice };
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
          ) : showdown?.showdownId ? (
            <>
              <div className="matchup">
                <div className="side red">
                  <div className="sideLabel">RED</div>
                  <div className="name">{showdown.red}</div>
                </div>
                <div className="vs">vs</div>
                <div className="side blue">
                  <div className="sideLabel">BLUE</div>
                  <div className="name">{showdown.blue}</div>
                </div>
              </div>

              {showdown.status !== 'OPEN' ? (
                <div className="status">Voting closed</div>
              ) : existingChoice ? (
                <div className="status">
                  Vote recorded: <strong>{existingChoice}</strong>
                </div>
              ) : (
                <div className="status muted">Tap to vote</div>
              )}

              <div className="buttons">
                <button
                  className="vote redBtn"
                  type="button"
                  onClick={() => castVote('RED')}
                  disabled={submitting || showdown.status !== 'OPEN'}
                >
                  Vote Red
                </button>
                <button
                  className="vote blueBtn"
                  type="button"
                  onClick={() => castVote('BLUE')}
                  disabled={submitting || showdown.status !== 'OPEN'}
                >
                  Vote Blue
                </button>
              </div>

              {existingChoice && showdown.status === 'OPEN' ? (
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
