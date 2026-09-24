import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { recipientFromScan, type ScannedRecipient } from '@/lib/scan'
import { Button, Eyebrow } from '@/ui'
import { color, font } from '@/theme'

/**
 * Scan the QR code of the person being paid.
 *
 * Only a code that names someone to pay is accepted: a Henad pay link, a `.nad` name or an
 * account. The first valid one closes the scanner, and who it names still shows on the amount
 * screen, with where the name came from, for the person to check before quoting.
 */
export function ScanScreen({ onScanned, onCancel }: { onScanned: (recipient: ScannedRecipient) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [rejected, setRejected] = useState<string | null>(null)
  const done = useRef(false)

  if (!permission) return <View style={s.fill} />

  if (!permission.granted) {
    return (
      <View style={s.ask}>
        <Eyebrow tone="purple">Scan to pay</Eyebrow>
        <Text style={s.title}>Henad needs the camera to read a QR code.</Text>
        <Text style={s.body}>It is used only while this screen is open. Nothing is recorded.</Text>
        <Button label={permission.canAskAgain ? 'Allow camera' : 'Camera is blocked in Settings'} variant={permission.canAskAgain ? 'primary' : 'disabled'} onPress={() => void requestPermission()} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    )
  }

  return (
    <View style={s.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return
          const recipient = recipientFromScan(data)
          if (recipient.kind === 'invalid') {
            setRejected(recipient.reason)
            return
          }
          done.current = true
          onScanned(recipient)
        }}
      />
      <View style={s.overlay} pointerEvents="box-none">
        <View style={s.frame} />
        <Text style={s.hint}>{rejected ?? 'Point at the QR code of the person you are paying'}</Text>
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={s.cancel} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.dark },
  ask: { flex: 1, gap: 14, padding: 20, paddingTop: 40 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 30, color: color.ink },
  body: { fontFamily: font.sans, fontSize: 14, lineHeight: 22, color: color.grey },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  frame: { width: 240, height: 240, borderRadius: 16, borderWidth: 2, borderColor: color.lavender },
  hint: { fontFamily: font.mono, fontSize: 12, color: '#FFFFFF', textAlign: 'center' },
  cancel: { alignSelf: 'stretch', position: 'absolute', left: 24, right: 24, bottom: 32 },
})
