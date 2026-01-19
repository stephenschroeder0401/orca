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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { ChevronRight, Mic } from 'lucide-react-native';

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
  unit_name: string;
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

      const { data: userAccount } = await supabase
        .from('user_account')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      if (!userAccount?.client_id) return;

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

  async function fetchTodayEntries(calculateTotals = false) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get start of today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', today.toISOString())
        .order('start_time', { ascending: false });

      if (error) throw error;
      setTodayEntries(data || []);

      // Calculate totals if requested (for clock out confirmation)
      if (calculateTotals && data) {
        let workedMinutes = 0;
        let billedMinutes = 0;

        data.forEach((entry: TimeEntry) => {
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
    if (!task.trim()) return;

    try {
      // Start job via context (auto-clocks in if needed, then starts task)
      await startJob({
        notes: task,
        propertyId: selectedProperty?.value,
        billingCategoryId: selectedBillingCategory?.value,
        unitId: selectedUnit?.value,
      });

      setStartTime(new Date());
      setViewState('active');
    } catch (error: any) {
      console.error('Error starting session:', error);
      Alert.alert('Error', error.message || 'Failed to start session');
    }
  }

  async function handleClockIn() {
    try {
      await clockIn();
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
      await clockOut();

      // Pick a random motivating message
      const randomMessage = MOTIVATING_MESSAGES[Math.floor(Math.random() * MOTIVATING_MESSAGES.length)];
      setMotivatingMessage(randomMessage);

      // Reset state
      setStartTime(null);
      setElapsedSeconds(0);
      setTask('');
      setSelectedProperty(undefined);
      setSelectedBillingCategory(undefined);
      setSelectedUnit(undefined);
      setUnits([]);

      // Fetch today's entries and calculate totals
      await fetchTodayEntries(true);

      // Show the clock out confirmation screen
      setViewState('clock_out_confirmation');
    } catch (error: any) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', error.message || 'Failed to clock out');
    }
  }

  function handleSubmitDay() {
    // Clear the confirmation screen and return to setup
    setViewState('setup');
    setTodayEntries([]);
    setTotalWorkedMinutes(0);
    setTotalBilledMinutes(0);
    setMotivatingMessage('');
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
                        label={unit.unit_name}
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

        {/* Notes Input */}
        <TextInput
          style={styles.input}
          placeholder="What are you working on?"
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
              <Mic size={28} color={isRecording ? '#994444' : '#b45555'} />
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
              {isClockedIn ? 'What are you working on?' : 'Clock in to start'}
            </Text>
          </Animated.View>
          <View style={styles.titleDivider} />

          {renderTaskForm()}
        </View>

        {/* Bottom Buttons - Pinned to Bottom */}
        <View style={styles.bottomButtonContainer}>
          {/* Start Job Button */}
          <TouchableOpacity
            style={[styles.button, styles.startJobButton, !task.trim() && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={!task.trim()}
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
                <Mic size={28} color={isRecording ? '#994444' : '#b45555'} />
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

      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Swipe indicator for time history - show on setup, active, and post_session views */}
      {viewState !== 'clock_out_confirmation' && (
        <View style={styles.swipeIndicator}>
          <Text style={styles.swipeIndicatorText}>History</Text>
          <ChevronRight size={14} color="#c4c4c4" />
        </View>
      )}
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
    right: 16,
    top: 100,
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.6,
  },
  swipeIndicatorText: {
    fontSize: 10,
    color: '#c4c4c4',
    fontWeight: '500',
    letterSpacing: 0.3,
    marginRight: 2,
  },
  fullHeightContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '20%',
  },
  postSessionMainContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 20,
  },
  bottomButtonContainer: {
    width: '100%',
    paddingBottom: 20,
  },
  bottomDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e5e5e5',
    marginBottom: 16,
  },
  clockOutButtonSpaced: {
    marginTop: 12,
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
  content: {
    flex: 1,
    alignItems: 'center',
    padding: 32,
    paddingTop: 100,
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
  activeNotesInput: {
    width: '100%',
    maxWidth: 400,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#0a0a0a',
    textAlignVertical: 'top',
    marginBottom: 16,
    backgroundColor: '#fff',
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
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleSpaced: {
    marginBottom: 24,
  },
  input: {
    width: '100%',
    maxWidth: 400,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#0a0a0a',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  pickerContainer: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 12,
  },
  propertyUnitRow: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 400,
    marginBottom: 12,
    gap: 8,
  },
  pickerProperty: {
    flex: 3,
    minWidth: 0,
  },
  pickerUnit: {
    flex: 1,
    minWidth: 100,
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
  startJobButton: {
    marginBottom: 16,
  },
  recordButtonContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    marginTop: 8,
    marginBottom: 8,
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    marginTop: 10,
    fontSize: 14,
    color: '#b45555',
    fontWeight: '500',
  },
  endButtonContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  endButton: {
    borderColor: '#0a0a0a',
  },
  endJobButton: {
    marginBottom: 16,
  },
  postSessionContainer: {
    width: '100%',
    maxWidth: 400,
  },
  postSessionContainerFlex: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: 16,
  },
  choiceButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  clockOutChoiceButton: {
    borderColor: '#dc2626',
  },
  choiceButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0a0a0a',
    letterSpacing: 0.3,
  },
  clockOutChoiceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#dc2626',
    letterSpacing: 0.3,
  },
  todayEntriesContainer: {
    width: '100%',
    marginTop: 20,
    flex: 0.6,
  },
  todayEntriesContainerFlex: {
    width: '100%',
    flex: 1,
    marginTop: 10,
  },
  todayEntriesTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  todayEntriesBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  todayEntriesList: {
    flex: 1,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  entryTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0a0a0a',
  },
  entryDuration: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  entryNotes: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  entryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  entryTag: {
    fontSize: 12,
    color: '#6b7fa3',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
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
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  clockOutButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  titleWithDivider: {
    marginTop: -60,
    marginBottom: 16,
  },
  titleDivider: {
    width: '100%',
    maxWidth: 400,
    height: 1,
    backgroundColor: '#e5e5e5',
    marginBottom: 24,
  },
  clockInButton: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#4a9f7e',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  clockInButtonText: {
    color: '#4a9f7e',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  clockOutConfirmationContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    paddingTop: 20,
  },
  motivatingMessage: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0a0a0a',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  workSummary: {
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
  },
  summaryHighlight: {
    fontWeight: '600',
    color: '#0a0a0a',
  },
  confirmationPrompt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a0a0a',
    textAlign: 'center',
    marginBottom: 4,
  },
  swipeHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmationEntriesContainer: {
    flex: 1,
    marginBottom: 16,
  },
  noEntriesText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
  submitButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
