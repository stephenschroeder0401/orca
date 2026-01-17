import React, { useState, useEffect, useRef } from 'react';
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
import { useWorkday } from '~/contexts/WorkdayContext';
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

interface PropertyUnit {
  id: string;
  unit_name: string;
  property_id: string;
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const {
    clockSessionId,
    isWorkdayActive,
    isClockSessionActive,
    isGpsTracking,
    startJob,
    endJob,
    endWorkday,
  } = useWorkday();

  const [task, setTask] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Option>(undefined);
  const [selectedBillingCategory, setSelectedBillingCategory] = useState<Option>(undefined);
  const [selectedUnit, setSelectedUnit] = useState<Option>(undefined);

  const slideAnim = useState(new Animated.Value(0))[0];
  const gpsPulseAnim = useRef(new Animated.Value(1)).current;

  // Fetch properties and billing categories on mount
  useEffect(() => {
    fetchProperties();
    fetchBillingCategories();
  }, []);

  // GPS pulse animation
  useEffect(() => {
    if (isGpsTracking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(gpsPulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(gpsPulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isGpsTracking, gpsPulseAnim]);

  // Fetch units when property changes
  useEffect(() => {
    async function fetchUnits() {
      if (!selectedProperty?.value) {
        setUnits([]);
        setSelectedUnit(undefined);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('property_unit')
          .select('id, unit_name, property_id')
          .eq('property_id', selectedProperty.value)
          .eq('is_deleted', false)
          .order('unit_name');

        if (error) throw error;
        setUnits(data || []);
      } catch (error) {
        console.error('Error fetching units:', error);
      }
    }

    fetchUnits();
  }, [selectedProperty?.value]);

  // Sync start time with active session
  useEffect(() => {
    if (isClockSessionActive && !startTime) {
      // If we have an active session but no local start time, set it now
      // This handles the case where app restarts mid-session
      setStartTime(new Date());
    } else if (!isClockSessionActive && startTime) {
      // Session ended, clear local state
      setStartTime(null);
      setElapsedSeconds(0);
    }
  }, [isClockSessionActive, startTime]);

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
      // Start job via context (auto-creates workday + starts GPS tracking)
      await startJob({
        notes: task,
        propertyId: selectedProperty?.value,
        billingCategoryId: selectedBillingCategory?.value,
        unitId: selectedUnit?.value,
      });

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
      Alert.alert('Error', error.message || 'Failed to start session');
    }
  }

  async function handleEnd() {
    if (!isClockSessionActive) return;

    try {
      // End job via context (keeps workday + GPS tracking active)
      await endJob();

      // Reset local state
      setStartTime(null);
      setElapsedSeconds(0);
      setTask('');
      setSelectedProperty(undefined);
      setSelectedBillingCategory(undefined);
      setSelectedUnit(undefined);
      setUnits([]);
      slideAnim.setValue(0);

      // Navigate to history
      navigation.dispatch(DrawerActions.openDrawer());
    } catch (error: any) {
      console.error('Error stopping session:', error);
      Alert.alert('Error', error.message || 'Failed to stop session');
    }
  }

  async function handleEndWorkday() {
    Alert.alert(
      'End Workday',
      'This will end your workday and stop GPS tracking. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Workday',
          style: 'destructive',
          onPress: async () => {
            try {
              await endWorkday();
              setStartTime(null);
              setElapsedSeconds(0);
              setTask('');
              setSelectedProperty(undefined);
              setSelectedBillingCategory(undefined);
              slideAnim.setValue(0);
            } catch (error: any) {
              console.error('Error ending workday:', error);
              Alert.alert('Error', error.message || 'Failed to end workday');
            }
          },
        },
      ]
    );
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

      {/* GPS Tracking Indicator */}
      {isWorkdayActive && (
        <View style={styles.gpsIndicator}>
          <Animated.View
            style={[
              styles.gpsDot,
              isGpsTracking ? styles.gpsDotActive : styles.gpsDotInactive,
              { opacity: isGpsTracking ? gpsPulseAnim : 1 },
            ]}
          />
          <Text style={styles.gpsText}>
            {isGpsTracking ? 'GPS Tracking' : 'GPS Off'}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Title */}
          {!isClockSessionActive && (
            <Text style={styles.title}>What are you working on?</Text>
          )}

          {/* Timer Section */}
          {isClockSessionActive && startTime && (
            <View style={styles.timerSection}>
              <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>

              {(selectedProperty || selectedBillingCategory || selectedUnit) && (
                <View style={styles.sessionInfo}>
                  {selectedProperty && (
                    <View style={styles.infoPill}>
                      <Text style={styles.infoPillText}>{selectedProperty.label}</Text>
                    </View>
                  )}
                  {selectedUnit && (
                    <View style={[styles.infoPill, styles.unitPill]}>
                      <Text style={styles.infoPillText}>{selectedUnit.label}</Text>
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
          {!isClockSessionActive && (
            <View style={styles.pickerContainer}>
              <Select
                value={selectedProperty}
                onValueChange={(value) => {
                  setSelectedProperty(value);
                  // Clear unit when property changes
                  setSelectedUnit(undefined);
                }}
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

          {/* Unit Dropdown - only shows when property is selected and has units */}
          {!isClockSessionActive && selectedProperty && units.length > 0 && (
            <View style={styles.pickerContainer}>
              <Select
                value={selectedUnit}
                onValueChange={setSelectedUnit}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a unit (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <NativeSelectScrollView>
                    {units.map((unit) => (
                      <SelectItem
                        key={unit.id}
                        value={unit.id}
                        label={unit.unit_name}
                      />
                    ))}
                  </NativeSelectScrollView>
                </SelectContent>
              </Select>
            </View>
          )}

          {/* Billing Category Dropdown */}
          {!isClockSessionActive && (
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
          {!isClockSessionActive && (
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
          {isClockSessionActive && (
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

          {/* End Workday Button - shows when workday is active but no job running */}
          {isWorkdayActive && !isClockSessionActive && (
            <TouchableOpacity
              style={[styles.button, styles.endWorkdayButton]}
              onPress={handleEndWorkday}
              activeOpacity={0.7}
            >
              <Text style={styles.endWorkdayButtonText}>End Workday</Text>
            </TouchableOpacity>
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
  gpsIndicator: {
    position: 'absolute',
    top: 55,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  gpsDotActive: {
    backgroundColor: '#22c55e',
  },
  gpsDotInactive: {
    backgroundColor: '#9ca3af',
  },
  gpsText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
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
  unitPill: {
    backgroundColor: '#7c9a92',
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
  endWorkdayButton: {
    marginTop: 16,
    borderColor: '#6b7280',
    backgroundColor: 'transparent',
  },
  endWorkdayButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
});
