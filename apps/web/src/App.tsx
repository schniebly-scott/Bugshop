import { HomePage } from './components/HomePage';
import { HotseatPage } from './components/HotseatPage';
import { OnlineGamePage } from './components/OnlineGamePage';
import { linkTo, parseRoute, usePath } from './router';

export function App() {
  const route = parseRoute(usePath());

  return (
    <>
      <header className="site-header">
        <h1>
          <a href="/" onClick={linkTo('/')}>
            <span className="logo" aria-hidden="true" />
            Bugshop
          </a>
        </h1>
        <p className="tagline">
          {route.page === 'hotseat' ? 'Hotseat: two players, one device' : route.page === 'game' ? 'Online game' : 'A forest chess variant'}
        </p>
      </header>
      {route.page === 'home' && <HomePage />}
      {route.page === 'hotseat' && <HotseatPage />}
      {route.page === 'game' && <OnlineGamePage key={route.roomId} roomId={route.roomId} />}
      {route.page === 'not-found' && (
        <main className="notice">
          <p>Page not found.</p>
          <a href="/" onClick={linkTo('/')}>Back to start</a>
        </main>
      )}
      <footer className="site-footer">
        Your opponent's time is your money. 1 seed per minute they think. Buy pieces at the stump market and drop them in.
      </footer>
    </>
  );
}
