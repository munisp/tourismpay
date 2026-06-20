/**
 * Deep Linking Configuration — maps URL schemes to app screens.
 * Supports both tourismpay:// and https://app.tourismpay.com links.
 */
import { LinkingOptions } from "@react-navigation/native";

export const linking: LinkingOptions<any> = {
  prefixes: ["tourismpay://", "https://app.tourismpay.com"],
  config: {
    screens: {
      // Tourist Tab
      Discover: {
        screens: {
          TouristHome: "discover",
          Portal: "portal",
          Catalog: "catalog/:experienceId?",
          OrderConfirm: "order/:orderId",
          Receipt: "receipt/:token",
          Onboarding: "onboarding",
          Itinerary: "itinerary",
          TripSummary: "trip/:shareToken",
        },
      },
      // Wallet
      Wallet: "wallet",
      // Merchant Tab
      Home: {
        screens: {
          MerchantHome: "merchant",
          Revenue: "merchant/revenue",
          QRCodes: "merchant/qr",
          Products: "merchant/products",
          Bookings: "merchant/bookings",
          Cashier: "merchant/cashier",
          Payouts: "merchant/payouts",
          Staff: "merchant/staff",
          Availability: "merchant/availability",
          Channels: "merchant/channels",
        },
      },
      // Admin
      Admin: {
        screens: {
          AdminHome: "admin",
          KYBApps: "admin/kyb",
          Users: "admin/users",
          Audit: "admin/audit",
          BIS: "admin/bis",
          Health: "admin/health",
        },
      },
      // Payment Switch
      PaySwitch: {
        screens: {
          PSHome: "switch",
          Gateway: "switch/gateway",
          Remittance: "switch/remittance",
          Settlement: "switch/settlement",
          NOC: "switch/noc",
        },
      },
      // Channels
      Channels: {
        screens: {
          ChannelHome: "channels",
          ChannelConnect: "channels/connect/:channelId?",
          ChannelSync: "channels/sync/:channelId",
          InboundBookings: "channels/bookings",
          ProductMapping: "channels/mapping",
          RateParity: "channels/parity",
        },
      },
      // More
      More: {
        screens: {
          MoreHome: "more",
          Settings: "settings",
          Notifications: "notifications",
          Security: "security",
          Compliance: "compliance",
          Analytics: "analytics",
        },
      },
    },
  },
};
