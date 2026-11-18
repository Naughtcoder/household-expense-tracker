import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { C } from '@/theme'

/** The same email and password as the website. */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const go = async () => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg(error.message)
  }
  const field = { backgroundColor: C.card, color: C.text, borderRadius: 14, padding: 16, fontSize: 17 } as const
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ color: C.text, fontSize: 34, fontWeight: '800', marginBottom: 12 }}>Household</Text>
      <TextInput style={field} placeholder="Email" placeholderTextColor={C.text3} autoCapitalize="none" keyboardType="email-address"
        textContentType="username" autoComplete="email" value={email} onChangeText={setEmail} />
      <TextInput style={field} placeholder="Password" placeholderTextColor={C.text3} secureTextEntry={!show}
        textContentType="password" autoComplete="password" value={password} onChangeText={setPassword} onSubmitEditing={go} />
      <Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text style={{ color: C.text2, fontWeight: '600' }}>{show ? 'Hide password' : 'Show password'}</Text>
      </Pressable>
      <Pressable onPress={go} disabled={busy || !email || !password}
        style={({ pressed }) => ({ backgroundColor: C.accent, borderRadius: 14, padding: 16, alignItems: 'center', opacity: pressed || busy ? 0.7 : 1 })}>
        <Text style={{ color: C.accentText, fontSize: 17, fontWeight: '700' }}>{busy ? 'Signing in' : 'Sign in'}</Text>
      </Pressable>
      {msg && <Text style={{ color: C.negative }}>{msg}</Text>}
      <View />
    </KeyboardAvoidingView>
  )
}
