import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  NativeSelectScrollView,
  type Option,
} from '~/components/ui/select';
import { supabase } from '~/lib/supabase';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const ACTION_WIDTH = 80;

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  property_id: string | null;
  billing_category_id: string | null;
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

interface SwipeableTimeEntryProps {
  item: TimeEntry;
  property?: Property;
  billingCategory?: BillingCategory;
  properties: Property[];
  billingCategories: BillingCategory[];
  onDelete: (id: string) => void;
  onAnimatedDelete?: (id: string) => void;
  onEdit: (id: string) => void;
  onUpdate: () => void;
  formatDate: (dateString: string) => string;
  formatTime: (dateString: string) => string;
  formatDuration: (startTs: string, endTs: string | null) => string;
}

export default function SwipeableTimeEntry({
  item,
  property,
  billingCategory,
  properties,
  billingCategories,
  onDelete,
  onAnimatedDelete,
  onUpdate,
  formatDate,
  formatTime,
  formatDuration,
}: SwipeableTimeEntryProps) {
  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(1); // 1 = full height, 0 = collapsed
  const isDeleting = useSharedValue(false);

  // Expanded state
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedNotes, setEditedNotes] = useState(item.notes || '');
  // Structured time state
  const [startHour, setStartHour] = useState(() => {
    const d = new Date(item.start_time);
    let h = d.getHours() % 12;
    return h === 0 ? '12' : String(h);
  });
  const [startMinute, setStartMinute] = useState(() => {
    const d = new Date(item.start_time);
    return String(d.getMinutes()).padStart(2, '0');
  });
  const [startMeridiem, setStartMeridiem] = useState(() => {
    const d = new Date(item.start_time);
    return d.getHours() >= 12 ? 'PM' : 'AM';
  });
  const [endHour, setEndHour] = useState(() => {
    if (!item.end_time) return '';
    const d = new Date(item.end_time);
    let h = d.getHours() % 12;
    return h === 0 ? '12' : String(h);
  });
  const [endMinute, setEndMinute] = useState(() => {
    if (!item.end_time) return '';
    const d = new Date(item.end_time);
    return String(d.getMinutes()).padStart(2, '0');
  });
  const [endMeridiem, setEndMeridiem] = useState(() => {
    if (!item.end_time) return 'PM';
    const d = new Date(item.end_time);
    return d.getHours() >= 12 ? 'PM' : 'AM';
  });
  const [selectedProperty, setSelectedProperty] = useState<Option>(
    item.property_id && property
      ? { value: item.property_id, label: property.name }
      : undefined
  );
  const [selectedBillingCategory, setSelectedBillingCategory] = useState<Option>(
    item.billing_category_id && billingCategory
      ? { value: item.billing_category_id, label: billingCategory.name }
      : undefined
  );
  const [isSaving, setIsSaving] = useState(false);

  // Convert structured time to Date
  const structuredTimeToDate = (hour: string, minute: string, meridiem: string, originalDate: Date): Date | null => {
    if (!hour || !minute) return null;

    let h = parseInt(hour, 10);
    const m = parseInt(minute, 10);

    if (isNaN(h) || isNaN(m)) return null;

    // Convert to 24-hour
    if (meridiem === 'PM' && h !== 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;

    const result = new Date(originalDate);
    result.setHours(h, m, 0, 0);
    return result;
  };

  // Filter hour input (1-12)
  const filterHour = (text: string): string => {
    const digits = text.replace(/\D/g, '').slice(0, 2);
    const num = parseInt(digits, 10);
    if (num > 12) return '12';
    return digits;
  };

  // Filter minute input (00-59)
  const filterMinute = (text: string): string => {
    const digits = text.replace(/\D/g, '').slice(0, 2);
    const num = parseInt(digits, 10);
    if (num > 59) return '59';
    return digits;
  };

  // Calculate duration from edited times
  const getEditedDuration = (): string => {
    const startDate = structuredTimeToDate(startHour, startMinute, startMeridiem, new Date(item.start_time));
    const endDate = endHour && endMinute
      ? structuredTimeToDate(endHour, endMinute, endMeridiem, item.end_time ? new Date(item.end_time) : new Date(item.start_time))
      : null;

    if (!startDate || !endDate) {
      return formatDuration(item.start_time, item.end_time);
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    if (diffMs < 0) return '0m';

    const totalMinutes = Math.floor(diffMs / 1000 / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Track if changes were made
  const hasChanges = () => {
    const origStart = new Date(item.start_time);
    const origStartHour = origStart.getHours() % 12 || 12;
    const origStartMin = origStart.getMinutes();
    const origStartMer = origStart.getHours() >= 12 ? 'PM' : 'AM';

    const origEnd = item.end_time ? new Date(item.end_time) : null;
    const origEndHour = origEnd ? (origEnd.getHours() % 12 || 12) : '';
    const origEndMin = origEnd ? origEnd.getMinutes() : '';
    const origEndMer = origEnd ? (origEnd.getHours() >= 12 ? 'PM' : 'AM') : 'PM';

    return (
      editedNotes !== (item.notes || '') ||
      startHour !== String(origStartHour) ||
      startMinute !== String(origStartMin).padStart(2, '0') ||
      startMeridiem !== origStartMer ||
      endHour !== String(origEndHour) ||
      endMinute !== (origEndMin !== '' ? String(origEndMin).padStart(2, '0') : '') ||
      endMeridiem !== origEndMer ||
      (selectedProperty?.value || null) !== item.property_id ||
      (selectedBillingCategory?.value || null) !== item.billing_category_id
    );
  };

  const handleDelete = () => {
    onDelete(item.id);
  };

  const handleAnimatedDelete = () => {
    // Animate height collapse, then call delete callback
    itemHeight.value = withTiming(0, { duration: 250 }, () => {
      if (onAnimatedDelete) {
        runOnJS(onAnimatedDelete)(item.id);
      } else {
        runOnJS(onDelete)(item.id);
      }
    });
  };

  const handleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(true);
  };

  const handleCollapse = async () => {
    if (hasChanges() && !isSaving) {
      await saveChanges();
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(false);
  };

  const saveChanges = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const updateData: any = {
        notes: editedNotes || null,
        property_id: selectedProperty?.value || null,
        billing_category_id: selectedBillingCategory?.value || null,
      };

      // Parse and update start time
      const newStartTime = structuredTimeToDate(startHour, startMinute, startMeridiem, new Date(item.start_time));
      if (newStartTime) {
        updateData.start_time = newStartTime.toISOString();
      }

      // Parse and update end time
      if (endHour && endMinute) {
        const originalEndDate = item.end_time ? new Date(item.end_time) : new Date(item.start_time);
        const newEndTime = structuredTimeToDate(endHour, endMinute, endMeridiem, originalEndDate);
        if (newEndTime) {
          updateData.end_time = newEndTime.toISOString();
        }
      } else if (item.end_time && !endHour) {
        // If end time was cleared, set to null (mark as in progress)
        updateData.end_time = null;
      }

      const { error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .update(updateData)
        .eq('id', item.id);

      if (error) throw error;

      // Notify parent to refresh
      onUpdate();
    } catch (error) {
      console.error('Error saving time entry:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .enabled(!isExpanded)
    .onUpdate((event) => {
      if (isDeleting.value) return;
      if (event.translationX < 0) {
        // Allow swiping all the way left
        translateX.value = event.translationX;
      } else {
        translateX.value = Math.max(0, event.translationX * 0.2);
      }
    })
    .onEnd((event) => {
      if (isDeleting.value) return;
      // If swiped past threshold, delete the entry
      if (event.translationX < -SWIPE_THRESHOLD) {
        isDeleting.value = true;
        // Animate off screen then collapse height
        translateX.value = withSpring(-SCREEN_WIDTH, {
          damping: 20,
          stiffness: 200,
        }, () => {
          runOnJS(handleAnimatedDelete)();
        });
      } else {
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 200,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Container style for height collapse animation
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: itemHeight.value,
    transform: [{ scaleY: itemHeight.value }],
    marginBottom: interpolate(itemHeight.value, [0, 1], [0, 12]),
  }));

  // Red delete indicator style - appears as you swipe left
  const deleteIndicatorStyle = useAnimatedStyle(() => {
    const swipeProgress = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity: swipeProgress * 0.6,
    };
  });

  // Expanded view - same card, just with editable fields
  if (isExpanded) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.entryCard} onPress={handleCollapse}>
          {/* Header - tap to collapse */}
          <View style={styles.entryHeader}>
            <Text style={styles.entryDate}>{formatDate(item.start_time)}</Text>
            <Text style={styles.entryDuration}>
              {getEditedDuration()}
            </Text>
          </View>

          {/* Start Time - structured */}
          <View style={styles.timeRow}>
            <View style={styles.timeGroup}>
              <TextInput
                style={styles.timeInputSmall}
                value={startHour}
                onChangeText={(t) => setStartHour(filterHour(t))}
                placeholder="9"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                style={styles.timeInputSmall}
                value={startMinute}
                onChangeText={(t) => setStartMinute(filterMinute(t))}
                placeholder="00"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Pressable
                style={styles.meridiemToggle}
                onPress={() => setStartMeridiem(startMeridiem === 'AM' ? 'PM' : 'AM')}
              >
                <Text style={styles.meridiemText}>{startMeridiem}</Text>
              </Pressable>
            </View>

            <Text style={styles.timeSeparator}>-</Text>

            {/* End Time - structured */}
            <View style={styles.timeGroup}>
              <TextInput
                style={styles.timeInputSmall}
                value={endHour}
                onChangeText={(t) => setEndHour(filterHour(t))}
                placeholder="5"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                style={styles.timeInputSmall}
                value={endMinute}
                onChangeText={(t) => setEndMinute(filterMinute(t))}
                placeholder="00"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Pressable
                style={styles.meridiemToggle}
                onPress={() => setEndMeridiem(endMeridiem === 'AM' ? 'PM' : 'AM')}
              >
                <Text style={styles.meridiemText}>{endMeridiem}</Text>
              </Pressable>
            </View>
          </View>

          {/* Notes - editable */}
          <TextInput
            style={styles.notesInput}
            value={editedNotes}
            onChangeText={setEditedNotes}
            placeholder="Add notes..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={2}
          />

          {/* Property Dropdown */}
          <View style={styles.selectContainer}>
            <Select
              value={selectedProperty}
              onValueChange={setSelectedProperty}
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

          {/* Billing Category Dropdown */}
          <View style={styles.selectContainer}>
            <Select
              value={selectedBillingCategory}
              onValueChange={setSelectedBillingCategory}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                <NativeSelectScrollView>
                  {billingCategories.map((bc) => (
                    <SelectItem
                      key={bc.id}
                      value={bc.id}
                      label={bc.name}
                    />
                  ))}
                </NativeSelectScrollView>
              </SelectContent>
            </Select>
          </View>
        </Pressable>
      </View>
    );
  }

  // Collapsed view - original card
  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Red delete indicator behind the card */}
      <Animated.View style={[styles.deleteIndicator, deleteIndicatorStyle]} />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.entryCard, animatedStyle]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              translateX.value = withSpring(0);
              handleExpand();
            }}
          >
            <View style={styles.entryHeader}>
              <Text style={styles.entryDate}>{formatDate(item.start_time)}</Text>
              <Text style={styles.entryDuration}>
                {formatDuration(item.start_time, item.end_time)}
              </Text>
            </View>

            <View style={styles.entryTime}>
              <Text style={styles.entryTimeText}>
                {formatTime(item.start_time)} - {item.end_time ? formatTime(item.end_time) : 'In Progress'}
              </Text>
            </View>

            {item.notes && (
              <Text style={styles.entryNotes}>{item.notes}</Text>
            )}

            <View style={styles.entryDetails}>
              {property && (
                <View style={styles.entryDetail}>
                  <Text style={styles.entryDetailLabel}>Property</Text>
                  <Text style={styles.entryDetailValue}>{property.name}</Text>
                </View>
              )}
              {billingCategory && (
                <View style={styles.entryDetail}>
                  <Text style={styles.entryDetailLabel}>Category</Text>
                  <Text style={styles.entryDetailValue}>
                    {billingCategory.name}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    overflow: 'hidden',
  },
  deleteIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  entryDuration: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0a0a0a',
    letterSpacing: -0.5,
  },
  entryTime: {
    marginBottom: 12,
  },
  entryTimeText: {
    fontSize: 13,
    color: '#666',
  },
  entryNotes: {
    fontSize: 14,
    color: '#0a0a0a',
    marginBottom: 12,
    lineHeight: 20,
  },
  entryDetails: {
    gap: 8,
  },
  entryDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryDetailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    minWidth: 70,
  },
  entryDetailValue: {
    fontSize: 13,
    color: '#0a0a0a',
    flex: 1,
  },
  // Expanded edit styles
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0a0a0a',
    textAlign: 'center',
  },
  timeSeparator: {
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#666',
  },
  notesInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0a0a0a',
    minHeight: 50,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  selectContainer: {
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timeInputSmall: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#0a0a0a',
    textAlign: 'center',
    minWidth: 40,
  },
  timeColon: {
    fontSize: 15,
    color: '#0a0a0a',
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  meridiemToggle: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginLeft: 6,
  },
  meridiemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});
