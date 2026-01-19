import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Card, CardContent } from '~/components/ui/card';
import { Trash2 } from 'lucide-react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DELETE_BUTTON_WIDTH = 80;
const AUTO_DELETE_THRESHOLD = SCREEN_WIDTH * 0.7;

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  property_id: string | null;
  billing_category_id: string | null;
  unit_id: string | null;
  notes: string | null;
}

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

interface SwipeableTimeEntryProps {
  item: TimeEntry;
  property?: Property;
  billingCategory?: BillingCategory;
  unit?: PropertyUnit;
  properties?: Property[];
  billingCategories?: BillingCategory[];
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<TimeEntry>) => Promise<void>;
  formatTime: (dateString: string) => string;
  formatDuration: (startTs: string, endTs: string | null) => string;
}

export default function SwipeableTimeEntry({
  item,
  property,
  billingCategory,
  unit,
  properties = [],
  billingCategories = [],
  onDelete,
  onUpdate,
  formatTime,
  formatDuration,
}: SwipeableTimeEntryProps) {
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const isDeleting = useSharedValue(false);

  // Press state for visual feedback
  const [isPressed, setIsPressed] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null);
  const [editedStartTime, setEditedStartTime] = useState(new Date(item.start_time));
  const [editedEndTime, setEditedEndTime] = useState(
    item.end_time ? new Date(item.end_time) : null
  );
  const [editedNotes, setEditedNotes] = useState(item.notes || '');

  // Find initial property and category for Option type
  const initialProperty = properties.find(p => p.id === item.property_id);
  const initialCategory = billingCategories.find(c => c.id === item.billing_category_id);
  const [selectedProperty, setSelectedProperty] = useState<Option>(
    initialProperty ? { value: initialProperty.id, label: initialProperty.name } : undefined
  );
  const [selectedCategory, setSelectedCategory] = useState<Option>(
    initialCategory ? { value: initialCategory.id, label: initialCategory.name } : undefined
  );

  // Unit state - populated based on selected property
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Option>(undefined);

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

        // If we have an initial unit_id that matches, set it
        if (item.unit_id) {
          const matchingUnit = data?.find(u => u.id === item.unit_id);
          if (matchingUnit) {
            setSelectedUnit({ value: matchingUnit.id, label: matchingUnit.unit_name });
          }
        }
      } catch (error) {
        console.error('Error fetching units:', error);
      }
    }

    fetchUnits();
  }, [selectedProperty?.value]);

  const handleDelete = () => {
    onDelete(item.id);
  };

  const handleLongPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsEditing(true);
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setEditingField(null);
    }

    if (selectedDate) {
      if (editingField === 'start') {
        setEditedStartTime(selectedDate);
      } else if (editingField === 'end') {
        setEditedEndTime(selectedDate);
      }
    }
  };

  const handleDoneEditingTime = () => {
    setEditingField(null);
  };

  const handleSaveChanges = async () => {
    if (!onUpdate) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);

    // Build the updates object with only changed values
    const updates: Partial<TimeEntry> = {};

    // Check if times changed
    if (editedStartTime.toISOString() !== item.start_time) {
      updates.start_time = editedStartTime.toISOString();
    }
    if (editedEndTime?.toISOString() !== item.end_time) {
      updates.end_time = editedEndTime?.toISOString() || null;
    }

    // Check if notes changed
    if (editedNotes !== (item.notes || '')) {
      updates.notes = editedNotes || null;
    }

    // Check if property changed
    const newPropertyId = selectedProperty?.value || null;
    if (newPropertyId !== item.property_id) {
      updates.property_id = newPropertyId;
    }

    // Check if unit changed
    const newUnitId = selectedUnit?.value || null;
    if (newUnitId !== item.unit_id) {
      updates.unit_id = newUnitId;
    }

    // Check if category changed
    const newCategoryId = selectedCategory?.value || null;
    if (newCategoryId !== item.billing_category_id) {
      updates.billing_category_id = newCategoryId;
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      try {
        await onUpdate(item.id, updates);
        setIsEditing(false);
      } catch (error) {
        console.error('Error saving changes:', error);
        // Keep editing mode open so user can retry
      }
    } else {
      setIsEditing(false);
    }

    setIsSaving(false);
  };

  const formatEditTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const confirmDelete = () => {
    isDeleting.value = true;
    translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 }, () => {
      runOnJS(handleDelete)();
    });
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      if (isDeleting.value) return;
      const newX = startX.value + event.translationX;
      translateX.value = Math.min(0, newX);
    })
    .onEnd(() => {
      if (isDeleting.value) return;

      if (translateX.value < -AUTO_DELETE_THRESHOLD) {
        isDeleting.value = true;
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 }, () => {
          runOnJS(handleDelete)();
        });
      } else if (translateX.value < -DELETE_BUTTON_WIDTH / 2) {
        translateX.value = withSpring(-DELETE_BUTTON_WIDTH, {
          damping: 20,
          stiffness: 200,
        });
      } else {
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 200,
        });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.wrapper}>
      {/* Delete button - positioned absolutely behind the card */}
      <View style={styles.deleteButtonContainer}>
        <Pressable onPress={confirmDelete} style={styles.deleteButtonPressable}>
          <Trash2 size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Card - slides left to reveal delete button */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          <Pressable
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}
            onLongPress={handleLongPress}
            delayLongPress={500}
          >
            <Card style={isPressed && !isEditing && styles.cardPressed}>
              <CardContent className="p-3" style={isPressed && !isEditing && styles.contentPressed}>
                {isEditing ? (
                  // Edit Mode
                  <View>
                    {/* Tappable time row */}
                    <View style={styles.editTimeRow}>
                      <Pressable
                        onPress={async () => {
                          await Haptics.selectionAsync();
                          setEditingField('start');
                        }}
                        style={[
                          styles.editTimeButton,
                          editingField === 'start' && styles.editTimeButtonActive,
                        ]}
                      >
                        <Text style={styles.editTimeLabel}>Start</Text>
                        <Text style={styles.editTimeValue}>{formatEditTime(editedStartTime)}</Text>
                      </Pressable>

                      <Text style={styles.editTimeSeparator}>→</Text>

                      <Pressable
                        onPress={async () => {
                          if (editedEndTime) {
                            await Haptics.selectionAsync();
                            setEditingField('end');
                          }
                        }}
                        style={[
                          styles.editTimeButton,
                          editingField === 'end' && styles.editTimeButtonActive,
                          !editedEndTime && styles.editTimeButtonDisabled,
                        ]}
                      >
                        <Text style={styles.editTimeLabel}>End</Text>
                        <Text style={[styles.editTimeValue, !editedEndTime && styles.inProgressText]}>
                          {editedEndTime ? formatEditTime(editedEndTime) : 'In Progress'}
                        </Text>
                      </Pressable>
                    </View>

                    {/* Time picker - only shows when a field is selected */}
                    {editingField && (
                      <View style={styles.pickerContainer}>
                        <DateTimePicker
                          value={editingField === 'start' ? editedStartTime : (editedEndTime || new Date())}
                          mode="time"
                          display="spinner"
                          onChange={handleTimeChange}
                          style={styles.timePicker}
                        />
                        {Platform.OS === 'ios' && (
                          <Pressable
                            onPress={async () => {
                              await Haptics.selectionAsync();
                              handleDoneEditingTime();
                            }}
                            style={styles.doneButton}
                          >
                            <Text style={styles.doneButtonText}>Done</Text>
                          </Pressable>
                        )}
                      </View>
                    )}

                    {/* Notes input */}
                    {!editingField && (
                      <View style={styles.notesSection}>
                        <Text style={styles.notesLabel}>Notes</Text>
                        <TextInput
                          style={styles.notesInput}
                          value={editedNotes}
                          onChangeText={setEditedNotes}
                          placeholder="Add notes..."
                          placeholderTextColor="#999"
                          multiline
                        />
                      </View>
                    )}

                    {/* Property picker */}
                    {!editingField && properties.length > 0 && (
                      <View style={styles.pickerSection}>
                        <Text style={styles.pickerLabel}>Property</Text>
                        <Select
                          value={selectedProperty}
                          onValueChange={(value) => {
                            Haptics.selectionAsync();
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
                              {properties.map((p) => (
                                <SelectItem
                                  key={p.id}
                                  value={p.id}
                                  label={p.name}
                                />
                              ))}
                            </NativeSelectScrollView>
                          </SelectContent>
                        </Select>
                      </View>
                    )}

                    {/* Unit picker - only shows when property is selected and has units */}
                    {!editingField && selectedProperty && units.length > 0 && (
                      <View style={styles.pickerSection}>
                        <Text style={styles.pickerLabel}>Unit (Optional)</Text>
                        <Select
                          value={selectedUnit}
                          onValueChange={(value) => {
                            Haptics.selectionAsync();
                            setSelectedUnit(value);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a unit..." />
                          </SelectTrigger>
                          <SelectContent>
                            <NativeSelectScrollView>
                              {units.map((u) => (
                                <SelectItem
                                  key={u.id}
                                  value={u.id}
                                  label={u.unit_name}
                                />
                              ))}
                            </NativeSelectScrollView>
                          </SelectContent>
                        </Select>
                      </View>
                    )}

                    {/* Category picker */}
                    {!editingField && billingCategories.length > 0 && (
                      <View style={styles.pickerSection}>
                        <Text style={styles.pickerLabel}>Category</Text>
                        <Select
                          value={selectedCategory}
                          onValueChange={(value) => {
                            Haptics.selectionAsync();
                            setSelectedCategory(value);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <NativeSelectScrollView>
                              {billingCategories.map((c) => (
                                <SelectItem
                                  key={c.id}
                                  value={c.id}
                                  label={c.name}
                                />
                              ))}
                            </NativeSelectScrollView>
                          </SelectContent>
                        </Select>
                      </View>
                    )}

                    {/* Exit edit mode / Save changes */}
                    {!editingField && (
                      <Pressable
                        onPress={async () => {
                          await Haptics.selectionAsync();
                          await handleSaveChanges();
                        }}
                        style={[styles.exitEditButton, isSaving && styles.exitEditButtonDisabled]}
                        disabled={isSaving}
                      >
                        <Text style={styles.exitEditText}>
                          {isSaving ? 'Saving...' : 'Done Editing'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  // View Mode
                  <>
                    <View style={styles.header}>
                      <Text style={[styles.timeRange, isPressed && styles.textPressed]}>
                        {formatTime(item.start_time)} -{' '}
                        {item.end_time ? formatTime(item.end_time) : 'In Progress'}
                      </Text>
                      <Text style={[styles.duration, isPressed && styles.textPressed]}>
                        {formatDuration(item.start_time, item.end_time)}
                      </Text>
                    </View>

                    {item.notes && <Text style={[styles.notes, isPressed && styles.textPressed]}>{item.notes}</Text>}

                    {(property || unit || billingCategory) && (
                      <View style={styles.details}>
                        {property && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Property</Text>
                            <Text style={[styles.detailValue, isPressed && styles.textPressed]}>{property.name}</Text>
                          </View>
                        )}
                        {unit && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Unit</Text>
                            <Text style={[styles.detailValue, isPressed && styles.textPressed]}>{unit.unit_name}</Text>
                          </View>
                        )}
                        {billingCategory && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Category</Text>
                            <Text style={[styles.detailValue, isPressed && styles.textPressed]}>
                              {billingCategory.name}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
    position: 'relative',
  },
  cardPressed: {
    borderColor: '#d1d5db',
    borderWidth: 2,
  },
  contentPressed: {
    opacity: 0.6,
  },
  textPressed: {
    color: '#6b7280',
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonPressable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeRange: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  duration: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a0a0a',
  },
  notes: {
    fontSize: 14,
    color: '#0a0a0a',
    marginTop: 8,
    lineHeight: 20,
  },
  details: {
    marginTop: 8,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 70,
  },
  detailValue: {
    fontSize: 13,
    color: '#0a0a0a',
    flex: 1,
  },
  // Edit mode styles
  editTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editTimeButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  editTimeButtonActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#3b82f6',
    borderWidth: 1,
  },
  editTimeButtonDisabled: {
    opacity: 0.5,
  },
  editTimeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editTimeValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  editTimeSeparator: {
    fontSize: 16,
    color: '#999',
    marginHorizontal: 12,
  },
  inProgressText: {
    color: '#3b82f6',
  },
  pickerContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  timePicker: {
    height: 150,
    width: '100%',
  },
  doneButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  exitEditButton: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  exitEditButtonDisabled: {
    opacity: 0.5,
  },
  exitEditText: {
    color: '#3b82f6',
    fontSize: 15,
    fontWeight: '500',
  },
  notesSection: {
    marginTop: 16,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#0a0a0a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerSection: {
    marginTop: 16,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
