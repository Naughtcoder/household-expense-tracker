import { useEffect } from 'react'
import { PermissionsAndroid, Platform } from 'react-native'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { IS_DEMO } from '@/lib/variant'
import { useReviewCount } from '@/lib/data'
import { useScreenReaderOff } from '@/lib/reader-off'

/** The system tab bar: Month, Insights, Add, Review (with its count), More. */
export default function Tabs() {
  const review = useReviewCount()
  // Android: a mark on Add while the payment reader is off, where missed payments can be added from a screenshot.
  const readerOff = useScreenReaderOff()
  // Android 13+: ask once to show notifications, so the phone can ding when the payment reader goes off (ReaderAlert.java).
  useEffect(() => {
    if (Platform.OS !== 'android' || IS_DEMO || Number(Platform.Version) < 33) return
    PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never).catch(() => {})
  }, [])
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Month</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="insights">
        <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add">
        <NativeTabs.Trigger.Label>Add</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus.circle.fill" md="add_circle" />
        {readerOff ? <NativeTabs.Trigger.Badge>!</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="review">
        <NativeTabs.Trigger.Label>Review</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tray.fill" md="inbox" />
        {review.data ? <NativeTabs.Trigger.Badge>{String(review.data)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis.circle.fill" md="more_horiz" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
