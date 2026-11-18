// Puts the payment readers into the Android app at prebuild: the SMS
// permissions, the bank text receiver, the payment screen reader and the
// payment notification reader, the screen reader's settings file, and its
// description. Android only. iOS is left untouched.
const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withStringsXml, withDangerousMod } = require('expo/config-plugins')

const PKG = 'morgan.household.readers'
const APPS = [
  'com.phonepe.app',
  'com.google.android.apps.nbu.paisa.user',
  'net.one97.paytm',
  'in.org.npci.upiapp',
  'com.sbi.lotusintouch',
  'com.sbi.upi',
]
const PERMISSIONS = ['android.permission.INTERNET', 'android.permission.RECEIVE_SMS', 'android.permission.READ_SMS', 'android.permission.POST_NOTIFICATIONS']

// No apostrophes: an unescaped one breaks the Android build.
const DESCRIPTION = 'Reads the success screen in PhonePe, Google Pay, Paytm, BHIM and YONO SBI after you pay, and records the payment in Household Expense Tracker. It sees the screens of those apps only, and keeps nothing but a finished payment.'

const SCREEN_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Only the payment apps. Android delivers nothing from any other app. -->
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/payment_screen_description"
    android:packageNames="${APPS.join(',')}"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="500"
    android:canRetrieveWindowContent="true"
    android:accessibilityFlags="flagDefault" />
`

function withManifest(config) {
  return withAndroidManifest(config, c => {
    const m = c.modResults.manifest
    m['uses-permission'] = m['uses-permission'] || []
    for (const name of PERMISSIONS) {
      if (!m['uses-permission'].some(p => p.$['android:name'] === name)) m['uses-permission'].push({ $: { 'android:name': name } })
    }
    // Android 11+: say which payment apps this app looks for.
    m.queries = m.queries || [{}]
    const q = m.queries[0]
    q.package = q.package || []
    for (const name of APPS.slice(0, 2)) {
      if (!q.package.some(p => p.$['android:name'] === name)) q.package.push({ $: { 'android:name': name } })
    }

    const app = m.application[0]
    const put = (kind, item) => {
      app[kind] = (app[kind] || []).filter(x => x.$['android:name'] !== item.$['android:name'])
      app[kind].push(item)
    }
    put('receiver', {
      $: { 'android:name': `${PKG}.SmsReceiver`, 'android:exported': 'true', 'android:permission': 'android.permission.BROADCAST_SMS' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }] }],
    })
    put('service', {
      $: {
        'android:name': `${PKG}.PaymentScreenService`, 'android:exported': 'false',
        'android:label': 'Household Expense Tracker payment reader', 'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.accessibilityservice', 'android:resource': '@xml/payment_screen' } }],
    })
    put('service', {
      $: {
        'android:name': `${PKG}.PaymentNotificationService`, 'android:exported': 'false',
        'android:label': 'Household Expense Tracker payment notifications', 'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }] }],
    })
    // "Share to Household Expense Tracker" for a payment app's history screenshot.
    put('activity', {
      $: {
        'android:name': `${PKG}.ShareShotActivity`, 'android:exported': 'true', 'android:label': 'Household Expense Tracker',
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar', 'android:excludeFromRecents': 'true', 'android:noHistory': 'true',
      },
      'intent-filter': ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE'].map(a => ({
        action: [{ $: { 'android:name': a } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'image/*' } }],
      })),
    })
    return c
  })
}

function withStrings(config) {
  return withStringsXml(config, c => {
    const res = c.modResults.resources
    res.string = (res.string || []).filter(s => s.$.name !== 'payment_screen_description')
    res.string.push({ $: { name: 'payment_screen_description' }, _: DESCRIPTION })
    return c
  })
}

function withScreenXml(config) {
  return withDangerousMod(config, ['android', c => {
    const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'payment_screen.xml'), SCREEN_XML)
    return c
  }])
}

module.exports = function withPaymentReaders(config) {
  return withScreenXml(withStrings(withManifest(config)))
}
