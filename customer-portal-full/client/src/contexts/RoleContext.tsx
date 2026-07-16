import React, { createContext, useContext, useState, ReactNode } from "react";

export type UserRole = "admin" | "user" | "agent" | "underwriter";

export interface RolePermissions {
  canViewDashboard: boolean;
  canViewPolicies: boolean;
  canViewClaims: boolean;
  canViewPayments: boolean;
  canViewProfile: boolean;
  canViewReferrals: boolean;
  canViewReviews: boolean;
  canViewKYC: boolean;
  canViewBlockchain: boolean;
  canViewFraudAlerts: boolean;
  canViewAnalytics: boolean;
  canViewCommunication: boolean;
  canViewUserManagement: boolean;
  canViewSystemSettings: boolean;
  canViewCustomers: boolean;
  canViewCommission: boolean;
  canViewRiskAssessment: boolean;
  canViewPolicyApproval: boolean;
  canViewAuditLogs: boolean;
}

const rolePermissions: Record<UserRole, RolePermissions> = {
  admin: {
    canViewDashboard: true,
    canViewPolicies: true,
    canViewClaims: true,
    canViewPayments: true,
    canViewProfile: true,
    canViewReferrals: true,
    canViewReviews: true,
    canViewKYC: true,
    canViewBlockchain: true,
    canViewFraudAlerts: true,
    canViewAnalytics: true,
    canViewCommunication: true,
    canViewUserManagement: true,
    canViewSystemSettings: true,
    canViewCustomers: true,
    canViewCommission: true,
    canViewRiskAssessment: true,
    canViewPolicyApproval: true,
    canViewAuditLogs: true,
  },
  user: {
    canViewDashboard: true,
    canViewPolicies: true,
    canViewClaims: true,
    canViewPayments: true,
    canViewProfile: true,
    canViewReferrals: true,
    canViewReviews: true,
    canViewKYC: true,
    canViewBlockchain: true,
    canViewFraudAlerts: false,
    canViewAnalytics: false,
    canViewCommunication: true,
    canViewUserManagement: false,
    canViewSystemSettings: false,
    canViewCustomers: false,
    canViewCommission: false,
    canViewRiskAssessment: false,
    canViewPolicyApproval: false,
    canViewAuditLogs: false,
  },
  agent: {
    canViewDashboard: true,
    canViewPolicies: true,
    canViewClaims: true,
    canViewPayments: true,
    canViewProfile: true,
    canViewReferrals: true,
    canViewReviews: true,
    canViewKYC: true,
    canViewBlockchain: false,
    canViewFraudAlerts: false,
    canViewAnalytics: true,
    canViewCommunication: true,
    canViewUserManagement: false,
    canViewSystemSettings: false,
    canViewCustomers: true,
    canViewCommission: true,
    canViewRiskAssessment: false,
    canViewPolicyApproval: false,
    canViewAuditLogs: false,
  },
  underwriter: {
    canViewDashboard: true,
    canViewPolicies: true,
    canViewClaims: true,
    canViewPayments: false,
    canViewProfile: true,
    canViewReferrals: false,
    canViewReviews: true,
    canViewKYC: true,
    canViewBlockchain: true,
    canViewFraudAlerts: true,
    canViewAnalytics: true,
    canViewCommunication: false,
    canViewUserManagement: false,
    canViewSystemSettings: false,
    canViewCustomers: true,
    canViewCommission: false,
    canViewRiskAssessment: true,
    canViewPolicyApproval: true,
    canViewAuditLogs: true,
  },
};

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  permissions: RolePermissions;
  hasPermission: (permission: keyof RolePermissions) => boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("user");

  const permissions = rolePermissions[role];

  const hasPermission = (permission: keyof RolePermissions): boolean => {
    return permissions[permission];
  };

  return (
    <RoleContext.Provider value={{ role, setRole, permissions, hasPermission }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}

export { rolePermissions };
