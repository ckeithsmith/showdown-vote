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
  const contestStatus = currentState?.contestStatus || contest?.status || null;
  const activeShowdown = currentState?.activeShowdown || null;

  const existingChoice = useMemo(() => {
    if (!activeShowdown?.id) return null;
    return votes[activeShowdown.id] || null;
  }, [activeShowdown, votes]);


  async function refreshShowdown() {
    setLoadingShowdown(true);
    setError('');
    try {
      const data = await apiGet('/api/public/state');
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
    if (!profile?.userId || !activeShowdown?.id) return;
    if (existingChoice) return;
    setSubmitting(true);
    setError('');
    try {
      const resp = await apiPost('/api/vote', {
        userId: profile.userId,
        showdownId: activeShowdown.id,
        choice,
      });
      if (resp?.status === 'ALREADY_VOTED') {
        const existing = resp.existingChoice || choice;
        const nextVotes = { ...votes, [activeShowdown.id]: existing };
        saveJson(VOTES_KEY, nextVotes);
        setVotes(nextVotes);
      } else {
        const nextVotes = { ...votes, [activeShowdown.id]: choice };
        saveJson(VOTES_KEY, nextVotes);
        setVotes(nextVotes);
      }
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

  function coupleLabel(c) {
    const lead = c?.leadName || '—';
    const follow = c?.followName || '—';
    return `${lead} & ${follow}`;
  }

  function shouldShowWinner() {
    return contest?.resultsVisibility === 'PUBLIC';
  }

  function renderBracket() {
    const bracket = Array.isArray(currentState?.bracket) ? currentState.bracket : [];
    if (!bracket.length) return <div className="muted">Bracket not available yet.</div>;

    const byRound = new Map();
    for (const m of bracket) {
      const r = m.round || 'Round';
      if (!byRound.has(r)) byRound.set(r, []);
      byRound.get(r).push(m);
    }

    return (
      <div className="list">
        {Array.from(byRound.entries()).map(([round, matches]) => (
          <div key={round} className="roundBlock">
            <div className="roundTitle">{round}</div>
            {matches.map((m) => (
              <div key={m.id} className="row">
                <div className="rowMain">
                  <div className="rowTitle">{m.matchNumber ? `Match ${m.matchNumber}` : 'Match'}</div>
                  <div className="rowSub">
                    <span className="tag redTag">RED</span> {coupleLabel(m.red)}
                  </div>
                  <div className="rowSub">
                    <span className="tag blueTag">BLUE</span> {coupleLabel(m.blue)}
                  </div>
                </div>
                {shouldShowWinner() && m.winner ? <div className="rowRight">Winner: {m.winner}</div> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  function renderPairings() {
    const pairings = Array.isArray(currentState?.pairings) ? currentState.pairings : [];
    if (!pairings.length) return <div className="muted">Pairings not available yet.</div>;
    return (
      <div className="list">
        {pairings.map((c) => (
          <div key={c.coupleId} className="row">
            <div className="rowMain">
              <div className="rowTitle">Couple</div>
              <div className="rowSub">{coupleLabel(c)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderShowdown() {
    if (!activeShowdown) return <div className="muted">No active showdown.</div>;

    const header = (
      <div className="muted small">
        <div><strong>{contest?.name || 'Contest'}</strong></div>
        <div>
          {contest?.currentRound ? `Round: ${contest.currentRound}` : null}
          {activeShowdown?.matchNumber ? ` • Match: ${activeShowdown.matchNumber}` : null}
        </div>
      </div>
    );

    const matchup = (
      <div className="matchup">
        <div className="side red">
          <div className="sideLabel">RED</div>
          <div className="name">{coupleLabel(activeShowdown.red)}</div>
        </div>
        <div className="vs">vs</div>
        <div className="side blue">
          <div className="sideLabel">BLUE</div>
          <div className="name">{coupleLabel(activeShowdown.blue)}</div>
        </div>
      </div>
    );

    const status = activeShowdown.status || 'UNKNOWN';

    if (status === 'INTRO' || status === 'LOCKED') {
      return (
        <>
          {header}
          {matchup}
          <div className="status">Waiting — {status}</div>
        </>
      );
    }

    if (status === 'SONG_PLAYING') {
      return (
        <>
          {header}
          {matchup}
          <div className="status">DANCING</div>
        </>
      );
    }

    if (status === 'VOTING_OPEN') {
      return (
        <>
          {header}
          {matchup}
          {existingChoice ? (
            <div className="status">Vote Submitted</div>
          ) : (
            <div className="status muted">Tap to vote</div>
          )}

          <div className="buttons">
            <button
              className="vote redBtn"
              type="button"
              onClick={() => castVote('RED')}
              disabled={submitting || !!existingChoice}
            >
              Vote Red
            </button>
            <button
              className="vote blueBtn"
              type="button"
              onClick={() => castVote('BLUE')}
              disabled={submitting || !!existingChoice}
            >
              Vote Blue
            </button>
          </div>
        </>
      );
    }

    if (status === 'VOTING_CLOSED' || status === 'RESULT_COMPUTING') {
      return (
        <>
          {header}
          {matchup}
          <div className="status">Voting Closed. Counting Votes…</div>
        </>
      );
    }

    if (status === 'RESULT_READY') {
      return (
        <>
          {header}
          {matchup}
          <div className="status">Results Ready!</div>
        </>
      );
    }

    if (status === 'AUDIENCE_RESULT_REVEALED') {
      return (
        <>
          {header}
          {matchup}
          <div className="status">Audience Results</div>
          {contest?.judgingModel === 'Judges_Only' ? (
            <div className="muted">Audience results not used for this contest.</div>
          ) : activeShowdown.redAudienceVotes != null || activeShowdown.blueAudienceVotes != null ? (
            <div className="list">
              <div className="row">
                <div className="rowMain">
                  <div className="rowSub"><span className="tag redTag">RED</span> {activeShowdown.redAudienceVotes ?? 0}</div>
                  <div className="rowSub"><span className="tag blueTag">BLUE</span> {activeShowdown.blueAudienceVotes ?? 0}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted">Audience totals not available yet.</div>
          )}
        </>
      );
    }

    if (status === 'JUDGES_RESULT_REVEALED') {
      const judges = currentState?.raw?.activeShowdown?.judges;
      return (
        <>
          {header}
          {matchup}
          <div className="status">Judges Results</div>
          {Array.isArray(judges) && judges.length ? (
            <div className="list">
              {judges.map((j, idx) => (
                <div key={idx} className="row">
                  <div className="rowMain">
                    <div className="rowTitle">{j.seat ?? `Judge ${idx + 1}`}</div>
                    <div className="rowSub">{j.name ?? 'Judge'}</div>
                  </div>
                  <div className="rowRight">{j.choice ?? '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">Judge breakdown not available yet.</div>
          )}
        </>
      );
    }

    if (status === 'FINAL_RESULT_REVEALED' || status === 'ADVANCED') {
      return (
        <>
          {header}
          {matchup}
          <div className="status">SHOWDOWN WINNER</div>
          {shouldShowWinner() && activeShowdown.winner ? (
            <div className="status">Winner: <strong>{activeShowdown.winner}</strong></div>
          ) : (
            <div className="muted">Winner not available.</div>
          )}
        </>
      );
    }

    return (
      <>
        {header}
        {matchup}
        <div className="status">Status: {status}</div>
      </>
    );
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

          <h1 className="title">Audience</h1>

          {loadingShowdown ? (
            <div className="muted">Loading…</div>
          ) : !contest ? (
            <div className="muted">No active contest.</div>
          ) : contestStatus === 'SIGNUP_OPEN' ? (
            <>
              <div className="status">Sign Ups Open</div>
              <div className="muted">{contest.name}</div>
            </>
          ) : contestStatus === 'SIGNUP_LOCKED' ? (
            <>
              <div className="status">Sign Ups Closed — Ready to Pair Couples</div>
              <div className="muted">{contest.name}</div>
            </>
          ) : contestStatus === 'PAIRING_READY' ? (
            <>
              <div className="status">Pairings</div>
              {renderPairings()}
            </>
          ) : contestStatus === 'BRACKET_BUILD' || contestStatus === 'BRACKET_LOCKED' ? (
            <>
              <div className="status">Bracket</div>
              {renderBracket()}
            </>
          ) : contestStatus === 'ROUND_ACTIVE' ? (
            <>
              {activeShowdown ? renderShowdown() : renderBracket()}
            </>
          ) : contestStatus === 'ROUND_COMPLETE' ? (
            <>
              <div className="status">Round Complete</div>
              {renderBracket()}
            </>
          ) : contestStatus === 'CONTEST_COMPLETE' ? (
            <>
              <div className="status">Contest Complete</div>
              {renderBracket()}
              <button className="primary" type="button" onClick={editProfile}>
                Exit
              </button>
            </>
          ) : contestStatus === 'ABORTED' ? (
            <>
              <div className="status">Contest ended by admin</div>
              {renderBracket()}
            </>
          ) : (
            <>
              <div className="status">Status: {contestStatus || 'Unknown'}</div>
              {activeShowdown ? renderShowdown() : renderBracket()}
            </>
          )}
        </section>
      )}

      <footer className="footer">
        <div className="muted small">Tap Refresh for the latest state.</div>
      </footer>
    </div>
  );
}
