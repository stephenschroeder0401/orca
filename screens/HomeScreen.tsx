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
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
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

interface TodaySession {
  id: string;
  start_time: string;
  end_time: string | null;
  notes: string | null;
  property_id: string | null;
  billing_category_id: string | null;
}

type ViewState = 'setup' | 'active' | 'job_complete';

const CELEBRATION_MESSAGES = [
  'Job complete!',
  'Well done!',
  'Nice work!',
  'Great job!',
  'Finished!',
  'All done!',
];

export default function HomeScreen() {
  const navigation = useNavigation();
  const {
    workdayId,
    clockSessionId,
    isWorkdayActive,
    isClockSessionActive,
    isGpsTracking,
    startJob,
    endJob,
    endWorkday,
  } = useWorkday();

  const [viewState, setViewState] = useState<ViewState>('setup');
  const [celebrationMessage, setCelebrationMessage] = useState(CELEBRATION_MESSAGES[0]);
  const [task, setTask] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Option>(undefined);
  const [selectedBillingCategory, setSelectedBillingCategory] = useState<Option>(undefined);
  const [selectedUnit, setSelectedUnit] = useState<Option>(undefined);

  const [todaySessions, setTodaySessions] = useState<TodaySession[]>([]);

  const gpsPulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Determine view state based on workday context
  useEffect(() => {
    if (isClockSessionActive) {
      setViewState('active');
    } else if (viewState === 'active') {
      // Just ended a job, show completion
      setViewState('job_complete');
      setCelebrationMessage(CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]);
      fetchTodaySessions();
    } else if (!isWorkdayActive) {
      setViewState('setup');
    }
  }, [isClockSessionActive, isWorkdayActive]);

  // Fetch properties and billing categories on mount
  useEffect(() => {
    fetchProperties();
    fetchBillingCategories();
    fetchTodaySessions();
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
      setStartTime(new Date());
    } else if (!isClockSessionActive && startTime) {
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

  async function fetchTodaySessions() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .select('id, start_time, end_time, notes, property_id, billing_category_id')
        .eq('user_id', user.id)
        .gte('start_time', today.toISOString())
        .order('start_time', { ascending: false });

      if (error) throw error;
      setTodaySessions(data || []);
    } catch (error) {
      console.error('Error fetching today sessions:', error);
    }
  }

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

  const canStart = selectedProperty && selectedBillingCategory;

  async function handleStart() {
    if (!canStart) return;

    try {
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

  async function handleEndJob() {
    if (!isClockSessionActive) return;

    try {
      // Fade out current view
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(async () => {
        await endJob();

        // Reset local state
        setStartTime(null);
        setElapsedSeconds(0);
        setIsEditingNotes(false);

        // Fade in job complete view
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    } catch (error: any) {
      console.error('Error stopping session:', error);
      Alert.alert('Error', error.message || 'Failed to stop session');
      fadeAnim.setValue(1);
    }
  }

  async function handleStartNewJob() {
    // Reset form but keep workday active
    setTask('');
    setSelectedProperty(undefined);
    setSelectedBillingCategory(undefined);
    setSelectedUnit(undefined);
    setUnits([]);
    setViewState('setup');
  }

  async function handleClockOut() {
    Alert.alert(
      'Clock Out',
      'This will end your workday and stop GPS tracking. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Fade out
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }).start(async () => {
                await endWorkday();
                setStartTime(null);
                setElapsedSeconds(0);
                setTask('');
                setSelectedProperty(undefined);
                setSelectedBillingCategory(undefined);
                setSelectedUnit(undefined);
                setViewState('setup');

                // Fade in
                Animated.timing(fadeAnim, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }).start();

                // Navigate to history
                navigation.dispatch(DrawerActions.openDrawer());
              });
            } catch (error: any) {
              console.error('Error ending workday:', error);
              Alert.alert('Error', error.message || 'Failed to end workday');
              fadeAnim.setValue(1);
            }
          },
        },
      ]
    );
  }

  async function handleNotesLongPress() {
    if (isClockSessionActive) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsEditingNotes(true);
    }
  }

  async function handleNotesDone() {
    setIsEditingNotes(false);
    // Save notes to the current session
    if (clockSessionId && task) {
      try {
        await supabase
          .schema('orca')
          .from('clock_sessions')
          .update({ notes: task })
          .eq('id', clockSessionId);
      } catch (error) {
        console.error('Error saving notes:', error);
      }
    }
  }

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function formatSessionTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function calculateTodayTotal(): string {
    let totalMinutes = 0;
    todaySessions.forEach(session => {
      if (session.end_time) {
        const start = new Date(session.start_time).getTime();
        const end = new Date(session.end_time).getTime();
        totalMinutes += Math.floor((end - start) / 1000 / 60);
      }
    });
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  const renderSetupView = () => (
    <>
      <Text style={styles.title}>What are you working on?</Text>

      {/* Notes Input */}
      <TextInput
        style={styles.input}
        placeholder="Enter task description (optional)"
        placeholderTextColor="#999"
        value={task}
        onChangeText={setTask}
        multiline
        numberOfLines={3}
      />

      {/* Property Dropdown */}
      <View style={styles.pickerContainer}>
        <Text style={styles.requiredLabel}>Property *</Text>
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

      {/* Unit Dropdown */}
      {selectedProperty && units.length > 0 && (
        <View style={styles.pickerContainer}>
          <Text style={styles.optionalLabel}>Unit (optional)</Text>
          <Select
            value={selectedUnit}
            onValueChange={setSelectedUnit}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a unit..." />
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
      <View style={styles.pickerContainer}>
        <Text style={styles.requiredLabel}>Category *</Text>
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
    </>
  );

  const renderActiveView = () => (
    <>
      {/* Timer */}
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

      {/* Notes - Long press to edit */}
      {isEditingNotes ? (
        <View style={styles.notesEditContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter task description"
            placeholderTextColor="#999"
            value={task}
            onChangeText={setTask}
            multiline
            numberOfLines={3}
            autoFocus
          />
          <TouchableOpacity style={styles.notesDoneButton} onPress={handleNotesDone}>
            <Text style={styles.notesDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Pressable onLongPress={handleNotesLongPress} delayLongPress={500}>
          <View style={styles.notesDisplay}>
            {task ? (
              <Text style={styles.notesText}>{task}</Text>
            ) : (
              <Text style={styles.notesPlaceholder}>Hold to add notes...</Text>
            )}
            <Text style={styles.notesHint}>Hold to edit</Text>
          </View>
        </Pressable>
      )}
    </>
  );

  const renderJobCompleteView = () => (
    <>
      {/* Celebration Message */}
      <Text style={styles.celebrationTitle}>{celebrationMessage}</Text>

      {/* Today's Preview */}
      <View style={styles.todayPreview}>
        <View style={styles.todayHeader}>
          <Text style={styles.todayTitle}>Today</Text>
          <Text style={styles.todayTotal}>{calculateTodayTotal()}</Text>
        </View>
        {todaySessions.slice(0, 3).map((session) => (
          <View key={session.id} style={styles.todaySession}>
            <Text style={styles.todaySessionTime}>
              {formatSessionTime(session.start_time)}
              {session.end_time && ` - ${formatSessionTime(session.end_time)}`}
            </Text>
            {session.notes && (
              <Text style={styles.todaySessionNotes} numberOfLines={1}>
                {session.notes}
              </Text>
            )}
          </View>
        ))}
        {todaySessions.length > 3 && (
          <Text style={styles.todayMore}>+{todaySessions.length - 3} more</Text>
        )}
        {todaySessions.length === 0 && (
          <Text style={styles.todayEmpty}>No jobs recorded yet</Text>
        )}
      </View>
    </>
  );

  const renderBottomBar = () => {
    if (viewState === 'setup') {
      return (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.primaryButton, !canStart && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={!canStart}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>Start</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (viewState === 'active') {
      return (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.endJobButton]}
            onPress={handleEndJob}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>End Job</Text>
          </TouchableOpacity>

          <View style={styles.clockOutDivider} />

          <TouchableOpacity
            style={styles.clockOutButton}
            onPress={handleClockOut}
            activeOpacity={0.7}
          >
            <Text style={styles.clockOutButtonText}>Clock Out</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // job_complete view
    return (
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleStartNewJob}
          activeOpacity={0.7}
        >
          <Text style={styles.primaryButtonText}>Start New Job</Text>
        </TouchableOpacity>

        <View style={styles.clockOutDivider} />

        <TouchableOpacity
          style={styles.clockOutButton}
          onPress={handleClockOut}
          activeOpacity={0.7}
        >
          <Text style={styles.clockOutButtonText}>Clock Out</Text>
        </TouchableOpacity>
      </View>
    );
  };

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

      {/* Main Content */}
      <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {viewState === 'setup' && renderSetupView()}
            {viewState === 'active' && renderActiveView()}
            {viewState === 'job_complete' && renderJobCompleteView()}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Fixed Bottom Bar */}
      {renderBottomBar()}
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
  mainContent: {
    flex: 1,
    marginTop: 100,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 32,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  input: {
    width: '100%',
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
    marginBottom: 16,
  },
  requiredLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  optionalLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 6,
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
  notesEditContainer: {
    width: '100%',
  },
  notesDisplay: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 20,
    minHeight: 80,
  },
  notesText: {
    fontSize: 16,
    color: '#0a0a0a',
    lineHeight: 24,
  },
  notesPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  notesHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 12,
    textAlign: 'right',
  },
  notesDoneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  notesDoneText: {
    color: '#3b82f6',
    fontSize: 15,
    fontWeight: '600',
  },
  celebrationTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0a0a0a',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -0.5,
  },
  todayPreview: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  todayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  todayTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a0a0a',
  },
  todaySession: {
    paddingVertical: 8,
  },
  todaySessionTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  todaySessionNotes: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  todayMore: {
    fontSize: 13,
    color: '#3b82f6',
    marginTop: 8,
    textAlign: 'center',
  },
  todayEmpty: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 16,
  },
  bottomBar: {
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: '#fafafa',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  primaryButton: {
    width: '100%',
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
  primaryButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  endJobButton: {
    borderColor: '#dc2626',
  },
  clockOutDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d1d5db',
    marginVertical: 16,
  },
  clockOutButton: {
    width: '100%',
    padding: 14,
    alignItems: 'center',
  },
  clockOutButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
});
