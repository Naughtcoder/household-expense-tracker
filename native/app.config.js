// app.json is the real app. With EXPO_PUBLIC_VARIANT=demo the same code
// builds the demo app: its own name and app ids (so both can sit on one
// phone), its own widget group, and made-up data (src/lib/demo).
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_VARIANT !== 'demo') return config
  // The demo's icon is the same coin with a D in the middle of the knot.
  const plugins = config.plugins.map(p =>
    Array.isArray(p) && p[0] === 'expo-widgets'
      ? [p[0], { ...p[1], groupIdentifier: 'group.com.example.expensetracker.demo', widgets: p[1].widgets.map(w => ({ ...w, description: 'A made-up household\'s spend' })) }]
      : Array.isArray(p) && p[0] === 'expo-splash-screen'
        ? [p[0], { ...p[1], image: './assets/images/demo-splash-emblem.png' }]
        : p)
  return {
    ...config,
    name: 'Expense Tracker Demo',
    icon: './assets/images/demo-app-icon.png',
    scheme: 'household-demo',
    ios: { ...config.ios, icon: './assets/images/demo-app-icon.png', bundleIdentifier: 'com.example.expensetracker.demo', buildNumber: process.env.DEMO_BUILD ?? '1' },
    android: { ...config.android, adaptiveIcon: { ...config.android.adaptiveIcon, foregroundImage: './assets/images/demo-app-icon-adaptive.png' }, package: 'com.example.expensetracker.demo', versionCode: Number(process.env.DEMO_BUILD ?? 1) },
    plugins,
    // The real app's over-the-air updates are its bundle, so the demo must never fetch them.
    updates: { ...config.updates, enabled: false },
    extra: { ...config.extra, variant: 'demo' },
  }
}
