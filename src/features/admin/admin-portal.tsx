import { View, Text } from "react-native";
export default function AdminPortal() {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 32 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>
        Radefy administration
      </Text>
      <Text style={{ marginTop: 16 }}>
        Open /admin in your browser to manage shops and accounts.
      </Text>
    </View>
  );
}
