import type { ReactNode } from 'react';
import { linkTo } from '../router';

/** Public contact for privacy requests and questions. */
export const CONTACT_EMAIL = 'support@bugshopchess.com';
const LAST_UPDATED = '16 November 2026';

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
const Internal = ({ to, children }: { to: string; children: ReactNode }) => (
  <a href={to} onClick={linkTo(to)}>
    {children}
  </a>
);

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <article className="legal-paper">
        <h2>{title}</h2>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
        {children}
      </article>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Bugshop (<strong>www.bugshopchess.com</strong>) is a free, non-commercial chess variant run by an individual
        developer ("we", "us"). This policy explains what we collect when you use Bugshop, why, who else handles it, how
        long we keep it, and what you can ask us to do with it. Questions or requests: <Mail />.
      </p>

      <h3>1. What we collect</h3>
      <ul>
        <li>
          <strong>Your account:</strong> your email address; your password, stored only as a salted one-way hash that we
          cannot read; whether you have confirmed your email; and when the account was created and last changed.
        </li>
        <li>
          <strong>If you sign in with Google:</strong> Google tells us your email address, your name and a link to your
          profile picture, and gives us sign-in tokens limited to that basic profile information. We store these with your
          account. We never post anything or access anything else in your Google account.
        </li>
        <li>
          <strong>Your player profile:</strong> the player name you choose, your rating, and how many games you have
          played, won, lost and drawn.
        </li>
        <li>
          <strong>Results of online games:</strong> who played, who won and how the game ended, whether it was a public or
          private game, each player's rating before and after, and when it finished. We do not keep the moves.
        </li>
        <li>
          <strong>Sign-in sessions:</strong> when you sign in we create a session: a random code stored in a cookie on your
          device, plus the IP address and browser identification (user agent) used to sign in, and when the session
          expires. A session ends when you sign out or about a week after you last used it.
        </li>
        <li>
          <strong>Email links:</strong> confirmation and password-reset links contain a random code that we keep until it
          is used or expires.
        </li>
        <li>
          <strong>Server logs:</strong> the game server records each request (IP address, time, address requested and
          browser identification) for security and troubleshooting. Logs are rotated and overwritten as they fill, so they
          normally cover days, not months.
        </li>
        <li>
          <strong>Abuse protection:</strong> to stop floods of requests we count requests per IP address in memory. These
          counts are never written to disk and disappear within minutes.
        </li>
        <li>
          <strong>Games in progress:</strong> moves, clocks, seeds and backpacks exist only in the server's memory while a
          game is running, and are discarded when the game room closes.
        </li>
        <li>
          <strong>Website analytics:</strong> we use Vercel Web Analytics to count page views. It records the page address
          (with game codes removed before anything is sent), the referring site, your country, and your type of device,
          browser and operating system. According to Vercel, it uses no cookies and does not store IP addresses or identify
          individual visitors.
        </li>
        <li>
          <strong>Stored in your browser only:</strong> your last-used game settings (local storage) and, during an online
          game, a code that lets you rejoin your seat after a reload (session storage, cleared when you close the tab). The
          rejoin code is sent only to our game server.
        </li>
      </ul>
      <p>
        We do not show ads, use tracking cookies, sell your data, or handle payments. Donations, if offered, are handled
        entirely by the donation platform.
      </p>

      <h3>2. Who can see your data</h3>
      <ul>
        <li>
          <strong>Other players</strong> see your player name, rating and game record during games and in lobbies. They
          never see your email address.
        </li>
        <li>
          <strong>Service providers</strong> that run parts of Bugshop for us:
          <ul>
            <li>Vercel Inc. (USA): hosts the website and its domain, and provides the page analytics.</li>
            <li>RackNerd (USA, data center in Buffalo, New York): hosts the game server, the database and its backups.</li>
            <li>Resend (USA): delivers confirmation and password-reset emails, so it receives your email address and those messages.</li>
            <li>Google LLC (USA): only if you choose to sign in with Google.</li>
            <li>The donation platform: only if you choose to donate, under its own privacy policy.</li>
          </ul>
        </li>
        <li>We may disclose data if the law requires it, or to protect players and the service from abuse.</li>
      </ul>

      <h3>3. Cookies</h3>
      <p>
        Bugshop sets one cookie: the sign-in session cookie for <strong>api.bugshopchess.com</strong>. It is strictly
        necessary to keep you signed in, is sent only over HTTPS, and cannot be read by scripts on the page. We use no
        other cookies (the analytics are cookieless), which is why there is no cookie banner.
      </p>

      <h3>4. Why we use your data (legal bases)</h3>
      <ul>
        <li>To run your account and your online games, as agreed in the <Internal to="/terms">Terms of Service</Internal> (performance of a contract).</li>
        <li>To keep Bugshop secure and stop cheating and abuse: sessions, logs and request limits (legitimate interests).</li>
        <li>To understand, in aggregate and without cookies, how the site is used (legitimate interests).</li>
        <li>To send account emails you need, such as confirmations and password resets. We send no marketing email.</li>
      </ul>

      <h3>5. How long we keep it</h3>
      <ul>
        <li>Account, player profile and ratings: until you delete your account.</li>
        <li>Sessions: until you sign out or they expire. Email links: until used or expired.</li>
        <li>Server logs: rotated as they fill, normally a few days.</li>
        <li>Backups: the database is backed up daily and each backup is deleted after 14 days.</li>
        <li>
          When you delete your account, it is removed from the live database promptly and disappears from backups within
          14 days. Results of games you played stay in your opponents' histories, but are no longer linked to you.
        </li>
      </ul>

      <h3>6. Where your data is stored</h3>
      <p>
        Our servers and providers are in the United States. If you play from the EU, the UK or elsewhere, your data is
        transferred to the United States. Our providers state that they protect such transfers with safeguards such as the
        EU Standard Contractual Clauses or the EU–US Data Privacy Framework.
      </p>

      <h3>7. Security</h3>
      <p>
        All connections use HTTPS, passwords are hashed, the session cookie is protected from scripts, and the servers are
        firewalled with access limited to the operator. Bugshop is open source, so its security measures can be reviewed
        publicly. No system is perfectly secure; if you find a vulnerability, please report it privately as described in
        our security policy on GitHub.
      </p>

      <h3>8. Your rights</h3>
      <p>
        You can delete your account and its data yourself at any time on your{' '}
        <Internal to="/account">account page</Internal> ("Delete my account"). You can also ask us for a copy of your data
        (including in a portable format), to correct it, or to restrict or object to how we use it: email <Mail /> from the
        address on your account so we can confirm it's you. We answer within one month.
      </p>
      <p>
        If you are in the EU or UK, you can also complain to your local data protection authority. If you live in a US state
        with a consumer privacy law, you have similar rights; we do not sell or share personal information.
      </p>

      <h3>9. Age</h3>
      <p>
        Bugshop accounts are for people aged 16 and over. If we learn that an account belongs to someone younger, we will
        delete it.
      </p>

      <h3>10. Changes</h3>
      <p>
        If we change this policy, we'll update the date above. For significant changes we'll also post a notice on the
        site.
      </p>

      <h3>11. Contact</h3>
      <p>
        Privacy questions and requests: <Mail />.
      </p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply to the Bugshop service at <strong>www.bugshopchess.com</strong> and its game server, run by an
        individual developer ("we", "us"). By creating an account or playing, you agree to them. If you don't agree,
        please don't use Bugshop. How we handle your data is described in the{' '}
        <Internal to="/privacy">Privacy Policy</Internal>.
      </p>

      <h3>1. Who can play</h3>
      <ul>
        <li>You must be at least 16 years old to create an account.</li>
        <li>An account is for one person. Give a real email address you can access, and keep your password to yourself.</li>
        <li>You are responsible for what happens under your account. Tell us at <Mail /> if you think someone else is using it.</li>
      </ul>

      <h3>2. The service</h3>
      <p>
        Bugshop is free. We may change, add or remove features, reset or recalculate ratings, or pause or shut down the
        service at any time. Games in progress can be interrupted, for example when the server is updated. We don't
        guarantee that Bugshop will always be available, or that games, ratings or accounts will never be lost.
      </p>

      <h3>3. Fair play and conduct</h3>
      <p>When you use Bugshop, don't:</p>
      <ul>
        <li>use a chess engine, bot, script or anyone else's help to play your moves;</li>
        <li>use several accounts, or deliberately win or lose games, to manipulate ratings;</li>
        <li>exploit bugs for an advantage (please report them instead);</li>
        <li>overload, attack or probe the service, get around its limits or security, or access other people's accounts;</li>
        <li>harass, threaten or abuse other players;</li>
        <li>choose a player name that is offensive or hateful, impersonates someone, or contains someone else's personal information;</li>
        <li>use Bugshop for anything illegal.</li>
      </ul>
      <p>
        Good-faith security research is welcome when you report it privately as described in our security policy on GitHub,
        and avoid harming players or their data.
      </p>

      <h3>4. Enforcement</h3>
      <p>
        If you break these terms, we may change your player name, adjust ratings, remove game results, or suspend or delete
        your account. Where reasonable, we'll tell you why.
      </p>

      <h3>5. Your player name</h3>
      <p>
        You let us show the player name you choose to other players, for as long as your account exists.
      </p>

      <h3>6. Open source</h3>
      <p>
        Bugshop's source code is published under the GNU General Public License, version 3 or later, which governs your use
        of the code. These terms govern your use of the service we host. Some parts, such as the chessboard and piece
        artwork, are third-party works under their own licenses.
      </p>

      <h3>7. Donations</h3>
      <p>
        Donations are voluntary and don't buy anything in the game. They are processed by a third-party platform under its
        own terms.
      </p>

      <h3>8. No warranty</h3>
      <p>
        Bugshop is provided "as is" and "as available", without warranties of any kind, to the fullest extent the law
        allows.
      </p>

      <h3>9. Limitation of liability</h3>
      <p>
        To the fullest extent the law allows, we are not liable for indirect or consequential losses, or for lost games,
        ratings or data, and our total liability to you is limited to 50 US dollars. Nothing in these terms limits
        liability that cannot be limited by law, such as for intent or gross negligence, or your rights under mandatory
        consumer protection laws where you live.
      </p>

      <h3>10. Ending your account</h3>
      <p>
        You can stop using Bugshop at any time, and delete your account on your{' '}
        <Internal to="/account">account page</Internal>. We may end or suspend access to the service as described above.
      </p>

      <h3>11. Changes to these terms</h3>
      <p>
        We may update these terms and will change the date above when we do. For significant changes we'll post a notice
        on the site. If you keep playing after a change, the new terms apply.
      </p>

      <h3>12. Governing law</h3>
      <p>
        These terms are governed by the laws of the United States and of the U.S. state where the operator resides,
        without regard to conflict-of-laws rules. If you are a consumer in the EU, the UK or another country with mandatory
        consumer protection laws, you keep those protections and may bring claims in your local courts.
      </p>

      <h3>13. Contact</h3>
      <p>
        Questions about these terms: <Mail />.
      </p>
    </LegalPage>
  );
}
