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
  FlatList,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { supabase } from '~/lib/supabase';
import { useWorkday } from '~/contexts/WorkdayContext';
import SwipeableTimeEntry from '~/components/SwipeableTimeEntry';
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
  const navigation = useNavigation();
  const {
    isClockedIn,
    isClockSessionActive,
    clockIn,
    clockOut,
    startJob,
    endJob,
  } = useWorkday();

  const [task, setTask] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [justEndedSession, setJustEndedSession] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [showClockOutConfirmation, setShowClockOutConfirmation] = useState(false);
  const [motivatingMessage, setMotivatingMessage] = useState('');
  const [totalWorkedMinutes, setTotalWorkedMinutes] = useState(0);
  const [totalBilledMinutes, setTotalBilledMinutes] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Option>(undefined);
  const [selectedBillingCategory, setSelectedBillingCategory] = useState<Option>(undefined);
  const [selectedUnit, setSelectedUnit] = useState<Option>(undefined);

  const slideAnim = useState(new Animated.Value(0))[0];

  // Fetch properties and billing categories on mount
  useEffect(() => {
    fetchProperties();
    fetchBillingCategories();
    fetchTodayEntries();
  }, []);

  // Sync animation with session state (handles app restart with active session)
  useEffect(() => {
    if (isClockSessionActive) {
      slideAnim.setValue(1);
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
      setJustEndedSession(false);
      setShowNewTaskForm(false);

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

      // Stay on this screen and show choice buttons
      setJustEndedSession(true);

      // Fetch today's entries to show below buttons
      fetchTodayEntries();
    } catch (error: any) {
      console.error('Error stopping session:', error);
      Alert.alert('Error', error.message || 'Failed to stop session');
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
      slideAnim.setValue(0);
      setJustEndedSession(false);
      setShowNewTaskForm(false);

      // Fetch today's entries and calculate totals
      await fetchTodayEntries(true);

      // Show the clock out confirmation screen
      setShowClockOutConfirmation(true);
    } catch (error: any) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', error.message || 'Failed to clock out');
    }
  }

  function handleSubmitDay() {
    // Clear the confirmation screen and return to initial state
    setShowClockOutConfirmation(false);
    setTodayEntries([]);
    setTotalWorkedMinutes(0);
    setTotalBilledMinutes(0);
    setMotivatingMessage('');
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

  // Animation interpolations
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

      <View style={[
        styles.content,
        // Center content unless showing the choice screen with today's entries or clock out confirmation
        (isClockSessionActive || !justEndedSession || showNewTaskForm) && !showClockOutConfirmation && styles.contentCentered
      ]}>
          {/* Clock Out Confirmation Screen */}
          {showClockOutConfirmation && (
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
              <View style={styles.confirmationEntriesContainer}>
                <View style={styles.todayEntriesBox}>
                  <ScrollView style={styles.todayEntriesList} nestedScrollEnabled>
                    {todayEntries.map((entry) => {
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
                    })}
                    {todayEntries.length === 0 && (
                      <Text style={styles.noEntriesText}>No time entries for today</Text>
                    )}
                  </ScrollView>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmitDay}
                activeOpacity={0.7}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Timer Section - Active Task */}
          {isClockSessionActive && startTime && !showClockOutConfirmation && (
            <View style={styles.timerSection}>
              <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>

              {task && (
                <Text style={styles.taskNotes} numberOfLines={3}>{task}</Text>
              )}

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

          {/* End Session Button (slides in) */}
          {isClockSessionActive && !showClockOutConfirmation && (
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

          {/* Post-Session Screen - After ending a session */}
          {justEndedSession && !isClockSessionActive && !showClockOutConfirmation && (
            <View style={[styles.postSessionContainer, !showNewTaskForm && styles.postSessionContainerFlex]}>
              {/* Title */}
              <Text style={[styles.title, !showNewTaskForm && styles.titleSpaced]}>What's next?</Text>

              {/* New Task Button or Form */}
              {!showNewTaskForm ? (
                <>
                  <TouchableOpacity
                    style={styles.choiceButton}
                    onPress={() => setShowNewTaskForm(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.choiceButtonText}>New Task</Text>
                  </TouchableOpacity>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Clock Out Button */}
                  <TouchableOpacity
                    style={[styles.choiceButton, styles.clockOutChoiceButton]}
                    onPress={handleClockOut}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clockOutChoiceText}>Clock Out</Text>
                  </TouchableOpacity>

                  {/* Today's Time Entries - Only on choice screen */}
                  {todayEntries.length > 0 && (
                    <View style={styles.todayEntriesContainer}>
                      <Text style={styles.todayEntriesTitle}>Today</Text>
                      <View style={styles.todayEntriesBox}>
                        <ScrollView style={styles.todayEntriesList} nestedScrollEnabled>
                          {todayEntries.map((entry) => {
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
                          })}
                        </ScrollView>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {/* Text Input */}
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
                  <View style={styles.pickerContainer}>
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

                  {/* Start Button */}
                  <TouchableOpacity
                    style={[styles.button, !task.trim() && styles.buttonDisabled]}
                    onPress={handleStart}
                    disabled={!task.trim()}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.buttonText}>Start</Text>
                  </TouchableOpacity>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Clock Out Button */}
                  <TouchableOpacity
                    style={[styles.choiceButton, styles.clockOutChoiceButton]}
                    onPress={handleClockOut}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clockOutChoiceText}>Clock Out</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Normal Flow - Not after ending a session */}
          {!isClockSessionActive && !justEndedSession && !showClockOutConfirmation && (
            <>
              {/* Title */}
              <Text style={[styles.title, !isClockedIn && styles.titleWithDivider]}>
                {isClockedIn ? 'What are you working on?' : 'Clock in to start'}
              </Text>
              {!isClockedIn && <View style={styles.titleDivider} />}

              {/* Text Input */}
              <TextInput
                style={styles.input}
                placeholder="What are you working on?"
                placeholderTextColor="#999"
                value={task}
                onChangeText={setTask}
                multiline
                numberOfLines={3}
              />

              {/* Property Dropdown */}
              <View style={styles.pickerContainer}>
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

              {/* Start Job Button */}
              <TouchableOpacity
                style={[styles.button, !task.trim() && styles.buttonDisabled]}
                onPress={handleStart}
                disabled={!task.trim()}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Start Job</Text>
              </TouchableOpacity>

              {/* Clock In - only when not clocked in */}
              {!isClockedIn && (
                <TouchableOpacity
                  style={styles.clockInButton}
                  onPress={handleClockIn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clockInButtonText}>Clock In</Text>
                </TouchableOpacity>
              )}

              {/* Clock Out - only when clocked in */}
              {isClockedIn && (
                <View style={styles.clockOutSection}>
                  <TouchableOpacity
                    style={styles.clockOutButton}
                    onPress={handleClockOut}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clockOutButtonText}>Clock Out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
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
  content: {
    flex: 1,
    alignItems: 'center',
    padding: 32,
    paddingTop: 100,
  },
  contentCentered: {
    justifyContent: 'center',
  },
  timerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  taskNotes: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 20,
    maxWidth: 350,
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
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleSpaced: {
    marginBottom: 24,
  },
  input: {
    width: '100%',
    maxWidth: 400,
    minHeight: 80,
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
    alignItems: 'center',
  },
  endButton: {
    borderColor: '#dc2626',
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
  clockOutSection: {
    width: '100%',
    maxWidth: 400,
    marginTop: 32,
    alignItems: 'center',
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
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
    borderColor: '#6b7280',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  clockInButtonText: {
    color: '#6b7280',
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
