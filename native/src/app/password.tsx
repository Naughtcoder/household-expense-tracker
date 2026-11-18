import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput } from 'react-native'
import { Stack } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Card, Label } from '@/components/ui'
import { C } from '@/theme'

// A function, so it reads the palette in use at render, not at import.
const input = () => ({ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, fontSize: 16 }) as const

/** A new password while signed in. The emailed reset link is single-use and
 *  mail scanners can spend it first, so this is the reliable way. It changes
 *  the person's own sign-in, so it talks to Supabase directly. */
export default function ChangePassword() {
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  // Seeing both helps when iPhone fills a suggested password into only one.
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    if (pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters.' })
    if (pw !== again) return setMsg({ ok: false, text: 'The two do not match.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ ok: false, text: error.message })
    else { setPw(''); setAgain(''); setMsg({ ok: true, text: 'Password changed. Use it next time you sign in.' }) }
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Change password' }} />
      <Card style={{ gap: 12 }}>
        <Label>Change password</Label>
        <TextInput value={pw} onChangeText={setPw} secureTextEntry={!show} textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
          placeholder="New password" placeholderTextColor={C.text3} style={input()} />
        <TextInput value={again} onChangeText={setAgain} secureTextEntry={!show} textContentType="newPassword" autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
          placeholder="The same again" placeholderTextColor={C.text3} style={input()} onSubmitEditing={save} />
        <Pressable onPress={() => setShow(s => !s)} style={{ alignSelf: 'flex-start', backgroundColor: C.raised, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 }}>
          <Text style={{ color: C.text2, fontWeight: '600' }}>{show ? 'Hide' : 'Show'} what I typed</Text>
        </Pressable>
        <Pressable onPress={save} disabled={busy || !pw || !again} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 13, alignItems: 'center', opacity: busy || !pw || !again ? 0.5 : 1 }}>
          <Text style={{ color: C.accentText, fontWeight: '700' }}>{busy ? 'Saving' : 'Save new password'}</Text>
        </Pressable>
        {msg && <Text style={{ color: msg.ok ? C.positive : C.negative }}>{msg.text}</Text>}
      </Card>
    </ScrollView>
  )
}
