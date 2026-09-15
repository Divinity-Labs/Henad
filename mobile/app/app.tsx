import { Redirect } from 'expo-router'

/**
 * https://usehenad.xyz/app, the one path the app claims as a verified App Link. It exists so
 * Android verifies the domain at install; opening it just lands on the app.
 */
export default function AppLink() {
  return <Redirect href="/" />
}
