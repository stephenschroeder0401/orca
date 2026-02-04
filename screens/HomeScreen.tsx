import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Animated,
  Dimensions,
  useWindowDimensions,
  Modal,
} from 'react-native';

// Base dimensions (iPhone 11 Pro / iPhone X)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { ChevronRight, Mic, LogOut } from 'lucide-react-native';
import * as Linking from 'expo-linking';

// Speech recognition - may not be available in Expo Go
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => {};
try {
  const speechModule = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechModule.useSpeechRecognitionEvent;
} catch {
  // Native module not available (Expo Go)
}
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '~/lib/supabase';
import SwipeableTimeEntry from '~/components/SwipeableTimeEntry';
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
  name: string;
  property_id: string;
}

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  property_id: string | null;
  billing_category_id: string | null;
  unit_id: string | null;
  notes: string | null;
  status?: string;
  locked?: boolean;
  is_editable?: boolean;
}

type ViewState = 'setup' | 'active' | 'post_session' | 'clock_out_confirmation';

const MOTIVATING_MESSAGES = [
  "Solid work!",
  "Nice job!",
  "Great hustle!",
  "Crushed it!",
  "Way to get it done!",
  "Another day, another win!",
  "You're a machine!",
  "That's how it's done!",
  "Boom! Done.",
  "Keep up the great work!",
];

// Responsive scaling utilities
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const widthScale = SCREEN_WIDTH / BASE_WIDTH;
const heightScale = SCREEN_HEIGHT / BASE_HEIGHT;

// Scale based on width (for horizontal spacing, font sizes)
const scale = (size: number) => Math.round(size * widthScale);
// Scale based on height (for vertical spacing)
const verticalScale = (size: number) => Math.round(size * heightScale);
// Moderate scale - less aggressive, good for fonts
const moderateScale = (size: number, factor = 0.5) =>
  Math.round(size + (scale(size) - size) * factor);

// Check if screen is small (< 700px height, like iPhone SE or small emulators)
const isSmallScreen = SCREEN_HEIGHT < 700;

