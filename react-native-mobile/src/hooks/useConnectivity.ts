import { useState, useEffect } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

export type BandwidthTier = "offline" | "2g" | "3g" | "4g" | "wifi";

interface ConnectivityState {
  isConnected: boolean;
  isInternetReachable: boolean;
  bandwidthTier: BandwidthTier;
  connectionType: string;
}

function getBandwidthTier(state: NetInfoState): BandwidthTier {
  if (!state.isConnected) return "offline";
  if (state.type === "wifi" || state.type === "ethernet") return "wifi";
  if (state.type === "cellular") {
    const gen = (state.details as { cellularGeneration?: string })?.cellularGeneration;
    if (gen === "2g") return "2g";
    if (gen === "3g") return "3g";
    return "4g";
  }
  return "3g";
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>({
    isConnected: true,
    isInternetReachable: true,
    bandwidthTier: "wifi",
    connectionType: "unknown",
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      setState({
        isConnected: netState.isConnected ?? false,
        isInternetReachable: netState.isInternetReachable ?? false,
        bandwidthTier: getBandwidthTier(netState),
        connectionType: netState.type,
      });
    });
    return () => unsubscribe();
  }, []);

  return state;
}
