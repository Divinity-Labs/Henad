/**
 * App entry.
 *
 * The polyfill must run before anything that reads `crypto`, which is why this file exists at
 * all rather than pointing `main` straight at `expo-router/entry`. It is a module of its own,
 * imported first, because imports run before a file's own statements (see src/polyfill.ts).
 *
 * Import order in this file is load-bearing. Do not let a formatter sort it.
 */
import './src/polyfill'

import 'expo-router/entry'

// The rate watch's background task has to be defined here, at the bundle's entry, and not
// only in the screen that uses it. When Android wakes Henad to run the task there is no UI:
// Expo Router loads route files lazily, on first render, so a definition that lives in a
// route is never evaluated and the job wakes up with no code to run. It then never finishes,
// never reschedules, and the watch goes silent after the app closes, which is exactly what
// it did.
import './src/lib/rate-watch'
