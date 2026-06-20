/**
 * BiometricSettings — forwards to the full BiometricAuth screen.
 */
import React from "react";
import { BiometricAuth } from "../security/BiometricAuth";

export function BiometricSettings({ navigation }: any) {
  return <BiometricAuth navigation={navigation} />;
}
