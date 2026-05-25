/**
 * Fullscreen QR scanner overlay. Used to pick up wc:... pairing URIs
 * from a dapp's WalletConnect QR without manual copy-paste.
 */

import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, GhostButton } from "./Button";
import { palette, spacing, type } from "../theme";

// expo-camera ships a native module that's only present in iOS builds made
// AFTER it was added to the project. If the user's currently installed
// binary predates that, importing expo-camera at module-eval time crashes
// the bundle into a black screen. Resolve it lazily so the rest of the app
// still boots; the QR-scan button surfaces a friendly message instead.
let cameraMod: any = null;
let cameraErr: string | null = null;
try {
  cameraMod = require("expo-camera");
} catch (e) {
  cameraErr = (e as Error).message;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export function QrScanner({ visible, onClose, onScan }: Props) {
  const useCameraPermissions = cameraMod?.useCameraPermissions;
  const CameraView = cameraMod?.CameraView;
  const [permission, requestPermission] = useCameraPermissions
    ? useCameraPermissions()
    : [null, async () => {}];
  const [scanned, setScanned] = useState(false);

  // Re-arm when the modal is re-opened.
  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  if (cameraErr || !CameraView) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <View style={[styles.root, styles.center]}>
          <Text style={styles.title}>Camera module missing</Text>
          <Text style={styles.body}>
            This binary was built before expo-camera was added. Rebuild + reinstall the iOS app from Xcode and try again. For now, paste the WalletConnect URI manually.
          </Text>
          <View style={{ height: spacing.lg }} />
          <GhostButton label="Close" onPress={onClose} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission && !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.title}>Camera access</Text>
            <Text style={styles.body}>
              We need camera permission to scan WalletConnect QR codes from dapps.
            </Text>
            <View style={{ height: spacing.lg }} />
            <PrimaryButton label="Grant access" onPress={requestPermission} />
            <View style={{ height: spacing.sm }} />
            <GhostButton label="Cancel" onPress={onClose} />
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={
                scanned
                  ? undefined
                  : ({ data }) => {
                      setScanned(true);
                      onScan(data);
                    }
              }
            />
            <View style={styles.frame} pointerEvents="none">
              <View style={styles.frameSquare} />
              <Text style={styles.hint}>Point at the dapp's WalletConnect QR</Text>
            </View>
            <View style={styles.bottomBar}>
              <GhostButton label="Cancel" onPress={onClose} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  title: { ...type.h2, color: palette.textPrimary, marginBottom: spacing.md },
  body: { ...type.body, color: palette.textSecondary, textAlign: "center" },
  frame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  frameSquare: {
    width: 260,
    height: 260,
    borderColor: palette.accent,
    borderWidth: 2,
    borderRadius: 12,
  },
  hint: {
    ...type.small,
    color: palette.textPrimary,
    marginTop: spacing.lg,
    textShadowColor: "#000",
    textShadowRadius: 4,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
  },
});