export default function HomeScreen() {
  const {
    isClockedIn,
    isClockSessionActive,
    clockSessionId,
    clockIn,
    clockOut,
    startJob,
    endJob,
  } = useWorkday();

  const [task, setTask] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [viewState, setViewState] = useState<ViewState>('setup');
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [motivatingMessage, setMotivatingMessage] = useState('');
  const [totalWorkedMinutes, setTotalWorkedMinutes] = useState(0);
  const [totalBilledMinutes, setTotalBilledMinutes] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Option>(undefined);
  const [selectedBillingCategory, setSelectedBillingCategory] = useState<Option>(undefined);
  const [selectedUnit, setSelectedUnit] = useState<Option>(undefined);
  const [isEndingJob, setIsEndingJob] = useState(false);

  // Animation for clock out confirmation
  const entriesSlideAnim = useRef(new Animated.Value(300)).current;

  // Animation for unit dropdown slide-in
  const unitSlideAnim = useRef(new Animated.Value(0)).current;
  const prevShowingUnits = useRef(false);

  // Voice recording state and animation
  const [isRecording, setIsRecording] = useState(false);
  const recordPulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const taskBeforeRecording = useRef('');
  const [isRecordButtonPressed, setIsRecordButtonPressed] = useState(false);
  const [showLocationPermissionModal, setShowLocationPermissionModal] = useState(false);

  // Title slide animation
  const titleSlideAnim = useRef(new Animated.Value(0)).current;
  const prevIsClockedIn = useRef(isClockedIn);

  // Animate title sliding when clock in state changes
  useEffect(() => {
    if (prevIsClockedIn.current !== isClockedIn) {
      // Slide in from right (positive value) when clocking in, from left (negative) when clocking out
      const direction = isClockedIn ? 1 : -1;
      titleSlideAnim.setValue(150 * direction);
      Animated.spring(titleSlideAnim, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();
      prevIsClockedIn.current = isClockedIn;
    }
  }, [isClockedIn]);

  // Animate entries sliding in when showing post session or clock out confirmation
  useEffect(() => {
    if (viewState === 'post_session' || viewState === 'clock_out_confirmation') {
      entriesSlideAnim.setValue(300);
      Animated.spring(entriesSlideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [viewState]);

  // Animate unit dropdown sliding in from right when units become available
  useEffect(() => {
    const showingUnits = !!(selectedProperty && units.length > 0);

    // Only animate when transitioning from NOT showing to showing
    if (showingUnits && !prevShowingUnits.current) {
      unitSlideAnim.setValue(100);
      Animated.spring(unitSlideAnim, {
        toValue: 0,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }

    prevShowingUnits.current = showingUnits;
  }, [selectedProperty?.value, units.length]);

  // Pulsing animation for record button
  useEffect(() => {
    if (isRecording) {
      pulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recordPulseAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(recordPulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimationRef.current.start();
    } else {
      pulseAnimationRef.current?.stop();
      recordPulseAnim.setValue(1);
    }
    return () => {
      pulseAnimationRef.current?.stop();
    };
  }, [isRecording]);

  // Speech recognition event handlers
  useSpeechRecognitionEvent('result', (event: any) => {
    // Get the transcript from the results
    const result = event.results?.[0];
    const transcript = result?.transcript;
    if (transcript) {
      const base = taskBeforeRecording.current;
      const separator = base.trim() ? ' ' : '';

      if (result.isFinal) {
        // Final result - commit it and update the base for next utterance
        const newTask = base + separator + transcript;
        setTask(newTask);
        taskBeforeRecording.current = newTask;
      } else {
        // Interim result - show it but don't commit
        setTask(base + separator + transcript);
      }
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('Speech recognition error:', event.error);
    setIsRecording(false);
  });

  async function handleRecordPress() {
    // Check if speech recognition is available
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert(
        'Development Build Required',
        'Voice recording requires a development build. Run "npx expo prebuild" then build the app to enable this feature.'
      );
      return;
    }

    if (isRecording) {
      // Stop recording
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
    } else {
      // Request permissions and start recording
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed for voice input.');
        return;
      }

      // Save current task text before starting
      taskBeforeRecording.current = task;

      // Start speech recognition with best quality settings
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true, // Show text as user speaks
        continuous: false, // Single utterance mode for cleaner results
        addsPunctuation: true, // Automatic punctuation for better readability
      });
      setIsRecording(true);
    }
  }

  // Fetch properties and billing categories on mount
  useEffect(() => {
    fetchProperties();
    fetchBillingCategories();
    fetchTodayEntries();
  }, []);

  // Sync viewState with session state (handles app restart with active session)
  useEffect(() => {
    if (isClockSessionActive) {
      setViewState('active');
    }
  }, [isClockSessionActive]);

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
          .schema('orca')
          .from('property_unit')
          .select('id, name, property_id')
          .eq('property_id', selectedProperty.value)
          .order('name');

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
      setStartTime(new Date());
    } else if (!isClockSessionActive && startTime) {
      setStartTime(null);
      setElapsedSeconds(0);
    }
  }, [isClockSessionActive, startTime]);

  // Timer effect for clock session
  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Auto-save notes when in active view (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveNotesToDatabase = useCallback(async (notes: string) => {
    if (!clockSessionId) return;

    try {
      await supabase
        .schema('orca')
        .from('clock_sessions')
        .update({ notes })
        .eq('id', clockSessionId);
    } catch (error) {
      console.error('Error auto-saving notes:', error);
    }
  }, [clockSessionId]);

  useEffect(() => {
    // Only auto-save when in active view
    if (viewState !== 'active' || !clockSessionId) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(() => {
      saveNotesToDatabase(task);
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [task, viewState, clockSessionId, saveNotesToDatabase]);

  async function fetchProperties() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgMember } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgMember?.organization_id) return;

      const { data, error } = await supabase
        .schema('orca')
        .from('property')
        .select('id, name')
        .eq('organization_id', orgMember.organization_id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  }

  async function fetchBillingCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgMember } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgMember?.organization_id) return;

      const { data, error } = await supabase
        .schema('orca')
        .from('billing_category')
        .select('id, name')
        .eq('organization_id', orgMember.organization_id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setBillingCategories(data || []);
    } catch (error) {
      console.error('Error fetching billing categories:', error);
    }
  }

  async function fetchTodayEntries(calculateTotals = false) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get start of today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Read from time_entries (source of truth post-submission)
      const { data, error } = await supabase
        .schema('orca')
        .from('time_entries')
        .select('id, start_ts, end_ts, duration_minutes, notes, status, locked, property_id, billing_category_id, unit_id')
        .eq('user_id', user.id)
        .gte('start_ts', today.toISOString())
        .order('start_ts', { ascending: false });

      if (error) throw error;

      // Map time_entries columns to TimeEntry interface
      const entries: TimeEntry[] = (data || []).map(e => ({
        id: e.id,
        start_time: e.start_ts,
        end_time: e.end_ts,
        property_id: e.property_id,
        billing_category_id: e.billing_category_id,
        unit_id: e.unit_id,
        notes: e.notes,
        status: e.status,
        locked: e.locked,
        is_editable: !e.locked && e.status !== 'invoiced',
      }));

      setTodayEntries(entries);

      // Calculate totals if requested (for clock out confirmation)
      if (calculateTotals && entries.length > 0) {
        let workedMinutes = 0;
        let billedMinutes = 0;

        entries.forEach((entry: TimeEntry) => {
          if (entry.end_time) {
            const start = new Date(entry.start_time).getTime();
            const end = new Date(entry.end_time).getTime();
            const minutes = Math.floor((end - start) / 1000 / 60);
            workedMinutes += minutes;
            // Only count as billed if it has a billing category
            if (entry.billing_category_id) {
              billedMinutes += minutes;
            }
          }
        });

        setTotalWorkedMinutes(workedMinutes);
        setTotalBilledMinutes(billedMinutes);
      }
    } catch (error) {
      console.error('Error fetching today entries:', error);
    }
  }

  function formatTimeEntry(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatDuration(startTs: string, endTs: string | null): string {
    if (!endTs) return 'In progress';
    const start = new Date(startTs).getTime();
    const end = new Date(endTs).getTime();
    const minutes = Math.floor((end - start) / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  async function handleStart() {
    // Property and category are required, notes is optional
    if (!selectedProperty?.value || !selectedBillingCategory?.value) return;

    try {
      // Start job via context (auto-clocks in if needed, then starts task)
      const result = await startJob({
        notes: task.trim() || undefined,
        propertyId: selectedProperty.value,
        billingCategoryId: selectedBillingCategory.value,
        unitId: selectedUnit?.value,
      });

      setStartTime(new Date());
      setViewState('active');

      // Show explanation modal if we just clocked in and don't have background permission
      if (result.didClockIn && !result.hasBackgroundPermission) {
        setShowLocationPermissionModal(true);
      }
    } catch (error: any) {
      console.error('Error starting session:', error);
      Alert.alert('Error', error.message || 'Failed to start session');
    }
  }

  async function handleClockIn() {
    try {
      const result = await clockIn();
      // Show explanation modal if we don't have background location permission
      if (!result.hasBackgroundPermission) {
        setShowLocationPermissionModal(true);
      }
    } catch (error: any) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', error.message || 'Failed to clock in');
    }
  }

  async function handleEnd() {
    if (!isClockSessionActive) return;

    setIsEndingJob(true);

    try {
      // End job via context (keeps workday + GPS tracking active)
      await endJob();

      // Fetch today's entries BEFORE transitioning so page is ready
      await fetchTodayEntries();

      // Reset local state
      setStartTime(null);
      setElapsedSeconds(0);
      setTask('');
      setSelectedProperty(undefined);
      setSelectedBillingCategory(undefined);
      setSelectedUnit(undefined);
      setUnits([]);

      // Show post-session view with choices (data is now ready)
      setViewState('post_session');
    } catch (error: any) {
      console.error('Error stopping session:', error);
      Alert.alert('Error', error.message || 'Failed to stop session');
    } finally {
      setIsEndingJob(false);
    }
  }

  async function handleClockOut() {
    try {
      // Clock out first - this ends any active job (creating time_entry) then clocks out
      console.log('[HomeScreen] Starting clock out...');
      await clockOut();
      console.log('[HomeScreen] Clock out complete, fetching entries...');

      // Small delay to ensure database consistency
      await new Promise(resolve => setTimeout(resolve, 300));

      // Fetch today's entries (including the just-ended job)
      // Do this inline to ensure we have the data before showing the screen
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .schema('orca')
        .from('time_entries')
        .select('id, start_ts, end_ts, duration_minutes, notes, status, locked, property_id, billing_category_id, unit_id')
        .eq('user_id', user.id)
        .gte('start_ts', today.toISOString())
        .order('start_ts', { ascending: false });

      if (error) throw error;

      console.log('[HomeScreen] Fetched entries:', data?.length || 0);

      const entries: TimeEntry[] = (data || []).map(e => ({
        id: e.id,
        start_time: e.start_ts,
        end_time: e.end_ts,
        property_id: e.property_id,
        billing_category_id: e.billing_category_id,
        unit_id: e.unit_id,
        notes: e.notes,
        status: e.status,
        locked: e.locked,
        is_editable: !e.locked && e.status !== 'invoiced',
      }));

      // Calculate totals
      let workedMinutes = 0;
      let billedMinutes = 0;
      entries.forEach((entry) => {
        if (entry.end_time) {
          const start = new Date(entry.start_time).getTime();
          const end = new Date(entry.end_time).getTime();
          const minutes = Math.floor((end - start) / 1000 / 60);
          workedMinutes += minutes;
          if (entry.billing_category_id) {
            billedMinutes += minutes;
          }
        }
      });

      console.log('[HomeScreen] Totals:', { workedMinutes, billedMinutes, entryCount: entries.length });

      // Pick a random motivating message
      const randomMessage = MOTIVATING_MESSAGES[Math.floor(Math.random() * MOTIVATING_MESSAGES.length)];

      // Set all state at once
      setTodayEntries(entries);
      setTotalWorkedMinutes(workedMinutes);
      setTotalBilledMinutes(billedMinutes);
      setMotivatingMessage(randomMessage);
      setStartTime(null);
      setElapsedSeconds(0);
      setTask('');
      setSelectedProperty(undefined);
      setSelectedBillingCategory(undefined);
      setSelectedUnit(undefined);
      setUnits([]);

      // Show the clock out confirmation screen
      setViewState('clock_out_confirmation');
    } catch (error: any) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', error.message || 'Failed to clock out');
    }
  }

  function handleSubmitDay() {
    // time_entries are already created in endJob()
    // Just clear the confirmation screen and return to setup
    setViewState('setup');
    setTodayEntries([]);
    setTotalWorkedMinutes(0);
    setTotalBilledMinutes(0);
    setMotivatingMessage('');
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      // Note: App.js handles clearing state via onAuthStateChange listener
      // If sign out succeeds, the listener will set user to null and show LoginScreen
    } catch (error: any) {
      console.error('Logout error:', error);
      Alert.alert('Error', error.message || 'Failed to sign out');
    }
  }

  function handleNewTask() {
    // Return to setup view to start a new task
    setViewState('setup');
  }

  function formatMinutesToHours(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins} minutes`;
    }
    if (mins === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${hours}h ${mins}m`;
  }

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Helper to render entry cards (used in multiple views)
  function renderEntryCard(entry: TimeEntry) {
    const property = properties.find(p => p.id === entry.property_id);
    const billingCategory = billingCategories.find(b => b.id === entry.billing_category_id);
    return (
      <View key={entry.id} style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryTime}>
            {formatTimeEntry(entry.start_time)}
            {entry.end_time && ` - ${formatTimeEntry(entry.end_time)}`}
          </Text>
          <Text style={styles.entryDuration}>
            {formatDuration(entry.start_time, entry.end_time)}
          </Text>
        </View>
        {entry.notes && (
          <Text style={styles.entryNotes} numberOfLines={2}>
            {entry.notes}
          </Text>
        )}
        {(property || billingCategory) && (
          <View style={styles.entryTags}>
            {property && (
              <Text style={styles.entryTag}>{property.name}</Text>
            )}
            {billingCategory && (
              <Text style={[styles.entryTag, styles.categoryTag]}>
                {billingCategory.name}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }

  // Helper to render the task form (used in setup view)
  function renderTaskForm() {
    return (
      <>
        {/* Property & Unit Dropdowns Row */}
        <View style={styles.propertyUnitRow} key={units.length > 0 ? 'with-units' : 'no-units'}>
          <View style={
            selectedProperty && units.length > 0
              ? styles.pickerProperty
              : styles.pickerContainer
          }>
            <Select
              value={selectedProperty}
              onValueChange={(value) => {
                setSelectedProperty(value);
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

          {/* Unit Dropdown - slides in from right */}
          {selectedProperty && units.length > 0 && (
            <Animated.View
              style={[
                styles.pickerUnit,
                { transform: [{ translateX: unitSlideAnim }] }
              ]}
            >
              <Select
                value={selectedUnit}
                onValueChange={setSelectedUnit}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unit..." />
                </SelectTrigger>
                <SelectContent>
                  <NativeSelectScrollView>
                    {units.map((unit) => (
                      <SelectItem
                        key={unit.id}
                        value={unit.id}
                        label={unit.name}
                      />
                    ))}
                  </NativeSelectScrollView>
                </SelectContent>
              </Select>
            </Animated.View>
          )}
        </View>

        {/* Billing Category Dropdown */}
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

        {/* Notes Input (optional) */}
        <TextInput
          style={styles.input}
          placeholder="Notes (optional)"
          placeholderTextColor="#999"
          value={task}
          onChangeText={setTask}
          multiline
          numberOfLines={5}
        />

        {/* Voice Record Button */}
        <View style={styles.recordButtonContainer}>
          <Animated.View style={{ transform: [{ scale: recordPulseAnim }] }}>
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordButtonActive,
                isRecordButtonPressed && styles.recordButtonPressed,
              ]}
              onPressIn={() => {
                setIsRecordButtonPressed(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              onPressOut={() => setIsRecordButtonPressed(false)}
              onPress={handleRecordPress}
              activeOpacity={1}
            >
              <Mic size={isSmallScreen ? 22 : 28} color={isRecording ? '#994444' : '#b45555'} />
            </TouchableOpacity>
          </Animated.View>
          {isRecording && (
            <Text style={styles.recordingHint}>Listening... tap to stop</Text>
          )}
        </View>
      </>
    );
  }

  // ===== SETUP VIEW =====
  function renderSetupView() {
    return (
      <View style={styles.fullHeightContainer}>
        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Title */}
          <Animated.View style={{ transform: [{ translateX: titleSlideAnim }] }}>
            <Text style={[styles.title, styles.titleWithDivider]}>
              {isClockedIn ? 'Start a new job' : 'Clock in to start'}
            </Text>
          </Animated.View>
          <View style={styles.titleDivider} />

          {renderTaskForm()}
        </View>

        {/* Bottom Buttons - Pinned to Bottom */}
        <View style={styles.bottomButtonContainer}>
          {/* Start Job Button - requires property and category */}
          <TouchableOpacity
            style={[styles.button, styles.startJobButton, (!selectedProperty?.value || !selectedBillingCategory?.value) && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={!selectedProperty?.value || !selectedBillingCategory?.value}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Start Job</Text>
          </TouchableOpacity>

          <View style={styles.bottomDivider} />

          {!isClockedIn ? (
            <TouchableOpacity
              style={styles.clockInButton}
              onPress={handleClockIn}
              activeOpacity={0.7}
            >
              <Text style={styles.clockInButtonText}>Clock In</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.clockOutButton}
              onPress={handleClockOut}
              activeOpacity={0.7}
            >
              <Text style={styles.clockOutButtonText}>Clock Out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ===== ACTIVE VIEW =====
  function renderActiveView() {
    return (
      <View style={styles.fullHeightContainer}>
        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Timer Section */}
          <View style={styles.timerSection}>
            <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>

            {/* Property/Unit/Category Pills */}
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

          {/* Always-editable notes field */}
          <TextInput
            style={styles.activeNotesInput}
            placeholder="Add notes..."
            placeholderTextColor="#999"
            value={task}
            onChangeText={setTask}
            multiline
            numberOfLines={3}
          />

          {/* Voice Record Button */}
          <View style={styles.recordButtonContainer}>
            <Animated.View style={{ transform: [{ scale: recordPulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                  isRecordButtonPressed && styles.recordButtonPressed,
                ]}
                onPressIn={() => {
                  setIsRecordButtonPressed(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                onPressOut={() => setIsRecordButtonPressed(false)}
                onPress={handleRecordPress}
                activeOpacity={1}
              >
                <Mic size={isSmallScreen ? 22 : 28} color={isRecording ? '#994444' : '#b45555'} />
              </TouchableOpacity>
            </Animated.View>
            {isRecording && (
              <Text style={styles.recordingHint}>Listening... tap to stop</Text>
            )}
          </View>
        </View>

        {/* Bottom Buttons - Pinned to Bottom */}
        <View style={styles.bottomButtonContainer}>
          {/* End Job Button */}
          <TouchableOpacity
            style={[styles.button, styles.endButton, styles.endJobButton, isEndingJob && styles.buttonDisabled]}
            onPress={handleEnd}
            activeOpacity={0.7}
            disabled={isEndingJob}
          >
            {isEndingJob ? (
              <ActivityIndicator size="small" color="#0a0a0a" />
            ) : (
              <Text style={styles.buttonText}>End Job</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomDivider} />

          <TouchableOpacity
            style={styles.clockOutButton}
            onPress={handleClockOut}
            activeOpacity={0.7}
          >
            <Text style={styles.clockOutButtonText}>Clock Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===== POST SESSION VIEW =====
  function renderPostSessionView() {
    return (
      <View style={styles.fullHeightContainer}>
        {/* Main Content */}
        <View style={styles.postSessionMainContent}>
          {/* Title */}
          <Text style={[styles.title, styles.titleSpaced]}>What's next?</Text>

          {/* Today's Time Entries Preview */}
          {todayEntries.length > 0 && (
            <Animated.View
              style={[
                styles.todayEntriesContainerFlex,
                { transform: [{ translateY: entriesSlideAnim }] }
              ]}
            >
              <Text style={styles.todayEntriesTitle}>Today</Text>
              <View style={styles.todayEntriesBox}>
                <ScrollView
                  style={styles.todayEntriesList}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {todayEntries.map(renderEntryCard)}
                </ScrollView>
              </View>
            </Animated.View>
          )}
        </View>

        {/* Bottom Buttons Section */}
        <View style={styles.bottomButtonContainer}>
          {/* Divider */}
          <View style={styles.bottomDivider} />

          {/* New Task Button */}
          <TouchableOpacity
            style={styles.choiceButton}
            onPress={handleNewTask}
            activeOpacity={0.7}
          >
            <Text style={styles.choiceButtonText}>New Task</Text>
          </TouchableOpacity>

          {/* Clock Out Button */}
          <TouchableOpacity
            style={[styles.clockOutButton, styles.clockOutButtonSpaced]}
            onPress={handleClockOut}
            activeOpacity={0.7}
          >
            <Text style={styles.clockOutButtonText}>Clock Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===== CLOCK OUT CONFIRMATION VIEW =====
  function renderClockOutConfirmationView() {
    return (
      <View style={styles.clockOutConfirmationContainer}>
        {/* Motivating Message */}
        <Text style={styles.motivatingMessage}>{motivatingMessage}</Text>

        {/* Work Summary */}
        <View style={styles.workSummary}>
          <Text style={styles.summaryText}>
            You worked for <Text style={styles.summaryHighlight}>{formatMinutesToHours(totalWorkedMinutes)}</Text> today
          </Text>
          <Text style={styles.summaryText}>
            and billed <Text style={styles.summaryHighlight}>{formatMinutesToHours(totalBilledMinutes)}</Text>
          </Text>
        </View>

        {/* Does this look right? */}
        <Text style={styles.confirmationPrompt}>Does this look right?</Text>
        <Text style={styles.swipeHint}>Swipe right on an entry to edit</Text>

        {/* Today's Entries Preview */}
        <Animated.View
          style={[
            styles.confirmationEntriesContainer,
            { transform: [{ translateY: entriesSlideAnim }] }
          ]}
        >
          <View style={styles.todayEntriesBox}>
            <ScrollView style={styles.todayEntriesList} nestedScrollEnabled>
              {todayEntries.map(renderEntryCard)}
              {todayEntries.length === 0 && (
                <Text style={styles.noEntriesText}>No time entries for today</Text>
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmitDay}
          activeOpacity={0.7}
        >
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Determine which content to render based on viewState
  function renderContent() {
    switch (viewState) {
      case 'active':
        return renderActiveView();
      case 'post_session':
        return renderPostSessionView();
      case 'clock_out_confirmation':
        return renderClockOutConfirmationView();
      case 'setup':
      default:
        return renderSetupView();
    }
  }

  return (
    <View style={styles.container} onTouchStart={Keyboard.dismiss}>
      <StatusBar style="auto" />


      {/* Logo in top left */}
      <Image
        source={require('../assets/orca-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Logout button in top right */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <LogOut size={scale(20)} color="#9ca3af" />
      </TouchableOpacity>

      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Swipe indicator for time history - show on setup, active, and post_session views */}
      {viewState !== 'clock_out_confirmation' && (
        <View style={styles.swipeIndicator}>
          <Text style={styles.swipeIndicatorText}>History</Text>
          <ChevronRight size={moderateScale(isSmallScreen ? 12 : 14)} color="#c4c4c4" />
        </View>
      )}

      {/* Location Permission Explanation Modal */}
      <Modal
        visible={showLocationPermissionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationPermissionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enable Background Location</Text>
            <Text style={styles.modalText}>
              To track your route and mileage while you work, Orca needs location access set to "Always".
            </Text>
            <Text style={styles.modalTextSecondary}>
              Without this, tracking stops when your phone is locked or Orca is in the background.
            </Text>
            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => {
                setShowLocationPermissionModal(false);
                Linking.openSettings();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.modalPrimaryButtonText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => setShowLocationPermissionModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalSecondaryButtonText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  swipeIndicator: {
    position: 'absolute',
    right: scale(16),
    top: verticalScale(100),
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.6,
  },
  swipeIndicatorText: {
    fontSize: moderateScale(10),
    color: '#c4c4c4',
    fontWeight: '500',
    letterSpacing: 0.3,
    marginRight: 2,
  },
  fullHeightContainer: {
    flex: 1,
    width: '100%',
    maxWidth: scale(400),
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: isSmallScreen ? '10%' : '20%',
  },
  postSessionMainContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: verticalScale(20),
  },
  bottomButtonContainer: {
    width: '100%',
    paddingBottom: verticalScale(20),
  },
  bottomDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e5e5e5',
    marginBottom: verticalScale(16),
  },
  clockOutButtonSpaced: {
    marginTop: verticalScale(12),
  },
  logo: {
    width: scale(120),
    height: verticalScale(44),
    position: 'absolute',
    top: verticalScale(50),
    left: scale(-10),
    opacity: 1,
    zIndex: 10,
  },
  logoutButton: {
    position: 'absolute',
    top: verticalScale(56),
    right: scale(16),
    padding: scale(8),
    zIndex: 10,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: scale(isSmallScreen ? 20 : 32),
    paddingTop: verticalScale(isSmallScreen ? 80 : 100),
  },
  timerSection: {
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  timer: {
    fontSize: moderateScale(isSmallScreen ? 44 : 56),
    fontWeight: '700',
    color: '#0a0a0a',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    marginBottom: verticalScale(16),
  },
  sessionInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: scale(8),
    marginBottom: verticalScale(12),
  },
  activeNotesInput: {
    width: '100%',
    maxWidth: scale(400),
    minHeight: verticalScale(isSmallScreen ? 70 : 100),
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: scale(12),
    padding: scale(isSmallScreen ? 12 : 16),
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    color: '#0a0a0a',
    textAlignVertical: 'top',
    marginBottom: verticalScale(16),
    backgroundColor: '#fff',
  },
  infoPill: {
    backgroundColor: '#6b7fa3',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(5),
    borderRadius: scale(20),
  },
  categoryPill: {
    backgroundColor: '#8b9dc3',
  },
  unitPill: {
    backgroundColor: '#7c9a92',
  },
  infoPillText: {
    color: '#fff',
    fontSize: moderateScale(isSmallScreen ? 11 : 13),
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: moderateScale(isSmallScreen ? 20 : 24),
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: verticalScale(20),
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleSpaced: {
    marginBottom: verticalScale(24),
  },
  input: {
    width: '100%',
    maxWidth: scale(400),
    minHeight: verticalScale(isSmallScreen ? 100 : 120),
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: scale(12),
    padding: scale(isSmallScreen ? 12 : 16),
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    color: '#0a0a0a',
    textAlignVertical: 'top',
    marginBottom: verticalScale(12),
  },
  pickerContainer: {
    width: '100%',
    maxWidth: scale(400),
    marginBottom: verticalScale(12),
  },
  propertyUnitRow: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: scale(400),
    marginBottom: verticalScale(12),
    gap: scale(8),
  },
  pickerProperty: {
    flex: 2,
    minWidth: 0,
    overflow: 'hidden',
  },
  pickerUnit: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  button: {
    width: '100%',
    maxWidth: scale(400),
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
    borderRadius: scale(12),
    padding: verticalScale(isSmallScreen ? 14 : 18),
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  startJobButton: {
    marginBottom: verticalScale(16),
  },
  recordButtonContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: scale(400),
    marginTop: verticalScale(isSmallScreen ? 4 : 8),
    marginBottom: verticalScale(isSmallScreen ? 4 : 8),
  },
  recordButton: {
    width: scale(isSmallScreen ? 52 : 64),
    height: scale(isSmallScreen ? 52 : 64),
    borderRadius: scale(isSmallScreen ? 26 : 32),
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#b45555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonActive: {
    backgroundColor: 'rgba(180, 85, 85, 0.15)',
    borderColor: '#994444',
  },
  recordButtonPressed: {
    backgroundColor: 'rgba(180, 85, 85, 0.25)',
    borderColor: '#c06666',
    shadowColor: '#b45555',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  recordingHint: {
    marginTop: verticalScale(10),
    fontSize: moderateScale(isSmallScreen ? 12 : 14),
    color: '#b45555',
    fontWeight: '500',
  },
  endButtonContainer: {
    width: '100%',
    maxWidth: scale(400),
    alignItems: 'center',
  },
  endButton: {
    borderColor: '#0a0a0a',
  },
  endJobButton: {
    marginBottom: verticalScale(16),
  },
  postSessionContainer: {
    width: '100%',
    maxWidth: scale(400),
  },
  postSessionContainerFlex: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: verticalScale(16),
  },
  choiceButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
    borderRadius: scale(12),
    padding: verticalScale(isSmallScreen ? 14 : 18),
    alignItems: 'center',
  },
  clockOutChoiceButton: {
    borderColor: '#dc2626',
  },
  choiceButtonText: {
    fontSize: moderateScale(isSmallScreen ? 16 : 18),
    fontWeight: '600',
    color: '#0a0a0a',
    letterSpacing: 0.3,
  },
  clockOutChoiceText: {
    fontSize: moderateScale(isSmallScreen ? 16 : 18),
    fontWeight: '600',
    color: '#dc2626',
    letterSpacing: 0.3,
  },
  todayEntriesContainer: {
    width: '100%',
    marginTop: verticalScale(20),
    flex: 0.6,
  },
  todayEntriesContainerFlex: {
    width: '100%',
    flex: 1,
    marginTop: verticalScale(10),
  },
  todayEntriesTitle: {
    fontSize: moderateScale(isSmallScreen ? 13 : 15),
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: verticalScale(12),
    letterSpacing: -0.3,
  },
  todayEntriesBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: scale(12),
    padding: scale(isSmallScreen ? 8 : 12),
    backgroundColor: '#fafafa',
  },
  todayEntriesList: {
    flex: 1,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: scale(10),
    padding: scale(isSmallScreen ? 10 : 14),
    marginBottom: verticalScale(10),
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  entryTime: {
    fontSize: moderateScale(isSmallScreen ? 12 : 14),
    fontWeight: '500',
    color: '#0a0a0a',
  },
  entryDuration: {
    fontSize: moderateScale(isSmallScreen ? 12 : 14),
    fontWeight: '600',
    color: '#6b7280',
  },
  entryNotes: {
    fontSize: moderateScale(isSmallScreen ? 12 : 14),
    color: '#374151',
    marginBottom: verticalScale(8),
  },
  entryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
  },
  entryTag: {
    fontSize: moderateScale(isSmallScreen ? 10 : 12),
    color: '#6b7fa3',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: scale(4),
    overflow: 'hidden',
  },
  categoryTag: {
    color: '#8b9dc3',
  },
  clockOutButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: scale(12),
    padding: verticalScale(isSmallScreen ? 14 : 18),
    alignItems: 'center',
  },
  clockOutButtonText: {
    color: '#dc2626',
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  titleWithDivider: {
    marginTop: verticalScale(isSmallScreen ? -40 : -60),
    marginBottom: verticalScale(16),
  },
  titleDivider: {
    width: '100%',
    maxWidth: scale(400),
    height: 1,
    backgroundColor: '#e5e5e5',
    marginBottom: verticalScale(isSmallScreen ? 16 : 24),
  },
  clockInButton: {
    width: '100%',
    maxWidth: scale(400),
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#4a9f7e',
    borderRadius: scale(12),
    padding: verticalScale(isSmallScreen ? 14 : 18),
    alignItems: 'center',
    marginTop: verticalScale(12),
  },
  clockInButtonText: {
    color: '#4a9f7e',
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  clockOutConfirmationContainer: {
    flex: 1,
    width: '100%',
    maxWidth: scale(400),
    paddingTop: verticalScale(isSmallScreen ? 10 : 20),
  },
  motivatingMessage: {
    fontSize: moderateScale(isSmallScreen ? 20 : 24),
    fontWeight: '600',
    color: '#0a0a0a',
    textAlign: 'center',
    marginBottom: verticalScale(isSmallScreen ? 12 : 20),
    letterSpacing: -0.5,
  },
  workSummary: {
    alignItems: 'center',
    marginBottom: verticalScale(isSmallScreen ? 12 : 20),
  },
  summaryText: {
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    color: '#374151',
    textAlign: 'center',
    lineHeight: verticalScale(isSmallScreen ? 20 : 24),
  },
  summaryHighlight: {
    fontWeight: '600',
    color: '#0a0a0a',
  },
  confirmationPrompt: {
    fontSize: moderateScale(isSmallScreen ? 13 : 15),
    fontWeight: '600',
    color: '#0a0a0a',
    textAlign: 'center',
    marginBottom: verticalScale(4),
  },
  swipeHint: {
    fontSize: moderateScale(isSmallScreen ? 11 : 13),
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: verticalScale(12),
  },
  confirmationEntriesContainer: {
    flex: 1,
    marginBottom: verticalScale(16),
  },
  noEntriesText: {
    fontSize: moderateScale(isSmallScreen ? 12 : 14),
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: verticalScale(20),
  },
  submitButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
    borderRadius: scale(12),
    padding: verticalScale(isSmallScreen ? 14 : 18),
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#0a0a0a',
    fontSize: moderateScale(isSmallScreen ? 14 : 16),
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(24),
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: scale(16),
    padding: scale(24),
    width: '100%',
    maxWidth: scale(340),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: '600',
    color: '#0a0a0a',
    textAlign: 'center',
    marginBottom: verticalScale(12),
    letterSpacing: -0.3,
  },
  modalText: {
    fontSize: moderateScale(15),
    color: '#374151',
    textAlign: 'center',
    lineHeight: moderateScale(22),
    marginBottom: verticalScale(8),
  },
  modalTextSecondary: {
    fontSize: moderateScale(13),
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: moderateScale(19),
    marginBottom: verticalScale(20),
  },
  modalPrimaryButton: {
    backgroundColor: '#0a0a0a',
    borderRadius: scale(10),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  modalSecondaryButton: {
    paddingVertical: verticalScale(10),
    alignItems: 'center',
  },
  modalSecondaryButtonText: {
    color: '#6b7280',
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
});
