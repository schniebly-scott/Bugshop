/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the Bugshop game server, e.g. https://api.example.com */
  readonly VITE_SERVER_URL?: string;
  /** Public https link to the donation page. The tip jar on the home page is hidden when unset. */
  readonly VITE_DONATE_URL?: string;
}
