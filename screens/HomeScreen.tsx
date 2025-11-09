import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';

interface Property {
  id: string;
  name: string;
}

interface BillingCategory {
  id: string;
  name: string;
}

interface TimeEntry {
  id: string;
  start_ts: string;
  end_ts: string;
  duration_minutes: number;
  property_id: string | null;
  billing_category_id: string | null;
}

export default function HomeScreen() {
  const [task, setTask] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [timeEntry, setTimeEntry] = useState<TimeEntry | null>(null);

  const slideAnim = useState(new Animated.Value(0))[0];

  // Fetch properties and billing categories on mount
  useEffect(() => {
    fetchProperties();
    fetchBillingCategories();
  }, []);

  // Timer effect
  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  async function fetchProperties() {
    try {
      // Get current user's session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get client_id from user_account
      const { data: userAccount } = await supabase
        .from('user_account')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      if (!userAccount?.client_id) return;

      // Property is linked to entity, which has client_id
      const { data, error } = await supabase
        .from('property')
        .select(`
          id,
          name,
          entity!inner(client_id)
        `)
        .eq('entity.client_id', userAccount.client_id)
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  }

  async function fetchBillingCategories() {
    try {
      // Get current user's session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get client_id from user_account
      const { data: userAccount } = await supabase
        .from('user_account')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      if (!userAccount?.client_id) return;

      const { data, error } = await supabase
        .from('billing_account')
        .select('id, name')
        .eq('client_id', userAccount.client_id)
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setBillingCategories(data || []);
    } catch (error) {
      console.error('Error fetching billing categories:', error);
    }
  }

  async function handleStart() {
    if (!task.trim()) return;

    try {
      const { data, error } = await supabase.rpc('start_clock_session', {
        p_notes: task,
        p_property_id: properties[0]?.id || null,
        p_billing_category_id: billingCategories[0]?.id || null,
      });

      if (error) throw error;

      setSessionId(data);
      setStartTime(new Date());

      // Slide in the End Session button
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } catch (error: any) {
      console.error('Error starting session:', error);
      Alert.alert('Error', error.message || 'Failed to start session');
    }
  }

  async function handleEnd() {
    if (!sessionId) return;

    try {
      const { data, error } = await supabase.rpc('stop_clock_session', {
        p_session_id: sessionId,
      });

      if (error) throw error;

      // The function now returns the time entry data
      setTimeEntry(data);
      setSessionId(null);
      setStartTime(null);
      setElapsedSeconds(0);
      setTask('');

      // Slide out the End Session button
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } catch (error: any) {
      console.error('Error stopping session:', error);
      Alert.alert('Error', error.message || 'Failed to stop session');
    }
  }

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  const endButtonTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  const endButtonOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="auto" />

      {/* Logo in top left */}
      <Image
        source={require('../assets/orca-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.title}>
            {sessionId ? 'Working on...' : 'What are you working on?'}
          </Text>

          {/* Timer */}
          {sessionId && startTime && (
            <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>
          )}

          {/* Text Input */}
          <TextInput
            style={styles.input}
            placeholder="Enter task description"
            placeholderTextColor="#999"
            value={task}
            onChangeText={setTask}
            editable={!sessionId}
            multiline
            numberOfLines={3}
          />

          {/* Start Button */}
          {!sessionId && (
            <TouchableOpacity
              style={[styles.button, !task.trim() && styles.buttonDisabled]}
              onPress={handleStart}
              disabled={!task.trim()}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Start</Text>
            </TouchableOpacity>
          )}

          {/* End Session Button (slides in) */}
          {sessionId && (
            <Animated.View
              style={[
                styles.endButtonContainer,
                {
                  transform: [{ translateY: endButtonTranslateY }],
                  opacity: endButtonOpacity,
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.button, styles.endButton]}
                onPress={handleEnd}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>End Session</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Time Entry Row */}
          {timeEntry && (
            <View style={styles.timeEntryRow}>
              <Text style={styles.timeEntryTitle}>Last Session</Text>
              <Text style={styles.timeEntryDuration}>
                {timeEntry.duration_minutes} minutes
              </Text>
              <Text style={styles.timeEntryLabel}>Property</Text>
              <Text style={styles.timeEntryValue}>
                {properties.find(p => p.id === timeEntry.property_id)?.name || 'None'}
              </Text>
              <Text style={styles.timeEntryLabel}>Billing Category</Text>
              <Text style={styles.timeEntryValue}>
                {billingCategories.find(b => b.id === timeEntry.billing_category_id)?.name || 'None'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  logo: {
    width: 120,
    height: 44,
    position: 'absolute',
    top: 50,
    left: -10,
    opacity: 1,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  timer: {
    fontSize: 48,
    fontWeight: '700',
    color: '#0a0a0a',
    marginBottom: 32,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  input: {
    width: '100%',
    maxWidth: 400,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 20,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0a0a0a',
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  endButtonContainer: {
    width: '100%',
    maxWidth: 400,
  },
  endButton: {
    borderColor: '#dc2626',
  },
  timeEntryRow: {
    width: '100%',
    maxWidth: 400,
    marginTop: 32,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  timeEntryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 12,
  },
  timeEntryDuration: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  timeEntryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    marginTop: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeEntryValue: {
    fontSize: 15,
    color: '#0a0a0a',
  },
});
