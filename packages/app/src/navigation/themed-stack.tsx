import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { ThemeProvider, useTheme } from "@react-navigation/native";
import { Stack } from "expo-router";
import { type ReactNode, useMemo } from "react";

interface ThemedStackBaseProps {
  children?: ReactNode;
  screenOptions?: NativeStackNavigationOptions;
}

function ThemedStackBase({ children, screenOptions }: ThemedStackBaseProps) {
  const parentTheme = useTheme();
  const transparentNavigationTheme = useMemo(
    () => ({
      ...parentTheme,
      colors: {
        ...parentTheme.colors,
        background: "transparent",
      },
    }),
    [parentTheme],
  );
  const themedScreenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      ...screenOptions,
      contentStyle: [{ backgroundColor: "transparent" }, screenOptions?.contentStyle],
    }),
    [screenOptions],
  );

  return (
    <ThemeProvider value={transparentNavigationTheme}>
      <Stack screenOptions={themedScreenOptions}>{children}</Stack>
    </ThemeProvider>
  );
}

export const ThemedStack = ThemedStackBase;
