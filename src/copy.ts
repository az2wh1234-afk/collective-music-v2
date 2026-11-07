/** Participant-facing text. Fill the [placeholders] before public use. The privacy points below describe what the app actually does (see README_V20.md). */
export const COPY = {
  title: 'Somewhere Between Us',
  lead: 'A walk with sound and light.',
  steps: ['Turn off silent mode and turn up your volume.', 'Headphones are recommended.', 'Allow location access when prompted.', 'Follow what you hear and see.', 'You can leave at any time.'],
  aboutTitle: 'Before you begin',
  about: [
    { h: 'About this project', t: 'Collective Music is an interactive art project by Minkyeong Jo, MFA Digital + Media, Rhode Island School of Design. Contact: mjo@risd.edu.' },
    { h: 'Your location', t: 'Your phone’s location is used only while the experience is running, to shape the music and light. Your approximate position is shared with participants of the other layer in this session. Only your latest position is kept on the server; it is replaced every few seconds and deleted when you press Leave or when the session ends. Your walking path is not stored. If you close the page without pressing Leave, your last position stays until the session ends.' },
    { h: 'Feedback we collect', t: 'To improve the artwork, we save anonymous events (for example “reached the destination”, with times and rounded distances) and your survey answers. No name, email or account is asked for. Please do not write personal details in free-text answers. Saved feedback is not linked to your name, so it cannot be looked up and removed individually afterwards.' },
    { h: 'The feedback survey', t: 'A short feedback survey after the experience is required to complete it. Questions marked “(optional)” can be left blank. You can leave or stop at any time without completing it; nothing is submitted unless you press Send answers.' },
  ],
  consentLabel: 'I have read the above. I agree that my location is used during the experience, that anonymous feedback is collected to improve the artwork, and that the feedback survey is required to complete the experience.',
  begin: 'Begin', waiting: 'The experience has not begun yet.', ended: 'The session has ended.', left: 'You have left the experience.',
  leave: 'Leave', surveyContinue: 'Continue to the feedback survey', surveyOffer: 'Share feedback anyway',
  surveyNote: 'The feedback survey completes the experience. You can also close this page now; nothing is submitted unless you send answers.',
  surveyFail: 'Your answers could not be sent. Please check your connection and press Send answers again.',
  notFound: 'This link is not valid.', thanks: 'Thank you for being part of this experience. If you have any additional feedback, questions, or thoughts you’d like to share, feel free to reach out at mjo@risd.edu.',
};
