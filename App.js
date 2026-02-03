import './global.css';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import 'react-native-gesture-handler';
import { PortalHost } from '@rn-primitives/portal';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import TimeHistoryScreen from './screens/TimeHistoryScreen';
import { supabase } from './lib/supabase';
import { EmployeeProvider } from './contexts/EmployeeContext';
import { ClockTimer } from './components/ClockTimer';

const Drawer = createDrawerNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[App] onAuthStateChange:', event, session?.user?.email);
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkUser() {
    console.log('[App] checkUser started');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[App] Got session:', session ? 'exists' : 'none');
      setUser(session?.user || null);
    } catch (error) {
      console.error('[App] Error checking user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
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

  // User is authenticated - EmployeeProvider handles employee fetching
  return (
    <EmployeeProvider userId={user.id} userEmail={user.email}>
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
    </EmployeeProvider>
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
});
