/**
 * Fullscreen QR scanner overlay. Used to pick up wc:... pairing URIs
 * from a dapp's WalletConnect QR without manual copy-paste.
 */

import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { PrimaryButton, GhostButton } from "./Button";
import { palette, spacing, type } from "../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export function QrScanner({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Re-arm when the modal is re-opened.
  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

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
