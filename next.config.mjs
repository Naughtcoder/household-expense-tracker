/** @type {import('next').NextConfig} */
export default {
  typescript: { ignoreBuildErrors: false },
  // Pages already seen stay in the phone's memory for 30 seconds, so Back,
  // the month arrows and the person toggle do not wait for the server again.
  experimental: { staleTimes: { dynamic: 30 } },
}
