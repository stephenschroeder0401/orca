import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';

// Try to import WebBrowser - may not be available in Expo Go
let WebBrowser: any = null;
try {
  WebBrowser = require('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
} catch (e) {
  // Native module not available (Expo Go)
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Handle deep link callback for OAuth
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      if (url.includes('auth/callback')) {
        try {
          const parsedUrl = new URL(url);
          const params = new URLSearchParams(parsedUrl.hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        } catch (error) {
          console.error('Error handling OAuth callback:', error);
        }
      }
    };

    // Listen for deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);

    // Safety timeout - ensure we never spin forever
    const safetyTimeout = setTimeout(() => {
      console.log('[LoginScreen] Google sign-in safety timeout triggered');
      setIsGoogleLoading(false);
    }, 60000); // 60 second max

    try {
      // In Expo Go, this creates an exp:// URL
      // In a dev build, this uses the custom scheme
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'com.shroware.orca',
        path: 'auth/callback',
      });

      console.log('OAuth redirect URI:', redirectUri);

      // Add timeout for the OAuth URL request
      const oauthPromise = supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OAuth request timed out')), 15000)
      );

      const { data, error } = await Promise.race([oauthPromise, timeoutPromise]);

      if (error) throw error;

      if (data?.url) {
        if (WebBrowser?.openAuthSessionAsync) {
          // Use WebBrowser if available (development build)
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

          console.log('[LoginScreen] WebBrowser result:', result.type);

          if (result.type === 'success' && result.url) {
            const url = new URL(result.url);
            const params = new URLSearchParams(url.hash.substring(1));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
              // Add timeout for setSession
              const setSessionPromise = supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              const sessionTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Set session timed out')), 10000)
              );
              await Promise.race([setSessionPromise, sessionTimeout]);
            }
          } else if (result.type === 'cancel' || result.type === 'dismiss') {
            console.log('[LoginScreen] User cancelled Google sign-in');
          }
        } else {
          // Fallback: open in system browser (Expo Go)
          await Linking.openURL(data.url);
        }
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      Alert.alert('Sign In Failed', error.message || 'Failed to sign in with Google');
    } finally {
      clearTimeout(safetyTimeout);
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setIsLoading(true);

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      console.log('[LoginScreen] Login safety timeout triggered');
      setIsLoading(false);
      Alert.alert('Login Failed', 'Request timed out. Please try again.');
    }, 15000);

    try {
      const loginPromise = supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Login request timed out')), 10000)
      );

      const { data, error } = await Promise.race([loginPromise, timeoutPromise]);

      if (error) throw error;

      // Auth state change will be handled automatically by useAuth hook
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', error.message || 'Invalid email or password');
    } finally {
      clearTimeout(safetyTimeout);
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="auto" />

      <View style={styles.content}>
        {/* Form */}
        <View style={styles.form}>
          {/* Logo */}
          <Image
            source={require('../assets/orca-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            style={[styles.googleButton, isGoogleLoading && styles.loginButtonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={isGoogleLoading}
            activeOpacity={0.7}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color="#4285F4" />
            ) : (
              <View style={styles.googleButtonContent}>
                <Image
                  source={{ uri: 'https://www.google.com/favicon.ico' }}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logo: {
    width: 280,
    height: 100,
    marginBottom: 30,
    alignSelf: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 16,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#000',
  },
  loginButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonDisabled: {
    opacity: 0.4,
  },
  loginButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#666',
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  googleButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '500',
  },
});
