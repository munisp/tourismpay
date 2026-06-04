import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../store/authStore';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PoliciesScreen } from '../screens/PoliciesScreen';
import { PolicyDetailScreen } from '../screens/PolicyDetailScreen';
import { ClaimsScreen } from '../screens/ClaimsScreen';
import { FileClaimScreen } from '../screens/FileClaimScreen';
import { ClaimDetailScreen } from '../screens/ClaimDetailScreen';
import { PaymentsScreen } from '../screens/PaymentsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { TwoFactorScreen } from '../screens/TwoFactorScreen';
import { KYCScreen } from '../screens/KYCScreen';
import { AgentLocatorScreen } from '../screens/AgentLocatorScreen';
import { EmergencyScreen } from '../screens/EmergencyScreen';
import { InsuranceMarketplaceScreen } from '../screens/InsuranceMarketplaceScreen';
import { SecuritySettingsScreen } from '../screens/SecuritySettingsScreen';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { View } from 'react-native';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function PoliciesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PoliciesList" component={PoliciesScreen} />
      <Stack.Screen name="PolicyDetail" component={PolicyDetailScreen} />
    </Stack.Navigator>
  );
}

function ClaimsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClaimsList" component={ClaimsScreen} />
      <Stack.Screen name="FileClaim" component={FileClaimScreen} />
      <Stack.Screen name="ClaimDetail" component={ClaimDetailScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarStyle: { paddingBottom: 8, paddingTop: 4, height: 60, borderTopColor: '#e2e8f0' },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="Policies" component={PoliciesStack} options={{ tabBarLabel: 'Policies' }} />
        <Tab.Screen name="Marketplace" component={InsuranceMarketplaceScreen} options={{ tabBarLabel: 'Products' }} />
        <Tab.Screen name="Claims" component={ClaimsStack} options={{ tabBarLabel: 'Claims' }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
      </Tab.Navigator>
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="TwoFactor" component={TwoFactorScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated, kycPassed } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        kycPassed ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="AgentLocator" component={AgentLocatorScreen} />
            <Stack.Screen name="Emergency" component={EmergencyScreen} />
            <Stack.Screen name="Payments" component={PaymentsScreen} />
            <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} />
          </>
        ) : (
          <Stack.Screen name="KYC" component={KYCScreen} />
        )
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
