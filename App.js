import './global.css';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import 'react-native-gesture-handler';
import { PortalHost } from '@rn-primitives/portal';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import TimeHistoryScreen from './screens/TimeHistoryScreen';
import { supabase } from './lib/supabase';
import { WorkdayProvider } from './contexts/WorkdayContext';
import { ClockTimer } from './components/ClockTimer';

const Drawer = createDrawerNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employeeError, setEmployeeError] = useState(false);

  useEffect(() => {
    // Check current session
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchEmployee(session.user.id);
      } else {
        setUser(null);
        setEmployee(null);
        setEmployeeError(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function fetchEmployee(userId) {
    try {
      // Step 1: Get organization_member for this user
      const { data: orgMember, error: orgMemberError } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('id, organization_id')
        .eq('user_id', userId)
        .single();

      if (orgMemberError) {
        console.log('No organization_member found:', orgMemberError.message);
        setEmployee(null);
        setEmployeeError(true);
        return;
      }

      // Step 2: Get employee via organization_member_id
      const { data: emp, error: empError } = await supabase
        .schema('orca')
        .from('employee')
        .select('id, organization_id, organization_member_id, name, email')
        .eq('organization_member_id', orgMember.id)
        .single();

      if (empError) {
        console.log('No employee record found:', empError.message);
        setEmployee(null);
        setEmployeeError(true);
        return;
      }

      setEmployee(emp);
      setEmployeeError(false);
    } catch (error) {
      console.error('Error fetching employee:', error);
      setEmployee(null);
      setEmployeeError(true);
    }
  }

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // If we have a session, verify the user actually exists
      if (session?.user) {
        const { error } = await supabase.auth.getUser();
        if (error) {
          // User doesn't exist, clear the session
          console.log('Invalid session, signing out:', error.message);
          await supabase.auth.signOut();
          setUser(null);
          setEmployee(null);
        } else {
          setUser(session.user);
          await fetchEmployee(session.user.id);
        }
      } else {
        setUser(null);
        setEmployee(null);
      }
    } catch (error) {
      console.error('Error checking user:', error);
      setUser(null);
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // User is authenticated but no employee record found
  if (employeeError || !employee) {
    return (
      <View style={styles.errorContainer}>
        <Image
          source={require('./assets/orca-logo.png')}
          style={styles.errorLogo}
          resizeMode="contain"
        />
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No Employee Record</Text>
          <Text style={styles.errorMessage}>
            No employee record was found for your account. Please contact your organization administrator to set up your employee profile.
          </Text>
          <Text style={styles.errorEmail}>{user.email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <WorkdayProvider employeeId={employee.id}>
      <View style={styles.appContainer}>
        <NavigationContainer>
          <Drawer.Navigator
            initialRouteName="Timer"
            drawerContent={() => <TimeHistoryScreen />}
            screenOptions={{
              headerShown: false,
              drawerPosition: 'right',
              drawerType: 'slide',
              swipeEdgeWidth: 200,
              swipeMinDistance: 30,
              drawerStyle: {
                width: '100%',
              },
            }}
          >
            <Drawer.Screen
              name="Timer"
              component={HomeScreen}
              options={{ swipeEnabled: true }}
            />
          </Drawer.Navigator>
        </NavigationContainer>
        <ClockTimer />
        <PortalHost />
      </View>
    </WorkdayProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    padding: 32,
  },
  errorLogo: {
    width: 120,
    height: 44,
    marginBottom: 32,
  },
  errorCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  errorEmail: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  logoutButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
});
