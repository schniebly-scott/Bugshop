import { HotseatPage } from './components/HotseatPage';

export function App() {
  return (
    <>
      <header className="site-header">
        <h1>
          <span className="logo" aria-hidden="true" />
          Bugshop
        </h1>
        <p className="tagline">Hotseat: two players, one device</p>
      </header>
      <HotseatPage />
      <footer className="site-footer">
        Your opponent's time is your money. 1 seed per minute they think. Buy pieces at the stump market and drop them in.
      </footer>
    </>
  );
}
