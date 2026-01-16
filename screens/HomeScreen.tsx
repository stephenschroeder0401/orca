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
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { supabase } from '~/lib/supabase';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  NativeSelectScrollView,
  type Option,
} from '~/components/ui/select';

interface Property {
  id: string;
  name: string;
}

interface BillingCategory {
  id: string;
  name: string;
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const [task, setTask] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Option>(undefined);
  const [selectedBillingCategory, setSelectedBillingCategory] = useState<Option>(undefined);

  const slideAnim = useState(new Animated.Value(0))[0];

  // Fetch properties and billing categories on mount
  useEffect(() => {
    fetchProperties();
    fetchBillingCategories();
    testOrcaQuery();
  }, []);

  async function testOrcaQuery() {
    console.log('Testing clock_sessions query...');
    const { data, error } = await supabase
      .schema('orca')
      .from('clock_sessions')
      .select('*')
      .limit(1);

    console.log('Clock sessions query result:', { data, error });
  }

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
      console.log('Fetched properties:', data);
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
      console.log('Fetched billing categories:', data);
      setBillingCategories(data || []);
    } catch (error) {
      console.error('Error fetching billing categories:', error);
    }
  }

  async function handleStart() {
    if (!task.trim()) return;

    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('Auth user:', user);
      console.log('Auth error:', authError);
      if (!user) throw new Error('Not authenticated');

      // Get client_id from user_account
      const { data: userAccount, error: accountError } = await supabase
        .from('user_account')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      console.log('User account:', userAccount);
      console.log('Account error:', accountError);
      if (!userAccount?.client_id) throw new Error('No client associated with user');

      const { data, error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .insert({
          user_id: user.id,
          client_id: userAccount.client_id,
          notes: task,
          property_id: selectedProperty?.value || null,
          billing_category_id: selectedBillingCategory?.value || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      setSessionId(data.id);
      setStartTime(new Date());

      // Animate the End Session button sliding in
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } catch (error: any) {
      console.error('Error starting session:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      Alert.alert('Error', error.message || error.toString() || 'Failed to start session');
    }
  }

  async function handleEnd() {
    if (!sessionId) return;

    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .update({ end_time: now })
        .eq('id', sessionId);

      if (error) throw error;

      // Reset state
      setSessionId(null);
      setStartTime(null);
      setElapsedSeconds(0);
      setTask('');
      setSelectedProperty(undefined);
      setSelectedBillingCategory(undefined);
      slideAnim.setValue(0);

      // Navigate to history
      navigation.dispatch(DrawerActions.openDrawer());
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
          {!sessionId && (
            <Text style={styles.title}>What are you working on?</Text>
          )}

          {/* Timer Section */}
          {sessionId && startTime && (
            <View style={styles.timerSection}>
              <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>

              {(selectedProperty || selectedBillingCategory) && (
                <View style={styles.sessionInfo}>
                  {selectedProperty && (
                    <View style={styles.infoPill}>
                      <Text style={styles.infoPillText}>{selectedProperty.label}</Text>
                    </View>
                  )}
                  {selectedBillingCategory && (
                    <View style={[styles.infoPill, styles.categoryPill]}>
                      <Text style={styles.infoPillText}>{selectedBillingCategory.label}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Text Input - always editable */}
          <TextInput
            style={styles.input}
            placeholder="Enter task description"
            placeholderTextColor="#999"
            value={task}
            onChangeText={setTask}
            multiline
            numberOfLines={3}
          />

          {/* Property Dropdown */}
          {!sessionId && (
            <View style={styles.pickerContainer}>
              <Select
                value={selectedProperty}
                onValueChange={setSelectedProperty}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a property..." />
                </SelectTrigger>
                <SelectContent>
                  <NativeSelectScrollView>
                    {properties.map((property) => (
                      <SelectItem
                        key={property.id}
                        value={property.id}
                        label={property.name}
                      />
                    ))}
                  </NativeSelectScrollView>
                </SelectContent>
              </Select>
            </View>
          )}

          {/* Billing Category Dropdown */}
          {!sessionId && (
            <View style={styles.pickerContainer}>
              <Select
                value={selectedBillingCategory}
                onValueChange={setSelectedBillingCategory}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category..." />
                </SelectTrigger>
                <SelectContent>
                  <NativeSelectScrollView>
                    {billingCategories.map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id}
                        label={category.name}
                      />
                    ))}
                  </NativeSelectScrollView>
                </SelectContent>
              </Select>
            </View>
          )}

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
  timerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  timer: {
    fontSize: 56,
    fontWeight: '700',
    color: '#0a0a0a',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    marginBottom: 16,
  },
  sessionInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  infoPill: {
    backgroundColor: '#6b7fa3',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryPill: {
    backgroundColor: '#8b9dc3',
  },
  infoPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    marginBottom: 16,
  },
  pickerContainer: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 16,
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
});
