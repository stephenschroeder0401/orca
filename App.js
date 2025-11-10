import './global.css';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import 'react-native-gesture-handler';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import TimeHistoryScreen from './screens/TimeHistoryScreen';
import { supabase } from './lib/supabase';

const Drawer = createDrawerNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
        } else {
          setUser(session.user);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking user:', error);
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

  return (
    <NavigationContainer>
      <Drawer.Navigator
        initialRouteName="Timer"
        screenOptions={{
          headerShown: false,
          drawerPosition: 'right',
          drawerType: 'front',
          swipeEdgeWidth: 50,
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
        <Drawer.Screen
          name="History"
          component={TimeHistoryScreen}
          options={{ swipeEnabled: true }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
});
