import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function timeStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseTimeLocal(s: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  const d = new Date();
  d.setSeconds(0, 0);
  if (m) {
    d.setHours(Math.min(23, Number(m[1])), Math.min(59, Number(m[2])), 0, 0);
  }
  return d;
}

/**
 * Cross-platform date picker. Value is the canonical YYYY-MM-DD string.
 * Renders an HTML date input on web, native dialog on Android, modal spinner on iOS.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  minDate,
  maxDate,
  testID,
  allowClear = true,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  testID?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === "web") {
    const inputProps: React.InputHTMLAttributes<HTMLInputElement> & { "data-testid"?: string } = {
      type: "date",
      value,
      min: minDate ? localDateStr(minDate) : undefined,
      max: maxDate ? localDateStr(maxDate) : undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value || ""),
      "data-testid": testID,
      style: webInputStyle,
    };
    return React.createElement("input", inputProps);
  }

  const dateValue = value ? parseDateLocal(value) : new Date();

  const onPickerChange = (event: { type?: string }, selected?: Date) => {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event?.type === "set" && selected) onChange(localDateStr(selected));
    } else if (selected) {
      onChange(localDateStr(selected));
    }
  };

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={styles.pickerButton} testID={testID}>
        <Ionicons name="calendar-outline" size={18} color={Colors.brand.blue} />
        <Text style={[styles.pickerText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        {value && allowClear ? (
          <Pressable onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </Pressable>
      {open && Platform.OS === "ios" && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <DateTimePicker
                value={dateValue}
                mode="date"
                display="spinner"
                maximumDate={maxDate}
                minimumDate={minDate}
                onChange={onPickerChange}
              />
              <Pressable
                style={styles.doneBtn}
                onPress={() => {
                  if (!value) onChange(localDateStr(dateValue));
                  setOpen(false);
                }}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          maximumDate={maxDate}
          minimumDate={minDate}
          onChange={onPickerChange}
        />
      )}
    </View>
  );
}

/**
 * Cross-platform time picker. Value is canonical HH:MM (24h).
 */
export function TimePicker({
  value,
  onChange,
  placeholder = "Select a time",
  testID,
  minuteInterval = 5,
  allowClear = true,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  testID?: string;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === "web") {
    const inputProps: React.InputHTMLAttributes<HTMLInputElement> & { "data-testid"?: string } = {
      type: "time",
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value || ""),
      "data-testid": testID,
      style: webInputStyle,
    };
    return React.createElement("input", inputProps);
  }

  const dateValue = parseTimeLocal(value || "12:00");

  const onPickerChange = (event: { type?: string }, selected?: Date) => {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event?.type === "set" && selected) onChange(timeStr(selected));
    } else if (selected) {
      onChange(timeStr(selected));
    }
  };

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={styles.pickerButton} testID={testID}>
        <Ionicons name="time-outline" size={18} color={Colors.brand.blue} />
        <Text style={[styles.pickerText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        {value && allowClear ? (
          <Pressable onPress={() => onChange("")} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </Pressable>
      {open && Platform.OS === "ios" && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <DateTimePicker
                value={dateValue}
                mode="time"
                display="spinner"
                minuteInterval={minuteInterval}
                onChange={onPickerChange}
              />
              <Pressable
                style={styles.doneBtn}
                onPress={() => {
                  if (!value) onChange(timeStr(dateValue));
                  setOpen(false);
                }}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={dateValue}
          mode="time"
          display="default"
          minuteInterval={minuteInterval}
          onChange={onPickerChange}
          is24Hour
        />
      )}
    </View>
  );
}

const webInputStyle = {
  height: 48,
  borderWidth: 1,
  borderColor: "#E5E7EB",
  borderRadius: 8,
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 16,
  fontFamily: "inherit",
  color: "#111827",
  backgroundColor: "#FFFFFF",
  marginBottom: 4,
  width: "100%",
  boxSizing: "border-box" as const,
};

const styles = StyleSheet.create({
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
  },
  pickerText: { flex: 1, fontSize: 16, color: "#111827" },
  placeholder: { color: "#9CA3AF" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  doneBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.brand.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  doneText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
