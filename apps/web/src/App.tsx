import { Analytics } from '@vercel/analytics/react';
import { Backdrop } from './components/Backdrop';
import { EdgeBugs } from './components/EdgeBugs';
import { HomePage } from './components/HomePage';
import { HotseatPage } from './components/HotseatPage';
import { BotPage } from './components/BotPage';
import { OnlineGamePage } from './components/OnlineGamePage';
import { AccountChip, AccountGate, ResetPasswordPage } from './components/Account';
import { redactUrl } from './support';
import { linkTo, parseRoute, usePath } from './router';

export function App() {
  const route = parseRoute(usePath());

  return (
    <>
      <Backdrop />
      <header className="site-header">
        <h1>
          <a href="/" onClick={linkTo('/')}>
            <span className="logo" aria-hidden="true" />
            Bugshop
          </a>
        </h1>
        <div className="header-right">
          {route.page !== 'home' && (
            <a className="home-link" href="/" onClick={linkTo('/')}>
              ← Back to camp
            </a>
          )}
          <AccountChip />
        </div>
      </header>
      {route.page === 'home' && <HomePage />}
      {route.page === 'hotseat' && (
        <AccountGate>
          <HotseatPage />
        </AccountGate>
      )}
      {route.page === 'bot' && (
        <AccountGate reason="Sign in to play against the bots.">
          <BotPage />
        </AccountGate>
      )}
      {route.page === 'game' && (
        <AccountGate reason="Sign in to take your seat in this game.">
          <OnlineGamePage key={route.roomId} roomId={route.roomId} />
        </AccountGate>
      )}
      {route.page === 'reset-password' && <ResetPasswordPage />}
      {route.page === 'not-found' && (
        <main className="notice">
          <h2>Lost in the woods</h2>
          <p>There's nothing at this address.</p>
          <a className="button primary" href="/" onClick={linkTo('/')}>Back to camp</a>
        </main>
      )}
      <EdgeBugs />
      {/* Page-view analytics, production only (the dev build would load a debug script
          from another origin). Room ids are stripped before anything is sent. */}
      {import.meta.env.PROD && <Analytics beforeSend={event => ({ ...event, url: redactUrl(event.url) })} />}
    </>
  );
}
